// Tests for the GET /social/trending ranking + window logic.
//
// We mock @clerk/express, drizzle-orm helpers, and @workspace/db so the
// route runs against in-memory state. The fake `db.select(...)` chain
// discriminates by the table sentinel passed to `.from()` so the trending
// aggregation, comment counts, and repost counts are all served from the
// same `db` object.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ──────────────────────────────────────────────────────────
interface PostRow {
  id: number;
  playerId: number;
  content: string;
  mediaUrl: string | null;
  postType: string;
  creatureId: number | null;
  xpEarned: number;
  energyEarned: number;
  isFlagged: boolean;
  engagementScore: number;
  viewCount: number;
  createdAt: Date;
  deletedAt: Date | null;
  metadata: Record<string, unknown> | null;
}

interface ViewRow { postId: number; createdAt: Date }

const state = {
  player: {
    id: 1,
    clerkId: "u_1",
    username: "ash",
    displayName: "Ash",
    avatarUrl: null as string | null,
    creatorBadge: null as string | null,
    isMinor: false,
  },
  posts: [] as PostRow[],
  views: [] as ViewRow[],
};

function resetState() {
  state.posts = [];
  state.views = [];
}

// ── Table sentinels ──────────────────────────────────────────────────────────
const postsTable = { __t: "postsTable" };
const postViewsTable = { __t: "postViewsTable" };
const postCommentsTable = { __t: "postCommentsTable" };
const postRepostsTable = { __t: "postRepostsTable" };
const postReactionsTable = { __t: "postReactionsTable" };
const postCommentReactionsTable = { __t: "postCommentReactionsTable" };
const playersTable = { __t: "playersTable" };
const playerFollowsTable = { __t: "playerFollowsTable" };
const hatchlingsTable = { __t: "hatchlingsTable" };
const groupMembersTable = { __t: "groupMembersTable" };
const groupsTable = { __t: "groupsTable" };
const notificationsTable = { __t: "notificationsTable" };

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: { getAuth: () => ({ userId: "u_1" }) },
});

// social.ts imports several Zod body schemas from @workspace/api-zod for
// write endpoints. Trending is read-only, so a stub schema with .safeParse
// is enough to satisfy the imports without pulling in the generated module.
const stubSchema = { safeParse: (data: unknown) => ({ success: true, data }) };
mock.module("@workspace/api-zod", {
  namedExports: {
    CreatePostBody: stubSchema,
    ReactToPostBody: stubSchema,
    AddPostCommentBody: stubSchema,
    EditPostCommentBody: stubSchema,
    FollowPlayerBody: stubSchema,
    RepostPostBody: stubSchema,
  },
});

// social.ts imports these without a .ts extension, which the strict ESM
// resolver can't find. Mock them by their unextended specifier so the
// loader resolves through the mock registry instead of the filesystem.
mock.module(new URL("../../middlewares/auth.ts", import.meta.url).href, {
  namedExports: {
    requireAuth: (req: any, _res: any, next: () => void) => {
      req.clerkUserId = "u_1";
      next();
    },
    attachPlayer: (req: any, _res: any, next: () => void) => {
      req.playerId = state.player.id;
      next();
    },
  },
});

mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => {} },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    requirePremium: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/minorGuard.ts", {
  namedExports: {
    blockMinorSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: {
    blockSuspendedSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    socialWriteLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    postViewLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// Capture the cutoff Date passed into `gte(postViewsTable.createdAt, cutoff)`
// so the fake db can apply the window filter to in-memory view rows.
let lastWindowCutoff: Date | null = null;

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    or: () => ({}),
    ne: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_strings: TemplateStringsArray, ..._values: unknown[]) => ({}),
      { raw: (_s: string) => ({}) },
    ),
    inArray: () => ({}),
    notInArray: () => ({}),
    ilike: () => ({}),
    isNull: () => ({}),
    isNotNull: () => ({}),
    lt: () => ({}),
    gte: (_col: unknown, value: Date) => {
      lastWindowCutoff = value;
      return {};
    },
  },
});

// postPurgeJob is loaded transitively by social.ts but is never exercised by
// the trending route. Stub it so it doesn't try to walk the real drizzle
// helpers (which the mock above intentionally narrows).
mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async () => 0, RETENTION_DAYS: 30 },
});
// safety.ts pulls in tables and email services the trending route never
// touches. Only `getHiddenPlayerIds` is referenced from social.ts.
mock.module("../safety.ts", {
  namedExports: { getHiddenPlayerIds: async () => [] },
});

mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: (t: unknown) => t },
});

// Fake DB ---------------------------------------------------------------------
// `db.query.<table>.findFirst/findMany` is keyed by table name.
// `db.select(...).from(table)` discriminates on the table sentinel.

function liveTrendingViewRows(limit: number) {
  const cutoffMs = lastWindowCutoff ? lastWindowCutoff.getTime() : 0;
  const counts = new Map<number, number>();
  for (const v of state.views) {
    if (v.createdAt.getTime() >= cutoffMs) {
      counts.set(v.postId, (counts.get(v.postId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([postId, recentViews]) => ({ postId, recentViews }))
    .sort((a, b) => b.recentViews - a.recentViews)
    .slice(0, limit);
}

const queryHandlers: Record<string, any> = {
  playersTable: {
    findFirst: async () => state.player,
    findMany: async () => [state.player],
  },
  postsTable: {
    findFirst: async () => state.posts[0],
    findMany: async (_args?: any) =>
      state.posts.filter(p => !p.isFlagged && p.deletedAt === null),
  },
  postReactionsTable: { findMany: async () => [] },
  postCommentsTable: { findMany: async () => [] },
  postCommentReactionsTable: { findMany: async () => [] },
  postRepostsTable: {
    findFirst: async () => undefined,
    findMany: async () => [],
  },
  hatchlingsTable: { findFirst: async () => undefined },
  playerFollowsTable: { findMany: async () => [] },
};

const fakeDb = {
  query: new Proxy({}, {
    get: (_t, name: string) =>
      queryHandlers[name] ?? { findFirst: async () => undefined, findMany: async () => [] },
  }),
  select: (_cols?: any) => ({
    from: (table: any) => {
      // postViewsTable: trending aggregation chain ending in .limit(n)
      if (table === postViewsTable) {
        const chain: any = {
          where: () => chain,
          groupBy: () => chain,
          orderBy: () => chain,
          limit: async (n: number) => liveTrendingViewRows(n),
        };
        return chain;
      }
      // count(*) chains used by enrichPost and the reaction/comment tie-break
      // aggregations — both `.where().then(...)` and `.where().groupBy().then(...)`
      // resolve to an empty rowset.
      const countChain: any = {
        where: () => countChain,
        groupBy: () => countChain,
        then: (resolve: any, reject: any) =>
          Promise.resolve([]).then(resolve, reject),
      };
      return countChain;
    },
  }),
  insert: (_table: unknown) => ({
    values: () => ({
      returning: async () => [{ id: 1 }],
      onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }),
      then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
    }),
  }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  delete: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }),
  execute: async () => ({ rows: [] }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    postsTable,
    postViewsTable,
    postReactionsTable,
    postCommentsTable,
    postCommentRevisionsTable: {},
    postCommentReactionsTable,
    userReportsTable: {},
    playerFollowsTable,
    postRepostsTable,
    playersTable,
    hatchlingsTable,
    groupMembersTable,
    groupsTable,
    notificationsTable,
  },
});

// ── Server ───────────────────────────────────────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(socialRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

beforeEach(() => {
  resetState();
  lastWindowCutoff = null;
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function makePost(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: 1,
    playerId: 1,
    content: "Post",
    mediaUrl: null,
    postType: "general",
    creatureId: null,
    xpEarned: 0,
    energyEarned: 0,
    isFlagged: false,
    engagementScore: 0,
    viewCount: 0,
    createdAt: new Date("2026-05-28T00:00:00.000Z"),
    deletedAt: null,
    metadata: null,
    ...overrides,
  };
}

interface TrendingResponse {
  posts: Array<{ id: number; recentViewCount: number }>;
  window: string;
}
async function getTrending(qs = ""): Promise<{ res: Response; body: TrendingResponse }> {
  const res = await fetch(`${baseUrl}/social/trending${qs}`);
  return { res, body: (await res.json()) as TrendingResponse };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("GET /social/trending", () => {
  it("returns an empty list when no views exist (no crash)", async () => {
    state.posts = [makePost({ id: 1 })];
    const { res, body } = await getTrending();
    assert.equal(res.status, 200);
    assert.deepEqual(body, { posts: [], window: "day" });
  });

  it("orders posts by recent view count (desc)", async () => {
    state.posts = [
      makePost({ id: 1, createdAt: new Date("2026-05-28T10:00:00.000Z") }),
      makePost({ id: 2, createdAt: new Date("2026-05-28T10:00:00.000Z") }),
      makePost({ id: 3, createdAt: new Date("2026-05-28T10:00:00.000Z") }),
    ];
    const now = new Date("2026-05-28T12:00:00.000Z");
    // Post 2 has the most views, then post 1, then post 3.
    state.views = [
      { postId: 2, createdAt: now }, { postId: 2, createdAt: now }, { postId: 2, createdAt: now },
      { postId: 1, createdAt: now }, { postId: 1, createdAt: now },
      { postId: 3, createdAt: now },
    ];
    const { res, body } = await getTrending();
    assert.equal(res.status, 200);
    assert.equal(body.window, "day");
    assert.deepEqual(body.posts.map((p: any) => p.id), [2, 1, 3]);
    assert.deepEqual(body.posts.map((p: any) => p.recentViewCount), [3, 2, 1]);
  });

  it("breaks ties by recency (newer post first)", async () => {
    state.posts = [
      makePost({ id: 1, createdAt: new Date("2026-05-27T00:00:00.000Z") }),
      makePost({ id: 2, createdAt: new Date("2026-05-28T00:00:00.000Z") }), // newer
    ];
    const now = new Date("2026-05-28T12:00:00.000Z");
    // Equal view counts → newer post should win.
    state.views = [
      { postId: 1, createdAt: now }, { postId: 1, createdAt: now },
      { postId: 2, createdAt: now }, { postId: 2, createdAt: now },
    ];
    const { res, body } = await getTrending();
    assert.equal(res.status, 200);
    assert.deepEqual(body.posts.map((p: any) => p.id), [2, 1]);
  });

  it("excludes views outside the 24h window", async () => {
    state.posts = [
      makePost({ id: 1 }),
      makePost({ id: 2 }),
    ];
    const now = Date.now();
    state.views = [
      // Post 1: one fresh view inside the window.
      { postId: 1, createdAt: new Date(now - 60 * 60 * 1000) },
      // Post 2: many views but all 2 days old — outside 24h window.
      { postId: 2, createdAt: new Date(now - 48 * 60 * 60 * 1000) },
      { postId: 2, createdAt: new Date(now - 48 * 60 * 60 * 1000) },
      { postId: 2, createdAt: new Date(now - 48 * 60 * 60 * 1000) },
    ];
    const { res, body } = await getTrending("?window=day");
    assert.equal(res.status, 200);
    assert.equal(body.window, "day");
    assert.deepEqual(body.posts.map((p: any) => p.id), [1]);
  });

  it("includes views inside the 7d window that the 24h window would exclude", async () => {
    state.posts = [makePost({ id: 2 })];
    const now = Date.now();
    // 2 days old: outside `day`, inside `week`.
    state.views = [
      { postId: 2, createdAt: new Date(now - 48 * 60 * 60 * 1000) },
      { postId: 2, createdAt: new Date(now - 48 * 60 * 60 * 1000) },
    ];
    const dayResult = await getTrending("?window=day");
    assert.deepEqual(dayResult.body.posts, []);

    const weekResult = await getTrending("?window=week");
    assert.equal(weekResult.body.window, "week");
    assert.deepEqual(weekResult.body.posts.map((p: any) => p.id), [2]);
  });

  it("filters out flagged posts even when they have views", async () => {
    state.posts = [
      makePost({ id: 1, isFlagged: true }),
      makePost({ id: 2, isFlagged: false }),
    ];
    const now = new Date();
    state.views = [
      // Flagged post has more views but must be excluded.
      { postId: 1, createdAt: now }, { postId: 1, createdAt: now }, { postId: 1, createdAt: now },
      { postId: 2, createdAt: now },
    ];
    const { res, body } = await getTrending();
    assert.equal(res.status, 200);
    assert.deepEqual(body.posts.map((p: any) => p.id), [2]);
  });

  it("filters out soft-deleted posts even when they have views", async () => {
    state.posts = [
      makePost({ id: 1, deletedAt: new Date() }),
      makePost({ id: 2 }),
    ];
    const now = new Date();
    state.views = [
      { postId: 1, createdAt: now }, { postId: 1, createdAt: now },
      { postId: 2, createdAt: now },
    ];
    const { res, body } = await getTrending();
    assert.deepEqual(body.posts.map((p: any) => p.id), [2]);
  });
});
