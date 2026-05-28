// Tests for the GET /social/feed safety filtering.
//
// The main social feed must mirror trending's safety filters:
//   1. Posts by anyone on the viewer's `getHiddenPlayerIds` list are
//      excluded (blocked-author hiding, both directions).
//   2. Posts by accounts flagged as minors (`isMinor=true`) are excluded
//      regardless of viewer — `blockMinorSocialWrite` should have
//      prevented those posts in the first place, so any legacy/bypass
//      content must not be amplified by the feed.
//
// Mock surface is modeled on social.trending.test.ts: the fake db lets
// `findMany({ where })` on postsTable filter by hidden ids via predicate
// inspection so we can verify the blocked-author filter happens at the
// query layer, while the minor-author filter happens in memory after
// the playersTable author lookup.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

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

interface AuthorRow {
  id: number;
  clerkId?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
  creatorBadge?: string | null;
  isMinor: boolean;
}

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
  authors: [] as AuthorRow[],
  hiddenPlayerIds: [] as number[],
};

function resetState() {
  state.posts = [];
  state.authors = [];
  state.hiddenPlayerIds = [];
}

// ── Table sentinels ──────────────────────────────────────────────────────────
const postsTable = { __t: "postsTable", playerId: { __col: "playerId" } };
const postCommentRevisionsTable = { __t: "postCommentRevisionsTable" };
const userReportsTable = { __t: "userReportsTable" };
const postViewsTable = { __t: "postViewsTable" };
const postCommentsTable = { __t: "postCommentsTable" };
const postRepostsTable = { __t: "postRepostsTable" };
const postReactionsTable = { __t: "postReactionsTable" };
const postCommentReactionsTable = { __t: "postCommentReactionsTable" };
const playersTable = { __t: "playersTable", id: { __col: "id" } };
const playerFollowsTable = { __t: "playerFollowsTable" };
const hatchlingsTable = { __t: "hatchlingsTable" };
const groupMembersTable = { __t: "groupMembersTable" };
const groupsTable = { __t: "groupsTable" };
const notificationsTable = { __t: "notificationsTable" };

// ── Mocks ────────────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: { getAuth: () => ({ userId: "u_1" }) },
});

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

mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async () => 0, RETENTION_DAYS: 30 },
});

mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => state.hiddenPlayerIds,
    filterDiscoverableCandidates: async <T extends { id: number; locationVisibility: string | null; isMinor: boolean | null }>(
      _viewerId: number | null | undefined,
      players: T[],
    ) => {
      const hidden = new Set(state.hiddenPlayerIds);
      return players.filter(
        (p) => !hidden.has(p.id) && p.locationVisibility !== "hidden" && !p.isMinor,
      );
    },
  },
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
    emailResendLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    consumeEmailResendBudget: (_req: unknown) => true,
  },
});

// Capture predicates so the fake findMany on postsTable can apply the
// notInArray(postsTable.playerId, hiddenIds) filter the route builds.
let lastNotInArrayIds: number[] | null = null;

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
    notInArray: (col: unknown, ids: number[]) => {
      if (col === postsTable.playerId) {
        lastNotInArrayIds = ids;
      }
      return {};
    },
    ilike: () => ({}),
    isNull: () => ({}),
    isNotNull: () => ({}),
    lt: () => ({}),
    gt: () => ({}),
    gte: () => ({}),
  },
});

mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: (t: unknown) => t },
});

const queryHandlers: Record<string, any> = {
  playersTable: {
    findFirst: async () => state.player,
    // Author lookup for minor-author filtering. When tests seed
    // `state.authors`, return them; otherwise fall back to the viewer.
    findMany: async () =>
      state.authors.length > 0 ? state.authors : [state.player],
  },
  postsTable: {
    findFirst: async () => state.posts[0],
    // The feed route builds where = isNull(deletedAt) [+ notInArray when
    // hiddenIds non-empty]. We simulate that by filtering on the captured
    // hidden id list and dropping soft-deleted rows.
    findMany: async (_args?: any) => {
      const hidden = new Set(lastNotInArrayIds ?? []);
      return state.posts
        .filter(p => p.deletedAt === null)
        .filter(p => !hidden.has(p.playerId));
    },
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
    from: (_table: any) => {
      const chain: any = {
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: any, reject: any) =>
          Promise.resolve([]).then(resolve, reject),
      };
      return chain;
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
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    postsTable,
    postViewsTable,
    postReactionsTable,
    postCommentsTable,
    postCommentRevisionsTable,
    postCommentReactionsTable,
    playerFollowsTable,
    postRepostsTable,
    playersTable,
    hatchlingsTable,
    groupMembersTable,
    groupsTable,
    notificationsTable,
    userReportsTable,
    blockedUsersTable: { __t: "blockedUsers" },
    moderationAuditLogTable: { __t: "moderationAuditLog" },
  },
});

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
  lastNotInArrayIds = null;
});

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

interface FeedResponse {
  posts: Array<{ id: number; playerId: number }>;
  nextCursor: number | null;
  total: number;
}
async function getFeed(qs = ""): Promise<{ res: Response; body: FeedResponse }> {
  const res = await fetch(`${baseUrl}/social/feed${qs}`);
  return { res, body: (await res.json()) as FeedResponse };
}

describe("GET /social/feed safety filtering", () => {
  it("excludes posts authored by players the viewer has hidden/blocked", async () => {
    state.posts = [
      makePost({ id: 1, playerId: 42 }), // blocked
      makePost({ id: 2, playerId: 7 }),
      makePost({ id: 3, playerId: 9 }),
    ];
    state.authors = [
      { id: 7, isMinor: false },
      { id: 9, isMinor: false },
      { id: 42, isMinor: false },
    ];
    state.hiddenPlayerIds = [42];

    const { res, body } = await getFeed();
    assert.equal(res.status, 200);
    const ids = body.posts.map(p => p.id).sort();
    assert.deepEqual(ids, [2, 3]);
    assert.ok(body.posts.every(p => p.playerId !== 42));
  });

  it("excludes posts authored by minor accounts even when the viewer has no blocks", async () => {
    state.posts = [
      makePost({ id: 1, playerId: 99 }), // minor — must be hidden
      makePost({ id: 2, playerId: 7 }),  // adult — must surface
    ];
    state.authors = [
      { id: 7, isMinor: false },
      { id: 99, isMinor: true },
    ];

    const { res, body } = await getFeed();
    assert.equal(res.status, 200);
    assert.deepEqual(body.posts.map(p => p.id), [2]);
    assert.ok(body.posts.every(p => p.playerId !== 99));
  });

  it("applies both filters together: blocked AND minor authors are excluded", async () => {
    state.posts = [
      makePost({ id: 1, playerId: 42 }), // blocked adult
      makePost({ id: 2, playerId: 99 }), // minor
      makePost({ id: 3, playerId: 7 }),  // visible adult
    ];
    state.authors = [
      { id: 7, isMinor: false },
      { id: 42, isMinor: false },
      { id: 99, isMinor: true },
    ];
    state.hiddenPlayerIds = [42];

    const { res, body } = await getFeed();
    assert.equal(res.status, 200);
    assert.deepEqual(body.posts.map(p => p.id), [3]);
  });

  it("surfaces posts normally when no authors are blocked or minor", async () => {
    state.posts = [
      makePost({ id: 1, playerId: 7 }),
      makePost({ id: 2, playerId: 9 }),
    ];
    state.authors = [
      { id: 7, isMinor: false },
      { id: 9, isMinor: false },
    ];

    const { res, body } = await getFeed();
    assert.equal(res.status, 200);
    const ids = body.posts.map(p => p.id).sort();
    assert.deepEqual(ids, [1, 2]);
  });
});
