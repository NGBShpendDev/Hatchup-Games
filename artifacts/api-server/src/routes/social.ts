import { Router } from "express";
import { db } from "@workspace/db";
import {
  postsTable,
  postReactionsTable,
  postCommentsTable,
  playerFollowsTable,
  postRepostsTable,
  playersTable,
  hatchlingsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import {
  CreatePostBody,
  ReactToPostBody,
  AddPostCommentBody,
  FollowPlayerBody,
  RepostPostBody,
} from "@workspace/api-zod";

const router = Router();

// ── Moderation ─────────────────────────────────────────────────────────────

const NEGATIVE_PATTERNS = [
  "hate", "stupid", "idiot", "loser", "dumb", "ugly", "fat", "worthless",
  "failure", "pathetic", "disgusting", "trash", "garbage", "useless",
  "kill yourself", "kys", "die", "harass",
];

function moderateContent(text: string): { flagged: boolean; matched: string[] } {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  for (const p of NEGATIVE_PATTERNS) {
    if (lower.includes(p)) matched.push(p);
  }
  return { flagged: matched.length > 0, matched };
}

// ── XP / energy rewards per post type ─────────────────────────────────────

const POST_REWARDS: Record<string, { xp: number; energy: number }> = {
  general: { xp: 5, energy: 2 },
  gym_selfie: { xp: 10, energy: 5 },
  evolution_reveal: { xp: 20, energy: 15 },
  streak_milestone: { xp: 25, energy: 10 },
  transformation: { xp: 30, energy: 20 },
  workout_stat: { xp: 15, energy: 8 },
  hatch_moment: { xp: 20, energy: 12 },
};

// ── Creator badge threshold ─────────────────────────────────────────────────

const CREATOR_BADGE_THRESHOLD = 50;

async function maybeGrantCreatorBadge(playerId: number) {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player || player.creatorBadge) return;

  const posts = await db.query.postsTable.findMany({ where: eq(postsTable.playerId, playerId) });
  const totalEngagement = posts.reduce((sum, p) => sum + p.engagementScore, 0);
  if (totalEngagement >= CREATOR_BADGE_THRESHOLD) {
    await db.update(playersTable)
      .set({ creatorBadge: "verified_creator" })
      .where(eq(playersTable.id, playerId));
  }
}

// ── Post enrichment helper ──────────────────────────────────────────────────

async function enrichPost(
  post: typeof postsTable.$inferSelect,
  viewerPlayerId?: number | null,
) {
  const author = await db.query.playersTable.findFirst({ where: eq(playersTable.id, post.playerId) });

  const reactions = await db.query.postReactionsTable.findMany({
    where: eq(postReactionsTable.postId, post.id),
  });

  const reactionCounts = { like: 0, encourage: 0, fire: 0, flex: 0 } as Record<string, number>;
  for (const r of reactions) {
    if (reactionCounts[r.reactionType] !== undefined) reactionCounts[r.reactionType]++;
  }

  const myReaction = viewerPlayerId
    ? (reactions.find(r => r.playerId === viewerPlayerId)?.reactionType ?? null)
    : null;

  const comments = await db.query.postCommentsTable.findMany({
    where: eq(postCommentsTable.postId, post.id),
    orderBy: [desc(postCommentsTable.createdAt)],
    limit: 3,
  });

  const enrichedComments = await Promise.all(comments.map(async c => {
    const commentAuthor = await db.query.playersTable.findFirst({ where: eq(playersTable.id, c.playerId) });
    return {
      ...c,
      authorName: commentAuthor?.displayName ?? commentAuthor?.username ?? "Trainer",
      authorAvatar: commentAuthor?.avatarUrl ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }));

  let creatureName: string | null = null;
  if (post.creatureId) {
    const creature = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, post.creatureId) });
    creatureName = creature?.name ?? null;
  }

  const commentCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postCommentsTable)
    .where(eq(postCommentsTable.postId, post.id))
    .then(r => r[0]?.count ?? 0);

  const repostCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postRepostsTable)
    .where(eq(postRepostsTable.postId, post.id))
    .then(r => r[0]?.count ?? 0);

  const myRepost = viewerPlayerId
    ? !!(await db.query.postRepostsTable.findFirst({
        where: and(eq(postRepostsTable.postId, post.id), eq(postRepostsTable.playerId, viewerPlayerId)),
      }))
    : false;

  return {
    id: post.id,
    playerId: post.playerId,
    authorName: author?.displayName ?? author?.username ?? "Trainer",
    authorAvatar: author?.avatarUrl ?? null,
    creatorBadge: author?.creatorBadge ?? null,
    content: post.content,
    mediaUrl: post.mediaUrl ?? null,
    postType: post.postType,
    creatureId: post.creatureId ?? null,
    creatureName,
    xpEarned: post.xpEarned,
    energyEarned: post.energyEarned,
    isFlagged: post.isFlagged,
    engagementScore: post.engagementScore,
    createdAt: post.createdAt.toISOString(),
    reactionCounts,
    commentCount,
    repostCount,
    myReaction,
    myRepost,
    comments: enrichedComments.reverse(),
  };
}

// ── Feed algorithm ──────────────────────────────────────────────────────────

function scorePost(
  post: typeof postsTable.$inferSelect,
  isFollowed: boolean,
  nowMs: number,
): number {
  const ageHours = (nowMs - post.createdAt.getTime()) / 3_600_000;
  const recencyScore = Math.max(0, 100 - ageHours * 2);
  const engagementScore = post.engagementScore * 3;
  const followBonus = isFollowed ? 40 : 0;
  const flagPenalty = post.isFlagged ? -200 : 0;
  return recencyScore + engagementScore + followBonus + flagPenalty;
}

// ── GET /social/feed ────────────────────────────────────────────────────────

router.get("/social/feed", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const cursor = req.query.cursor ? Number(req.query.cursor) : null;

  const follows = await db.query.playerFollowsTable.findMany({
    where: eq(playerFollowsTable.followerId, playerId),
  });
  const followedIds = new Set(follows.map(f => f.followeeId));

  const allPosts = await db.query.postsTable.findMany({
    orderBy: [desc(postsTable.createdAt)],
    limit: 200,
  });

  const nowMs = Date.now();
  const scored = allPosts.map(p => ({
    post: p,
    score: scorePost(p, followedIds.has(p.playerId), nowMs),
  }));

  scored.sort((a, b) => b.score - a.score);

  const startIdx = cursor ? scored.findIndex(s => s.post.id === cursor) + 1 : 0;
  const page = scored.slice(startIdx, startIdx + limit);

  const enriched = await Promise.all(page.map(({ post }) => enrichPost(post, playerId)));
  const nextCursor = page.length === limit ? page[page.length - 1].post.id : null;

  res.json({ posts: enriched, nextCursor, total: scored.length });
});

// ── POST /social/posts ──────────────────────────────────────────────────────

router.post("/social/posts", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { content, mediaUrl, postType = "general", creatureId } = body.data;

  // Validate the creature belongs to this player if provided
  if (creatureId) {
    const creature = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, creatureId) });
    if (!creature || creature.playerId !== playerId) {
      res.status(403).json({ error: "That creature does not belong to you" });
      return;
    }
  }

  const mod = moderateContent(content);
  if (mod.flagged) {
    res.status(422).json({
      error: "Your post contains language that goes against our community guidelines. Please keep it positive and supportive!",
      flaggedTerms: mod.matched,
    });
    return;
  }

  const rewards = POST_REWARDS[postType] ?? POST_REWARDS.general;

  const [post] = await db.insert(postsTable).values({
    playerId,
    content: content.trim().slice(0, 500),
    mediaUrl: mediaUrl ?? undefined,
    postType,
    creatureId: creatureId ?? undefined,
    xpEarned: rewards.xp,
    energyEarned: rewards.energy,
  }).returning();

  // Award XP to player
  await db.update(playersTable)
    .set({ xp: sql`${playersTable.xp} + ${rewards.xp}` })
    .where(eq(playersTable.id, playerId));

  // Credit evolution energy to the specific creature (capped at 100)
  if (creatureId) {
    await db.update(hatchlingsTable)
      .set({ energy: sql`LEAST(100, ${hatchlingsTable.energy} + ${rewards.energy})` })
      .where(and(eq(hatchlingsTable.id, creatureId), eq(hatchlingsTable.playerId, playerId)));
  } else {
    // Distribute a small energy bonus to all player's hatchlings
    const smallBoost = Math.max(1, Math.floor(rewards.energy / 3));
    await db.update(hatchlingsTable)
      .set({ energy: sql`LEAST(100, ${hatchlingsTable.energy} + ${smallBoost})` })
      .where(eq(hatchlingsTable.playerId, playerId));
  }

  const enriched = await enrichPost(post, playerId);
  res.status(201).json(enriched);
});

// ── GET /social/posts/:id ───────────────────────────────────────────────────

router.get("/social/posts/:id", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const viewerId = req.playerId!;

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const enriched = await enrichPost(post, viewerId);
  res.json(enriched);
});

// ── DELETE /social/posts/:id ────────────────────────────────────────────────

router.delete("/social/posts/:id", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const playerId = req.playerId!;

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.playerId !== playerId) { res.status(403).json({ error: "Not your post" }); return; }

  await db.delete(postReactionsTable).where(eq(postReactionsTable.postId, id));
  await db.delete(postCommentsTable).where(eq(postCommentsTable.postId, id));
  await db.delete(postRepostsTable).where(eq(postRepostsTable.postId, id));
  await db.delete(postsTable).where(eq(postsTable.id, id));

  res.status(204).send();
});

// ── POST /social/posts/:id/react ────────────────────────────────────────────

router.post("/social/posts/:id/react", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = ReactToPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { reactionType } = body.data;

  const existing = await db.query.postReactionsTable.findFirst({
    where: and(eq(postReactionsTable.postId, postId), eq(postReactionsTable.playerId, playerId)),
  });

  let added = false;
  if (existing) {
    if (existing.reactionType === reactionType) {
      await db.delete(postReactionsTable).where(eq(postReactionsTable.id, existing.id));
      added = false;
    } else {
      await db.update(postReactionsTable)
        .set({ reactionType })
        .where(eq(postReactionsTable.id, existing.id));
      added = true;
    }
  } else {
    await db.insert(postReactionsTable).values({ postId, playerId, reactionType });
    added = true;
  }

  const totalReactions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postReactionsTable)
    .where(eq(postReactionsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const totalComments = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postCommentsTable)
    .where(eq(postCommentsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const newEngagement = totalReactions * 2 + totalComments * 3;
  await db.update(postsTable).set({ engagementScore: newEngagement }).where(eq(postsTable.id, postId));

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (post) await maybeGrantCreatorBadge(post.playerId);

  const reactions = await db.query.postReactionsTable.findMany({
    where: eq(postReactionsTable.postId, postId),
  });
  const reactionCounts = { like: 0, encourage: 0, fire: 0, flex: 0 } as Record<string, number>;
  for (const r of reactions) {
    if (reactionCounts[r.reactionType] !== undefined) reactionCounts[r.reactionType]++;
  }

  res.json({ added, reactionType, reactionCounts });
});

// ── POST /social/posts/:id/repost ───────────────────────────────────────────

router.post("/social/posts/:id/repost", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = RepostPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const existing = await db.query.postRepostsTable.findFirst({
    where: and(eq(postRepostsTable.postId, postId), eq(postRepostsTable.playerId, playerId)),
  });

  let reposted: boolean;
  if (existing) {
    await db.delete(postRepostsTable).where(eq(postRepostsTable.id, existing.id));
    reposted = false;
  } else {
    await db.insert(postRepostsTable).values({ postId, playerId });
    reposted = true;
  }

  // Reposts count toward engagement
  const totalReactions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postReactionsTable)
    .where(eq(postReactionsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const totalComments = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postCommentsTable)
    .where(eq(postCommentsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const totalReposts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postRepostsTable)
    .where(eq(postRepostsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const newEngagement = totalReactions * 2 + totalComments * 3 + totalReposts * 4;
  await db.update(postsTable).set({ engagementScore: newEngagement }).where(eq(postsTable.id, postId));
  await maybeGrantCreatorBadge(post.playerId);

  res.json({ reposted, repostCount: totalReposts });
});

// ── GET /social/posts/:id/comments ─────────────────────────────────────────

router.get("/social/posts/:id/comments", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const comments = await db.query.postCommentsTable.findMany({
    where: eq(postCommentsTable.postId, postId),
    orderBy: [desc(postCommentsTable.createdAt)],
  });

  const enriched = await Promise.all(comments.map(async c => {
    const author = await db.query.playersTable.findFirst({ where: eq(playersTable.id, c.playerId) });
    return {
      ...c,
      authorName: author?.displayName ?? author?.username ?? "Trainer",
      authorAvatar: author?.avatarUrl ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }));

  res.json(enriched.reverse());
});

// ── POST /social/posts/:id/comments ────────────────────────────────────────

router.post("/social/posts/:id/comments", requireAuth, attachPlayer, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = AddPostCommentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { content } = body.data;

  const mod = moderateContent(content);
  if (mod.flagged) {
    res.status(422).json({
      error: "Your comment contains content that goes against our community guidelines.",
      flaggedTerms: mod.matched,
    });
    return;
  }

  const [comment] = await db.insert(postCommentsTable).values({
    postId,
    playerId,
    content: content.trim().slice(0, 280),
  }).returning();

  const totalReactions = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postReactionsTable)
    .where(eq(postReactionsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  const totalComments = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postCommentsTable)
    .where(eq(postCommentsTable.postId, postId))
    .then(r => r[0]?.count ?? 0);
  await db.update(postsTable)
    .set({ engagementScore: totalReactions * 2 + totalComments * 3 })
    .where(eq(postsTable.id, postId));

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (post) await maybeGrantCreatorBadge(post.playerId);

  const author = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  res.status(201).json({
    ...comment,
    authorName: author?.displayName ?? author?.username ?? "Trainer",
    authorAvatar: author?.avatarUrl ?? null,
    createdAt: comment.createdAt.toISOString(),
  });
});

// ── DELETE /social/posts/:id/comments/:commentId ────────────────────────────

router.delete("/social/posts/:id/comments/:commentId", requireAuth, attachPlayer, async (req, res) => {
  const commentId = Number(req.params.commentId);
  const playerId = req.playerId!;

  const comment = await db.query.postCommentsTable.findFirst({ where: eq(postCommentsTable.id, commentId) });
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.playerId !== playerId) { res.status(403).json({ error: "Not your comment" }); return; }

  await db.delete(postCommentsTable).where(eq(postCommentsTable.id, commentId));
  res.status(204).send();
});

// ── POST /social/follow ─────────────────────────────────────────────────────

router.post("/social/follow", requireAuth, attachPlayer, async (req, res) => {
  const followerId = req.playerId!;
  const body = FollowPlayerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { followeeId } = body.data;
  if (followerId === followeeId) { res.status(400).json({ error: "Cannot follow yourself" }); return; }

  const existing = await db.query.playerFollowsTable.findFirst({
    where: and(eq(playerFollowsTable.followerId, followerId), eq(playerFollowsTable.followeeId, followeeId)),
  });
  if (existing) { res.json({ success: true }); return; }

  await db.insert(playerFollowsTable).values({ followerId, followeeId });
  res.json({ success: true });
});

// ── POST /social/unfollow ───────────────────────────────────────────────────

router.post("/social/unfollow", requireAuth, attachPlayer, async (req, res) => {
  const followerId = req.playerId!;
  const body = FollowPlayerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { followeeId } = body.data;
  await db.delete(playerFollowsTable).where(
    and(eq(playerFollowsTable.followerId, followerId), eq(playerFollowsTable.followeeId, followeeId))
  );
  res.json({ success: true });
});

// ── GET /social/players/:id/profile ────────────────────────────────────────

router.get("/social/players/:id/profile", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const viewerId = req.playerId!;

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const posts = await db.query.postsTable.findMany({
    where: eq(postsTable.playerId, id),
    orderBy: [desc(postsTable.createdAt)],
    limit: 30,
  });

  const enrichedPosts = await Promise.all(posts.map(p => enrichPost(p, viewerId)));

  const followers = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followeeId, id) });
  const following = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, id) });

  const isFollowing = followers.some(f => f.followerId === viewerId);

  const memory = await getMemoryForPlayer(id, enrichedPosts);

  res.json({
    player: {
      id: player.id,
      username: player.username,
      displayName: player.displayName ?? null,
      avatarUrl: player.avatarUrl ?? null,
      creatorBadge: player.creatorBadge ?? null,
    },
    posts: enrichedPosts,
    followerCount: followers.length,
    followingCount: following.length,
    isFollowing,
    memory,
  });
});

// ── GET /social/players/:id/followers ──────────────────────────────────────

router.get("/social/players/:id/followers", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const follows = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followeeId, id) });
  const players = await Promise.all(follows.map(async f => {
    const p = await db.query.playersTable.findFirst({ where: eq(playersTable.id, f.followerId) });
    return p ? { id: p.id, username: p.username, displayName: p.displayName ?? null, avatarUrl: p.avatarUrl ?? null, creatorBadge: p.creatorBadge ?? null } : null;
  }));
  res.json(players.filter(Boolean));
});

// ── GET /social/players/:id/following ──────────────────────────────────────

router.get("/social/players/:id/following", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const follows = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, id) });
  const players = await Promise.all(follows.map(async f => {
    const p = await db.query.playersTable.findFirst({ where: eq(playersTable.id, f.followeeId) });
    return p ? { id: p.id, username: p.username, displayName: p.displayName ?? null, avatarUrl: p.avatarUrl ?? null, creatorBadge: p.creatorBadge ?? null } : null;
  }));
  res.json(players.filter(Boolean));
});

// ── GET /social/memories ────────────────────────────────────────────────────

async function getMemoryForPlayer(
  playerId: number,
  posts?: Awaited<ReturnType<typeof enrichPost>>[],
): Promise<{ post: Awaited<ReturnType<typeof enrichPost>>; memoryType: string; yearsAgo: number; label: string } | null> {
  const allPosts = posts ?? await (async () => {
    const raw = await db.query.postsTable.findMany({
      where: eq(postsTable.playerId, playerId),
      orderBy: [desc(postsTable.createdAt)],
    });
    return Promise.all(raw.map(p => enrichPost(p, playerId)));
  })();

  if (allPosts.length === 0) return null;

  const now = new Date();
  for (const post of allPosts) {
    const postDate = new Date(post.createdAt);
    const daysDiff = Math.abs((now.getTime() - postDate.getTime()) / 86_400_000);
    const yearsAgo = Math.round(daysDiff / 365);
    const isSameDay = Math.abs(postDate.getMonth() - now.getMonth()) === 0 && Math.abs(postDate.getDate() - now.getDate()) <= 1;

    if (yearsAgo >= 1 && isSameDay) {
      const label = yearsAgo === 1 ? "1 year ago today" : `${yearsAgo} years ago today`;
      let memoryType = "anniversary";
      if (post.postType === "evolution_reveal") memoryType = "first_evolution";
      else if (post.postType === "streak_milestone") memoryType = "streak_memory";
      else if (post.postType === "transformation") memoryType = "transformation";
      return { post, memoryType, yearsAgo, label };
    }
  }

  return null;
}

router.get("/social/memories", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const memory = await getMemoryForPlayer(playerId);
  res.json(memory);
});

export default router;
