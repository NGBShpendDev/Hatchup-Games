import { Router } from "express";
import { db } from "@workspace/db";
import {
  postsTable,
  postViewsTable,
  postReactionsTable,
  postCommentsTable,
  postCommentReactionsTable,
  playerFollowsTable,
  postRepostsTable,
  playersTable,
  hatchlingsTable,
  groupMembersTable,
  groupsTable,
} from "@workspace/db";
import { eq, and, desc, sql, or, ne, inArray, ilike, gte, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, attachPlayer } from "../middlewares/auth";
import { attachEntitlement, requirePremium } from "../services/subscriptionGuards";
import { blockMinorSocialWrite } from "../middlewares/minorGuard";
import { blockSuspendedSocialWrite } from "../middlewares/suspendedGuard";
import { socialWriteLimiter, postViewLimiter } from "../middlewares/rateLimiters";
import { sendPushToPlayer } from "../services/pushNotifications";
import { notificationsTable } from "@workspace/db";
import { createHmac } from "node:crypto";
import {
  CreatePostBody,
  ReactToPostBody,
  AddPostCommentBody,
  EditPostCommentBody,
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
  tournament_win: { xp: 40, energy: 25 },
};

// ── Creator badge threshold ─────────────────────────────────────────────────

const CREATOR_BADGE_THRESHOLD = 50;

async function maybeGrantCreatorBadge(playerId: number) {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player || player.creatorBadge) return;

  const posts = await db.query.postsTable.findMany({
    where: and(eq(postsTable.playerId, playerId), isNull(postsTable.deletedAt)),
  });
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

  const allComments = await db.query.postCommentsTable.findMany({
    where: eq(postCommentsTable.postId, post.id),
    orderBy: [desc(postCommentsTable.createdAt)],
  });

  const allCommentIds = allComments.map(c => c.id);
  const commentLikes = allCommentIds.length
    ? await db.query.postCommentReactionsTable.findMany({
        where: inArray(postCommentReactionsTable.commentId, allCommentIds),
      })
    : [];
  const likeCountByComment = new Map<number, number>();
  const myLikedByComment = new Map<number, boolean>();
  for (const r of commentLikes) {
    likeCountByComment.set(r.commentId, (likeCountByComment.get(r.commentId) ?? 0) + 1);
    if (viewerPlayerId && r.playerId === viewerPlayerId) myLikedByComment.set(r.commentId, true);
  }

  // Sort: most-liked first, ties broken by recency (newer first).
  const comments = [...allComments]
    .sort((a, b) => {
      const likeDiff = (likeCountByComment.get(b.id) ?? 0) - (likeCountByComment.get(a.id) ?? 0);
      if (likeDiff !== 0) return likeDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 3);

  const enrichedComments = await Promise.all(comments.map(async c => {
    const commentAuthor = await db.query.playersTable.findFirst({ where: eq(playersTable.id, c.playerId) });
    return {
      ...c,
      authorName: commentAuthor?.displayName ?? commentAuthor?.username ?? "Trainer",
      authorAvatar: commentAuthor?.avatarUrl ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
      likeCount: likeCountByComment.get(c.id) ?? 0,
      myLiked: myLikedByComment.get(c.id) ?? false,
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
    metadata: (post.metadata as Record<string, unknown> | null) ?? null,
    reactionCounts,
    commentCount,
    repostCount,
    myReaction,
    myRepost,
    comments: enrichedComments,
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
    where: isNull(postsTable.deletedAt),
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

// ── GET /social/trending ────────────────────────────────────────────────────
// Ranks posts by unique views recorded inside the trending window (24h or 7d).
// Posts that haven't been viewed in the window are excluded so the surface
// stays fresh and creators who resonate recently get the spotlight.

router.get("/social/trending", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const windowParam = req.query.window === "week" ? "week" : "day";
  const windowMs = windowParam === "week" ? 7 * 24 * 3600_000 : 24 * 3600_000;
  const cutoff = new Date(Date.now() - windowMs);

  // Aggregate recent view counts per post within the window.
  const recentViewRows = await db
    .select({
      postId: postViewsTable.postId,
      recentViews: sql<number>`count(*)::int`,
    })
    .from(postViewsTable)
    .where(gte(postViewsTable.createdAt, cutoff))
    .groupBy(postViewsTable.postId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 2);

  if (recentViewRows.length === 0) {
    res.json({ posts: [], window: windowParam });
    return;
  }

  const postIds = recentViewRows.map(r => r.postId);
  const postsForWindow = await db.query.postsTable.findMany({
    where: and(
      inArray(postsTable.id, postIds),
      eq(postsTable.isFlagged, false),
      isNull(postsTable.deletedAt),
    ),
  });

  const viewsById = new Map(recentViewRows.map(r => [r.postId, r.recentViews]));
  const ranked = postsForWindow
    .map(p => ({ post: p, recentViewCount: viewsById.get(p.id) ?? 0 }))
    .filter(({ recentViewCount }) => recentViewCount > 0)
    .sort((a, b) => {
      if (b.recentViewCount !== a.recentViewCount) {
        return b.recentViewCount - a.recentViewCount;
      }
      return b.post.createdAt.getTime() - a.post.createdAt.getTime();
    })
    .slice(0, limit);

  const enriched = await Promise.all(
    ranked.map(async ({ post, recentViewCount }) => ({
      ...(await enrichPost(post, playerId)),
      recentViewCount,
    })),
  );

  res.json({ posts: enriched, window: windowParam });
});

// ── POST /social/posts ──────────────────────────────────────────────────────

router.post("/social/posts", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const playerId = req.playerId!;
  const body = CreatePostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { content, mediaUrl, postType = "general", creatureId, metadata } = body.data;

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
    metadata: metadata ?? undefined,
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
  if (!post || post.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }

  const enriched = await enrichPost(post, viewerId);
  res.json(enriched);
});

// ── POST /social/posts/:id/view ─────────────────────────────────────────────
// Public — anyone (logged in or anonymous) opening the permalink counts as a
// view. Dedup is per (post, viewerKey, day) so spamming refresh doesn't inflate
// the number. viewerKey = playerId for signed-in viewers; otherwise the request
// IP. Always returns the current viewCount so the client can render it.

router.post("/social/posts/:id/view", postViewLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "Post not found" }); return; }

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, id) });
  if (!post || post.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }

  // For anonymous viewers, hash the IP with SESSION_SECRET so we can still
  // dedup per-day without persisting raw IPs (privacy + a small extra cost
  // for anyone trying to brute-force viewerKeys).
  const sessionSecret = process.env.SESSION_SECRET ?? "";
  const rawIp = req.ip ?? "unknown";
  const ipHash = sessionSecret
    ? createHmac("sha256", sessionSecret).update(rawIp).digest("hex").slice(0, 32)
    : rawIp;
  let viewerKey = `ip:${ipHash}`;
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
  if (!post || post.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }
  if (post.playerId !== playerId) { res.status(403).json({ error: "Not your post" }); return; }

  // Soft-delete: keep the row (and its reactions/comments/reposts) so moderation
  // retains an audit trail. The scheduled `postPurgeJob` hard-removes rows older
  // than the retention window. Public read paths filter on `deletedAt IS NULL`.
  await db.update(postsTable)
    .set({ deletedAt: new Date() })
    .where(eq(postsTable.id, id));

  res.status(204).send();
});

// ── POST /social/posts/:id/react ────────────────────────────────────────────

router.post("/social/posts/:id/react", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = ReactToPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { reactionType } = body.data;

  const targetPost = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (!targetPost || targetPost.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }

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

router.post("/social/posts/:id/repost", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = RepostPostBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const post = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (!post || post.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }

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
  const parent = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (!parent || parent.deletedAt != null) { res.json([]); return; }
  const comments = await db.query.postCommentsTable.findMany({
    where: eq(postCommentsTable.postId, postId),
    orderBy: [desc(postCommentsTable.createdAt)],
  });

  const viewerId = req.playerId ?? null;
  const commentIds = comments.map(c => c.id);
  const commentLikes = commentIds.length
    ? await db.query.postCommentReactionsTable.findMany({
        where: inArray(postCommentReactionsTable.commentId, commentIds),
      })
    : [];
  const likeCountByComment = new Map<number, number>();
  const myLikedByComment = new Map<number, boolean>();
  for (const r of commentLikes) {
    likeCountByComment.set(r.commentId, (likeCountByComment.get(r.commentId) ?? 0) + 1);
    if (viewerId && r.playerId === viewerId) myLikedByComment.set(r.commentId, true);
  }

  const enriched = await Promise.all(comments.map(async c => {
    const author = await db.query.playersTable.findFirst({ where: eq(playersTable.id, c.playerId) });
    return {
      ...c,
      authorName: author?.displayName ?? author?.username ?? "Trainer",
      authorAvatar: author?.avatarUrl ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
      likeCount: likeCountByComment.get(c.id) ?? 0,
      myLiked: myLikedByComment.get(c.id) ?? false,
    };
  }));

  res.json(enriched.reverse());
});

// ── POST /social/posts/:id/comments ────────────────────────────────────────

router.post("/social/posts/:id/comments", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const postId = Number(req.params.id);
  const playerId = req.playerId!;
  const body = AddPostCommentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { content } = body.data;

  const parentPost = await db.query.postsTable.findFirst({ where: eq(postsTable.id, postId) });
  if (!parentPost || parentPost.deletedAt != null) { res.status(404).json({ error: "Post not found" }); return; }

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
    updatedAt: null,
    likeCount: 0,
    myLiked: false,
  });
});

// ── PATCH /social/posts/:id/comments/:commentId ─────────────────────────────

router.patch("/social/posts/:id/comments/:commentId", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
  const commentId = Number(req.params.commentId);
  const playerId = req.playerId!;
  const body = EditPostCommentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const { content } = body.data;

  const existing = await db.query.postCommentsTable.findFirst({ where: eq(postCommentsTable.id, commentId) });
  if (!existing) { res.status(404).json({ error: "Comment not found" }); return; }
  if (existing.playerId !== playerId) { res.status(403).json({ error: "Not your comment" }); return; }

  const mod = moderateContent(content);
  if (mod.flagged) {
    res.status(422).json({
      error: "Your comment contains content that goes against our community guidelines.",
      flaggedTerms: mod.matched,
    });
    return;
  }

  const [updated] = await db.update(postCommentsTable)
    .set({ content: content.trim().slice(0, 280), updatedAt: new Date() })
    .where(eq(postCommentsTable.id, commentId))
    .returning();

  const likeCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postCommentReactionsTable)
    .where(eq(postCommentReactionsTable.commentId, commentId))
    .then(r => r[0]?.count ?? 0);
  const myLike = await db.query.postCommentReactionsTable.findFirst({
    where: and(
      eq(postCommentReactionsTable.commentId, commentId),
      eq(postCommentReactionsTable.playerId, playerId),
    ),
  });

  const author = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  res.json({
    ...updated,
    authorName: author?.displayName ?? author?.username ?? "Trainer",
    authorAvatar: author?.avatarUrl ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : null,
    likeCount,
    myLiked: !!myLike,
  });
});

// ── POST /social/posts/:id/comments/:commentId/like ────────────────────────

router.post(
  "/social/posts/:id/comments/:commentId/like",
  socialWriteLimiter,
  requireAuth,
  attachPlayer,
  blockSuspendedSocialWrite,
  blockMinorSocialWrite,
  async (req, res) => {
    const commentId = Number(req.params.commentId);
    const playerId = req.playerId!;
    if (!Number.isFinite(commentId)) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const comment = await db.query.postCommentsTable.findFirst({
      where: eq(postCommentsTable.id, commentId),
    });
    if (!comment) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const existing = await db.query.postCommentReactionsTable.findFirst({
      where: and(
        eq(postCommentReactionsTable.commentId, commentId),
        eq(postCommentReactionsTable.playerId, playerId),
      ),
    });

    let liked: boolean;
    if (existing) {
      await db.delete(postCommentReactionsTable).where(eq(postCommentReactionsTable.id, existing.id));
      liked = false;
    } else {
      await db.insert(postCommentReactionsTable).values({ commentId, playerId, reactionType: "like" });
      liked = true;
    }

    // Notify the comment author when someone else likes their comment.
    // Skip self-likes and dedupe per (author, comment, liker) so rapid toggling
    // doesn't spam the notifications feed.
    if (liked && comment.playerId !== playerId) {
      const link = `/post/${comment.postId}?commentLikeFrom=${playerId}`;
      const duplicate = await db.query.notificationsTable.findFirst({
        where: and(
          eq(notificationsTable.playerId, comment.playerId),
          eq(notificationsTable.type, "comment_like"),
          eq(notificationsTable.sourceId, commentId),
          eq(notificationsTable.link, link),
        ),
      });

      if (!duplicate) {
        const liker = await db.query.playersTable.findFirst({
          where: eq(playersTable.id, playerId),
        });
        const likerName = liker?.displayName ?? liker?.username ?? "Someone";
        const snippet = comment.content.length > 60
          ? `${comment.content.slice(0, 57)}…`
          : comment.content;
        const title = "New like on your comment";
        const body = `${likerName} liked your comment: "${snippet}"`;

        await db.insert(notificationsTable).values({
          playerId: comment.playerId,
          type: "comment_like",
          title,
          body,
          link,
          sourceId: commentId,
        });

        void sendPushToPlayer(comment.playerId, {
          title,
          body,
          link,
          category: "invites",
          tag: `comment-like-${commentId}-${playerId}`,
        });
      }
    }

    const likeCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postCommentReactionsTable)
      .where(eq(postCommentReactionsTable.commentId, commentId))
      .then(r => r[0]?.count ?? 0);

    res.json({ liked, likeCount });
  },
);

// ── DELETE /social/posts/:id/comments/:commentId ────────────────────────────

router.delete("/social/posts/:id/comments/:commentId", requireAuth, attachPlayer, async (req, res) => {
  const commentId = Number(req.params.commentId);
  const playerId = req.playerId!;

  const comment = await db.query.postCommentsTable.findFirst({ where: eq(postCommentsTable.id, commentId) });
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.playerId !== playerId) { res.status(403).json({ error: "Not your comment" }); return; }

  await db.delete(postCommentReactionsTable).where(eq(postCommentReactionsTable.commentId, commentId));
  await db.delete(postCommentsTable).where(eq(postCommentsTable.id, commentId));
  res.status(204).send();
});

// ── POST /social/follow ─────────────────────────────────────────────────────

router.post("/social/follow", socialWriteLimiter, requireAuth, attachPlayer, blockSuspendedSocialWrite, blockMinorSocialWrite, async (req, res) => {
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
    where: and(eq(postsTable.playerId, id), isNull(postsTable.deletedAt)),
    orderBy: [desc(postsTable.createdAt)],
    limit: 30,
  });

  const enrichedPosts = await Promise.all(posts.map(p => enrichPost(p, viewerId)));

  const followers = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followeeId, id) });
  const following = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, id) });

  const isFollowing = followers.some(f => f.followerId === viewerId);

  const memory = await getMemoryForPlayer(id, enrichedPosts);

  // Mutual followers: people the viewer follows who also follow this profile.
  type PlayerStub = {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    creatorBadge: string | null;
  };
  let mutualFollowers: PlayerStub[] = [];
  let mutualFollowersTotal = 0;
  let mutualFollowing: PlayerStub[] = [];
  let mutualFollowingTotal = 0;
  if (viewerId !== id) {
    const viewerFollowsRows = await db.query.playerFollowsTable.findMany({
      where: eq(playerFollowsTable.followerId, viewerId),
    });
    const viewerFollows = new Set(viewerFollowsRows.map(f => f.followeeId));
    const mutualFollowerIds = followers
      .map(f => f.followerId)
      .filter(fid => fid !== viewerId && viewerFollows.has(fid));
    mutualFollowersTotal = mutualFollowerIds.length;

    // Mutual following: accounts that both the viewer and this player follow.
    const profileFollows = new Set(following.map(f => f.followeeId));
    const mutualFollowingIds = Array.from(viewerFollows).filter(
      fid => fid !== viewerId && fid !== id && profileFollows.has(fid),
    );
    mutualFollowingTotal = mutualFollowingIds.length;

    const previewFollowerIds = mutualFollowerIds.slice(0, 3);
    const previewFollowingIds = mutualFollowingIds.slice(0, 3);
    const allPreviewIds = Array.from(new Set([...previewFollowerIds, ...previewFollowingIds]));
    const previewMap = new Map<number, typeof playersTable.$inferSelect>();
    if (allPreviewIds.length > 0) {
      const previewRows = await db.query.playersTable.findMany({
        where: inArray(playersTable.id, allPreviewIds),
      });
      for (const p of previewRows) previewMap.set(p.id, p);
    }
    const toStub = (pid: number): PlayerStub | null => {
      const p = previewMap.get(pid);
      if (!p) return null;
      return {
        id: p.id,
        username: p.username,
        displayName: p.displayName ?? null,
        avatarUrl: p.avatarUrl ?? null,
        creatorBadge: p.creatorBadge ?? null,
      };
    };
    mutualFollowers = previewFollowerIds.flatMap(pid => {
      const s = toStub(pid);
      return s ? [s] : [];
    });
    mutualFollowing = previewFollowingIds.flatMap(pid => {
      const s = toStub(pid);
      return s ? [s] : [];
    });
  }

  // Shared groups: groups where both viewer and profile are members.
  // Single SQL round-trip via a self-join on group_members + groups (indexed on
  // (player_id, group_id)) so latency stays flat as either user's group count grows.
  let sharedGroups: Array<{ id: number; name: string }> = [];
  if (viewerId !== id) {
    const viewerGm = alias(groupMembersTable, "viewer_gm");
    const sharedRows = await db
      .select({
        groupId: groupsTable.id,
        groupName: groupsTable.name,
      })
      .from(groupMembersTable)
      .innerJoin(
        viewerGm,
        and(eq(viewerGm.groupId, groupMembersTable.groupId), eq(viewerGm.playerId, viewerId)),
      )
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(eq(groupMembersTable.playerId, id));
    sharedGroups = sharedRows.map(r => ({ id: r.groupId, name: r.groupName }));
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
    mutualFollowing,
    mutualFollowingTotal,
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

  const pfProfile = alias(playerFollowsTable, "pf_profile");
  const pfViewer = alias(playerFollowsTable, "pf_viewer");

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pfProfile)
    .innerJoin(
      pfViewer,
      and(
        eq(pfViewer.followerId, viewerId),
        eq(pfViewer.followeeId, pfProfile.followerId),
      ),
    )
    .where(and(eq(pfProfile.followeeId, id), ne(pfProfile.followerId, viewerId)));

  const total = countRow?.count ?? 0;

  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
      avatarUrl: playersTable.avatarUrl,
      creatorBadge: playersTable.creatorBadge,
    })
    .from(pfProfile)
    .innerJoin(
      pfViewer,
      and(
        eq(pfViewer.followerId, viewerId),
        eq(pfViewer.followeeId, pfProfile.followerId),
      ),
    )
    .innerJoin(playersTable, eq(playersTable.id, pfProfile.followerId))
    .where(and(eq(pfProfile.followeeId, id), ne(pfProfile.followerId, viewerId)))
    .orderBy(playersTable.id)
    .limit(limit)
    .offset(cursor);

  const players = rows.map(p => ({
    id: p.id,
    username: p.username,
    displayName: p.displayName ?? null,
    avatarUrl: p.avatarUrl ?? null,
    creatorBadge: p.creatorBadge ?? null,
  }));

  const nextOffset = cursor + rows.length;
  const nextCursor = nextOffset < total ? nextOffset : null;

  res.json({ players, total, nextCursor });
});

// ── GET /social/players/:id/mutual-following ───────────────────────────────

router.get("/social/players/:id/mutual-following", requireAuth, attachPlayer, async (req, res) => {
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

  const [profileFollowsRows, viewerFollowsRows] = await Promise.all([
    db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, id) }),
    db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, viewerId) }),
  ]);

  const profileFollows = new Set(profileFollowsRows.map(f => f.followeeId));
  const mutualIds = viewerFollowsRows
    .map(f => f.followeeId)
    .filter(fid => fid !== viewerId && fid !== id && profileFollows.has(fid));

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

// Shared-group helper: for the viewer, build a map of playerId -> groups they
// both belong to. Single SQL round-trip via a self-join on group_members + groups
// (indexed on (player_id, group_id)) so latency stays flat as the viewer's
// group count grows. Used to populate `sharedGroups` on PlayerStub responses.
async function loadSharedGroupsForViewer(
  viewerId: number,
  playerIds: number[],
): Promise<Map<number, Array<{ id: number; name: string }>>> {
  const out = new Map<number, Array<{ id: number; name: string }>>();
  if (playerIds.length === 0) return out;
  const viewerGm = alias(groupMembersTable, "viewer_gm");
  const rows = await db
    .select({
      playerId: groupMembersTable.playerId,
      groupId: groupsTable.id,
      groupName: groupsTable.name,
    })
    .from(groupMembersTable)
    .innerJoin(
      viewerGm,
      and(eq(viewerGm.groupId, groupMembersTable.groupId), eq(viewerGm.playerId, viewerId)),
    )
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(inArray(groupMembersTable.playerId, playerIds));
  for (const r of rows) {
    const list = out.get(r.playerId) ?? [];
    list.push({ id: r.groupId, name: r.groupName });
    out.set(r.playerId, list);
  }
  return out;
}

// ── GET /social/players/:id/followers ──────────────────────────────────────

router.get("/social/players/:id/followers", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const viewerId = req.playerId!;
  const follows = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followeeId, id) });
  const ids = follows.map(f => f.followerId);
  if (ids.length === 0) { res.json([]); return; }
  const playerRows = await db.query.playersTable.findMany({ where: inArray(playersTable.id, ids) });
  const playerMap = new Map(playerRows.map(p => [p.id, p]));
  const sharedGroupsByPlayer = await loadSharedGroupsForViewer(viewerId, ids);
  const players = ids.flatMap(pid => {
    const p = playerMap.get(pid);
    if (!p) return [];
    return [{
      id: p.id,
      username: p.username,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
      creatorBadge: p.creatorBadge ?? null,
      sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
    }];
  });
  res.json(players);
});

// ── GET /social/players/:id/following ──────────────────────────────────────

router.get("/social/players/:id/following", requireAuth, attachPlayer, async (req, res) => {
  const id = Number(req.params.id);
  const viewerId = req.playerId!;
  const follows = await db.query.playerFollowsTable.findMany({ where: eq(playerFollowsTable.followerId, id) });
  const ids = follows.map(f => f.followeeId);
  if (ids.length === 0) { res.json([]); return; }
  const playerRows = await db.query.playersTable.findMany({ where: inArray(playersTable.id, ids) });
  const playerMap = new Map(playerRows.map(p => [p.id, p]));
  const sharedGroupsByPlayer = await loadSharedGroupsForViewer(viewerId, ids);
  const players = ids.flatMap(pid => {
    const p = playerMap.get(pid);
    if (!p) return [];
    return [{
      id: p.id,
      username: p.username,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
      creatorBadge: p.creatorBadge ?? null,
      sharedGroups: sharedGroupsByPlayer.get(p.id) ?? [],
    }];
  });
  res.json(players);
});

// ── GET /social/memories ────────────────────────────────────────────────────

async function getMemoryForPlayer(
  playerId: number,
  posts?: Awaited<ReturnType<typeof enrichPost>>[],
): Promise<{ post: Awaited<ReturnType<typeof enrichPost>>; memoryType: string; yearsAgo: number; label: string } | null> {
  const allPosts = posts ?? await (async () => {
    const raw = await db.query.postsTable.findMany({
      where: and(eq(postsTable.playerId, playerId), isNull(postsTable.deletedAt)),
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
    where: isNull(postsTable.deletedAt),
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
  // Single SQL round-trip via a self-join on group_members + groups (indexed on
  // (player_id, group_id)) so latency stays flat as the viewer's group count grows.
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  if (myGroupIds.length > 0) {
    const viewerGm = alias(groupMembersTable, "viewer_gm");
    const sharedRows = await db
      .select({
        playerId: groupMembersTable.playerId,
        groupId: groupsTable.id,
        groupName: groupsTable.name,
      })
      .from(groupMembersTable)
      .innerJoin(
        viewerGm,
        and(eq(viewerGm.groupId, groupMembersTable.groupId), eq(viewerGm.playerId, viewerId)),
      )
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(inArray(groupMembersTable.playerId, ranked.map(c => c.id)));
    for (const r of sharedRows) {
      const list = sharedGroupsByPlayer.get(r.playerId) ?? [];
      list.push({ id: r.groupId, name: r.groupName });
      sharedGroupsByPlayer.set(r.playerId, list);
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
  // Single SQL round-trip via a self-join on group_members + groups (indexed on
  // (player_id, group_id)) so latency stays flat as the viewer's group count grows.
  const sharedGroupsByPlayer = new Map<number, Array<{ id: number; name: string }>>();
  {
    const viewerGm = alias(groupMembersTable, "viewer_gm");
    const sharedRows = await db
      .select({
        playerId: groupMembersTable.playerId,
        groupId: groupsTable.id,
        groupName: groupsTable.name,
      })
      .from(groupMembersTable)
      .innerJoin(
        viewerGm,
        and(eq(viewerGm.groupId, groupMembersTable.groupId), eq(viewerGm.playerId, viewerId)),
      )
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(inArray(groupMembersTable.playerId, ids));
    for (const r of sharedRows) {
      const list = sharedGroupsByPlayer.get(r.playerId) ?? [];
      list.push({ id: r.groupId, name: r.groupName });
      sharedGroupsByPlayer.set(r.playerId, list);
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

// ── GET /social/me/post-insights ─────────────────────────────────────────────
// Premium-only creator analytics: per-post views, reactions, comments, reposts.

router.get(
  "/social/me/post-insights",
  requireAuth,
  attachPlayer,
  attachEntitlement,
  requirePremium,
  async (req, res) => {
    const playerId = req.playerId!;
    const sort = req.query.sort === "views" ? "views" : "recent";
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const orderBy =
      sort === "views"
        ? [desc(postsTable.viewCount), desc(postsTable.createdAt)]
        : [desc(postsTable.createdAt)];

    const posts = await db
      .select({
        id: postsTable.id,
        content: postsTable.content,
        mediaUrl: postsTable.mediaUrl,
        postType: postsTable.postType,
        createdAt: postsTable.createdAt,
        viewCount: postsTable.viewCount,
        engagementScore: postsTable.engagementScore,
      })
      .from(postsTable)
      .where(and(eq(postsTable.playerId, playerId), isNull(postsTable.deletedAt)))
      .orderBy(...orderBy)
      .limit(limit);

    const postIds = posts.map(p => p.id);

    const reactionRows = postIds.length
      ? await db
          .select({ postId: postReactionsTable.postId, count: sql<number>`count(*)::int` })
          .from(postReactionsTable)
          .where(inArray(postReactionsTable.postId, postIds))
          .groupBy(postReactionsTable.postId)
      : [];
    const commentRows = postIds.length
      ? await db
          .select({ postId: postCommentsTable.postId, count: sql<number>`count(*)::int` })
          .from(postCommentsTable)
          .where(inArray(postCommentsTable.postId, postIds))
          .groupBy(postCommentsTable.postId)
      : [];
    const repostRows = postIds.length
      ? await db
          .select({ postId: postRepostsTable.postId, count: sql<number>`count(*)::int` })
          .from(postRepostsTable)
          .where(inArray(postRepostsTable.postId, postIds))
          .groupBy(postRepostsTable.postId)
      : [];

    const reactionMap = new Map(reactionRows.map(r => [r.postId, r.count]));
    const commentMap = new Map(commentRows.map(r => [r.postId, r.count]));
    const repostMap = new Map(repostRows.map(r => [r.postId, r.count]));

    const enriched = posts.map(p => ({
      id: p.id,
      content: p.content,
      mediaUrl: p.mediaUrl ?? null,
      postType: p.postType,
      createdAt: p.createdAt.toISOString(),
      viewCount: p.viewCount,
      reactionCount: reactionMap.get(p.id) ?? 0,
      commentCount: commentMap.get(p.id) ?? 0,
      repostCount: repostMap.get(p.id) ?? 0,
      engagementScore: p.engagementScore,
    }));

    const totals = enriched.reduce(
      (acc, p) => {
        acc.postCount += 1;
        acc.viewCount += p.viewCount;
        acc.reactionCount += p.reactionCount;
        acc.commentCount += p.commentCount;
        acc.repostCount += p.repostCount;
        return acc;
      },
      { postCount: 0, viewCount: 0, reactionCount: 0, commentCount: 0, repostCount: 0 },
    );

    res.json({ posts: enriched, totals });
  },
);

router.get("/social/memories", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const memory = await getMemoryForPlayer(playerId);
  res.json(memory);
});

export default router;
