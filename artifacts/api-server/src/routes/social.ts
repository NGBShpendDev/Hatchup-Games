import { Router } from "express";
import { db } from "@workspace/db";
import {
  postsTable,
  postViewsTable,
  postReactionsTable,
  postCommentsTable,
  playerFollowsTable,
  postRepostsTable,
  playersTable,
  hatchlingsTable,
  groupMembersTable,
  groupsTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, ne, inArray, ilike } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { blockMinorSocialWrite } from "../middlewares/minorGuard";
import { socialWriteLimiter } from "../middlewares/rateLimiters";
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
    viewCount: post.viewCount,
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
  const shuffle = req.query.shuffle === "true" || req.query.shuffle === "1";

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

  let page: typeof scored;
  let nextCursor: number | null;
  if (shuffle) {
    // Highlights mode: sample `limit` posts from the top candidates so
    // returning players see fresh picks each visit while still favoring
    // high-engagement, recent posts.
    const poolSize = Math.max(limit * 5, 20);
    const pool = scored.slice(0, poolSize);
    // Fisher–Yates partial shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    page = pool.slice(0, limit);
    nextCursor = null;
  } else {
    const startIdx = cursor ? scored.findIndex(s => s.post.id === cursor) + 1 : 0;
    page = scored.slice(startIdx, startIdx + limit);
    nextCursor = page.length === limit ? page[page.length - 1].post.id : null;
  }

  const enriched = await Promise.all(page.map(({ post }) => enrichPost(post, playerId)));

  res.json({ posts: enriched, nextCursor, total: scored.length });
});

// ── POST /social/posts ──────────────────────────────────────────────────────

router.post("/social/posts", socialWriteLimiter, requireAuth, attachPlayer, blockMinorSocialWrite, async (req, res) => {
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
// Public endpoint — permalinks must work for logged-out viewers too.

router.get("/social/posts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "Post not found" }); return; }

  let viewerId: number | null = null;
  try {
    const { getAuth } = await import("@clerk/express");
    const auth = getAuth(req);
    if (auth?.userId) {
      const player = await db.query.playersTable.findFirst({
        where: eq(playersTable.clerkId, auth.userId),
      });
      if (player) viewerId = player.id;
    }
  } catch {
    // ignore auth lookup failures — fall back to anonymous view
  }

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const enriched = await enrichPost(post, viewerId);
  res.json(enriched);
});

// ── POST /social/posts/:id/view ─────────────────────────────────────────────
// Public — anyone (logged in or anonymous) opening the permalink counts as a
// view. Dedup is per (post, viewerKey, day) so spamming refresh doesn't inflate
// the number. viewerKey = playerId for signed-in viewers; otherwise the request
// IP. Always returns the current viewCount so the client can render it.

router.post("/social/posts/:id/view", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "Post not found" }); return; }

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  let viewerKey = `ip:${req.ip ?? "unknown"}`;
  try {
    const { getAuth } = await import("@clerk/express");
    const auth = getAuth(req);
    if (auth?.userId) {
      const player = await db.query.playersTable.findFirst({
        where: eq(playersTable.clerkId, auth.userId),
      });
      if (player) viewerKey = `player:${player.id}`;
    }
  } catch {
    // fall back to IP-based dedup
  }

  const viewDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const inserted = await db
    .insert(postViewsTable)
    .values({ postId: id, viewerKey, viewDate })
    .onConflictDoNothing({ target: [postViewsTable.postId, postViewsTable.viewerKey, postViewsTable.viewDate] })
    .returning({ id: postViewsTable.id });

  let viewCount = post.viewCount;
  const counted = inserted.length > 0;
  if (counted) {
    const [updated] = await db
      .update(postsTable)
      .set({ viewCount: sql`${postsTable.viewCount} + 1` })
      .where(eq(postsTable.id, id))
      .returning({ viewCount: postsTable.viewCount });
    viewCount = updated?.viewCount ?? viewCount + 1;
  }

  res.json({ viewCount, counted });
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

router.post("/social/posts/:id/react", socialWriteLimiter, requireAuth, attachPlayer, blockMinorSocialWrite, async (req, res) => {
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

router.post("/social/posts/:id/repost", socialWriteLimiter, requireAuth, attachPlayer, blockMinorSocialWrite, async (req, res) => {
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

router.post("/social/posts/:id/comments", socialWriteLimiter, requireAuth, attachPlayer, blockMinorSocialWrite, async (req, res) => {
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

router.post("/social/follow", socialWriteLimiter, requireAuth, attachPlayer, blockMinorSocialWrite, async (req, res) => {
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

router.post("/social/unfollow", socialWriteLimiter, requireAuth, attachPlayer, async (req, res) => {
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

  // Mutual followers: people the viewer follows who also follow this profile.
  let mutualFollowers: Array<{
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    creatorBadge: string | null;
  }> = [];
  let mutualFollowersTotal = 0;
  if (viewerId !== id) {
    const viewerFollowsRows = await db.query.playerFollowsTable.findMany({
      where: eq(playerFollowsTable.followerId, viewerId),
    });
    const viewerFollows = new Set(viewerFollowsRows.map(f => f.followeeId));
    const mutualIds = followers
      .map(f => f.followerId)
      .filter(fid => fid !== viewerId && viewerFollows.has(fid));
    mutualFollowersTotal = mutualIds.length;
    if (mutualIds.length > 0) {
      const previewIds = mutualIds.slice(0, 3);
      const previewRows = await db.query.playersTable.findMany({
        where: inArray(playersTable.id, previewIds),
      });
      const previewMap = new Map(previewRows.map(p => [p.id, p]));
      mutualFollowers = previewIds.flatMap(pid => {
        const p = previewMap.get(pid);
        if (!p) return [];
        return [{
          id: p.id,
          username: p.username,
          displayName: p.displayName ?? null,
          avatarUrl: p.avatarUrl ?? null,
          creatorBadge: p.creatorBadge ?? null,
        }];
      });
    }
  }

  // Shared groups: groups where both viewer and profile are members.
  let sharedGroups: Array<{ id: number; name: string }> = [];
  if (viewerId !== id) {
    const profileMemberships = await db.query.groupMembersTable.findMany({
      where: eq(groupMembersTable.playerId, id),
    });
    const profileGroupIds = profileMemberships.map(m => m.groupId);
    if (profileGroupIds.length > 0) {
      const viewerMemberships = await db.query.groupMembersTable.findMany({
        where: and(
          eq(groupMembersTable.playerId, viewerId),
          inArray(groupMembersTable.groupId, profileGroupIds),
        ),
      });
      const sharedIds = viewerMemberships.map(m => m.groupId);
      if (sharedIds.length > 0) {
        const groupRows = await db.query.groupsTable.findMany({
          where: inArray(groupsTable.id, sharedIds),
        });
        sharedGroups = groupRows.map(g => ({ id: g.id, name: g.name }));
      }
    }
  }

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
    mutualFollowers,
    mutualFollowersTotal,
    sharedGroups,
  });
});

// ── GET /social/players/:id/mutual-followers ───────────────────────────────

router.get("/social/players/:id/mutual-followers", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const viewerId = Number(req.query.viewerId);
  const cursor = Math.max(0, Number(req.query.cursor) || 0);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);

  if (!Number.isFinite(id) || !Number.isFinite(viewerId)) {
    res.status(400).json({ error: "id and viewerId are required" });
    return;
  }

  if (viewerId === id) {
    res.json({ players: [], total: 0, nextCursor: null });
    return;
  }

  const [profileFollowers, viewerFollowsRows] = await Promise.all([
    db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followeeId, id) }),
    db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, viewerId) }),
  ]);

  const viewerFollows = new Set(viewerFollowsRows.map(f => f.followeeId));
  const mutualIds = profileFollowers
    .map(f => f.followerId)
    .filter(fid => fid !== viewerId && viewerFollows.has(fid));

  const total = mutualIds.length;
  const pageIds = mutualIds.slice(cursor, cursor + limit);
  const nextOffset = cursor + pageIds.length;
  const nextCursor = nextOffset < total ? nextOffset : null;

  let players: Array<{
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    creatorBadge: string | null;
  }> = [];
  if (pageIds.length > 0) {
    const rows = await db.query.playersTable.findMany({
      where: inArray(playersTable.id, pageIds),
    });
    const map = new Map(rows.map(p => [p.id, p]));
    players = pageIds.flatMap(pid => {
      const p = map.get(pid);
      if (!p) return [];
      return [{
        id: p.id,
        username: p.username,
        displayName: p.displayName ?? null,
        avatarUrl: p.avatarUrl ?? null,
        creatorBadge: p.creatorBadge ?? null,
      }];
    });
  }

  res.json({ players, total, nextCursor });
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

// ── GET /social/discover ────────────────────────────────────────────────────

router.get("/social/discover", requireAuth, attachPlayer, async (req, res) => {
  const viewerId = req.playerId!;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  // Who the viewer already follows
  const myFollows = await db.query.playerFollowsTable.findMany({
    where: eq(playerFollowsTable.followerId, viewerId),
  });
  const followedIds = new Set(myFollows.map(f => f.followeeId));

  // Shared-group cohort: players in any group the viewer is also a member of
  const myMemberships = await db.query.groupMembersTable.findMany({
    where: eq(groupMembersTable.playerId, viewerId),
  });
  const myGroupIds = myMemberships.map(m => m.groupId);

  type Candidate = { id: number; reason: string; reasonDetail: string | null; weight: number };
  const candidates = new Map<number, Candidate>();
  const consider = (id: number, reason: string, detail: string | null, weight: number) => {
    if (id === viewerId || followedIds.has(id)) return;
    const existing = candidates.get(id);
    if (!existing || existing.weight < weight) {
      candidates.set(id, { id, reason, reasonDetail: detail, weight });
    }
  };

  if (myGroupIds.length > 0) {
    const sharedMembers = await db.query.groupMembersTable.findMany({
      where: inArray(groupMembersTable.groupId, myGroupIds),
    });
    for (const m of sharedMembers) consider(m.playerId, "shared_group", "In a group with you", 100);
  }

  // Similar goals: same fitness realm, physique goal, or fitness level
  const viewer = await db.query.playersTable.findFirst({ where: eq(playersTable.id, viewerId) });
  if (viewer) {
    const goalPeers = await db.query.playersTable.findMany({
      where: and(
        ne(playersTable.id, viewerId),
        or(
          eq(playersTable.fitnessRealm, viewer.fitnessRealm),
          viewer.physiqueGoal ? eq(playersTable.physiqueGoal, viewer.physiqueGoal) : undefined,
          eq(playersTable.fitnessLevel, viewer.fitnessLevel),
        ),
      ),
      limit: 60,
    });
    const realmLabels: Record<string, string> = {
      strength: "strength", endurance: "endurance", flexibility: "flexibility",
      power: "power", agility: "agility",
    };
    for (const peer of goalPeers) {
      const matched: string[] = [];
      if (peer.fitnessRealm === viewer.fitnessRealm) {
        matched.push(`${realmLabels[viewer.fitnessRealm] ?? viewer.fitnessRealm} realm`);
      }
      if (viewer.physiqueGoal && peer.physiqueGoal === viewer.physiqueGoal) {
        matched.push(viewer.physiqueGoal.replace(/_/g, " "));
      }
      if (peer.fitnessLevel === viewer.fitnessLevel) {
        matched.push(`${viewer.fitnessLevel} level`);
      }
      if (matched.length === 0) continue;
      // Base 70 + 5 per extra match keeps similar-goals above recently-active (30)
      // and top-creator (60), but still below shared-group cohort (100).
      const weight = 70 + (matched.length - 1) * 5;
      const detail = `Similar goals · ${matched.slice(0, 2).join(" & ")}`;
      consider(peer.id, "similar_goals", detail, weight);
    }
  }

  // Top creators by creator badge / total engagement (proxy via posts engagementScore sum)
  const creators = await db.query.playersTable.findMany({
    where: and(ne(playersTable.id, viewerId), sql`${playersTable.creatorBadge} IS NOT NULL`),
    limit: 30,
  });
  for (const c of creators) consider(c.id, "top_creator", "Verified creator", 60);

  // Recently active: latest posters
  const recentPosts = await db.query.postsTable.findMany({
    orderBy: [desc(postsTable.createdAt)],
    limit: 100,
  });
  for (const p of recentPosts) consider(p.playerId, "recently_active", "Posted recently", 30);

  // Pick top N candidates by weight
  const ranked = Array.from(candidates.values()).sort((a, b) => b.weight - a.weight).slice(0, limit);
  if (ranked.length === 0) { res.json([]); return; }

  const playerRows = await db.query.playersTable.findMany({
    where: inArray(playersTable.id, ranked.map(c => c.id)),
  });
  const playerMap = new Map(playerRows.map(p => [p.id, p]));

  // Follower counts
  const followerRows = await db
    .select({ followeeId: playerFollowsTable.followeeId, count: sql<number>`count(*)::int` })
    .from(playerFollowsTable)
    .where(inArray(playerFollowsTable.followeeId, ranked.map(c => c.id)))
    .groupBy(playerFollowsTable.followeeId);
  const followerCounts = new Map(followerRows.map(r => [r.followeeId, r.count]));

  // Shared groups per candidate: groups where both viewer and the candidate are members.
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  if (myGroupIds.length > 0) {
    const candidateMemberships = await db.query.groupMembersTable.findMany({
      where: and(
        inArray(groupMembersTable.playerId, ranked.map(c => c.id)),
        inArray(groupMembersTable.groupId, myGroupIds),
      ),
    });
    if (candidateMemberships.length > 0) {
      const referencedGroupIds = Array.from(new Set(candidateMemberships.map(m => m.groupId)));
      const groupRows = await db.query.groupsTable.findMany({
        where: inArray(groupsTable.id, referencedGroupIds),
      });
      const groupNameMap = new Map(groupRows.map(g => [g.id, g.name]));
      for (const m of candidateMemberships) {
        const name = groupNameMap.get(m.groupId);
        if (!name) continue;
        const list = sharedGroupsByPlayer.get(m.playerId) ?? [];
        list.push({ id: m.groupId, name });
        sharedGroupsByPlayer.set(m.playerId, list);
      }
    }
  }

  const result = ranked.flatMap(c => {
    const p = playerMap.get(c.id);
    if (!p) return [];
    return [{
      id: p.id,
      username: p.username,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
      creatorBadge: p.creatorBadge ?? null,
      followerCount: followerCounts.get(p.id) ?? 0,
      isFollowing: false,
      reason: c.reason,
      reasonDetail: c.reasonDetail,
      sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
    }];
  });

  res.json(result);
});

// ── GET /social/search ──────────────────────────────────────────────────────

router.get("/social/search", requireAuth, attachPlayer, async (req, res) => {
  const viewerId = req.playerId!;
  const q = String(req.query.q ?? "").trim();
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  if (q.length < 1) { res.json([]); return; }
  const pattern = `%${q.replace(/[%_]/g, m => "\\" + m)}%`;

  const matches = await db.query.playersTable.findMany({
    where: and(
      ne(playersTable.id, viewerId),
      or(ilike(playersTable.username, pattern), ilike(playersTable.displayName, pattern)),
    ),
    limit,
  });

  if (matches.length === 0) { res.json([]); return; }
  const ids = matches.map(m => m.id);

  const myFollows = await db.query.playerFollowsTable.findMany({
    where: and(eq(playerFollowsTable.followerId, viewerId), inArray(playerFollowsTable.followeeId, ids)),
  });
  const followingSet = new Set(myFollows.map(f => f.followeeId));

  const followerRows = await db
    .select({ followeeId: playerFollowsTable.followeeId, count: sql<number>`count(*)::int` })
    .from(playerFollowsTable)
    .where(inArray(playerFollowsTable.followeeId, ids))
    .groupBy(playerFollowsTable.followeeId);
  const followerCounts = new Map(followerRows.map(r => [r.followeeId, r.count]));

  // Shared groups per match: groups where both viewer and the match are members.
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  const viewerMemberships = await db.query.groupMembersTable.findMany({
    where: eq(groupMembersTable.playerId, viewerId),
  });
  const viewerGroupIds = viewerMemberships.map(m => m.groupId);
  if (viewerGroupIds.length > 0) {
    const matchMemberships = await db.query.groupMembersTable.findMany({
      where: and(
        inArray(groupMembersTable.playerId, ids),
        inArray(groupMembersTable.groupId, viewerGroupIds),
      ),
    });
    if (matchMemberships.length > 0) {
      const referencedGroupIds = Array.from(new Set(matchMemberships.map(m => m.groupId)));
      const groupRows = await db.query.groupsTable.findMany({
        where: inArray(groupsTable.id, referencedGroupIds),
      });
      const groupNameMap = new Map(groupRows.map(g => [g.id, g.name]));
      for (const m of matchMemberships) {
        const name = groupNameMap.get(m.groupId);
        if (!name) continue;
        const list = sharedGroupsByPlayer.get(m.playerId) ?? [];
        list.push({ id: m.groupId, name });
        sharedGroupsByPlayer.set(m.playerId, list);
      }
    }
  }

  // Rank: username prefix match first, then displayName prefix, then others
  const lowerQ = q.toLowerCase();
  const scored = matches.map(p => {
    let score = 0;
    if (p.username.toLowerCase().startsWith(lowerQ)) score += 100;
    else if (p.username.toLowerCase().includes(lowerQ)) score += 50;
    if ((p.displayName ?? "").toLowerCase().startsWith(lowerQ)) score += 80;
    else if ((p.displayName ?? "").toLowerCase().includes(lowerQ)) score += 40;
    score += Math.min(20, followerCounts.get(p.id) ?? 0);
    return { p, score };
  }).sort((a, b) => b.score - a.score);

  res.json(scored.map(({ p }) => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    creatorBadge: p.creatorBadge ?? null,
    followerCount: followerCounts.get(p.id) ?? 0,
    isFollowing: followingSet.has(p.id),
    reason: "search",
    reasonDetail: null,
    sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
  })));
});

router.get("/social/memories", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const memory = await getMemoryForPlayer(playerId);
  res.json(memory);
});

export default router;
