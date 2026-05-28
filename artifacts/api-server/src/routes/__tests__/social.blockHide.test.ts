// Block-and-hide tests for the post permalink + comment endpoints.
//
// When a viewer has blocked someone (or vice versa), that other user's
// comments must vanish from the viewer's perspective:
//   1. enrichPost's top-3 preview drops the blocked author's comments.
//   2. GET /social/posts/:id/comments drops them from the full list.
//   3. commentCount on the enriched post reflects the *filtered* view, so
//      the UI doesn't dangle a count that the viewer can't see.
//   4. Anonymous permalink viewers (logged out) still see everything —
//      blocks are per-viewer, not global content removal.
//
// The route is exercised against a real Express app with the DB / auth /
// peripheral modules mocked. `getHiddenPlayerIds` is the seam we toggle to
// simulate "viewer V has blocked author A".

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

interface PostRow { id: number; playerId: number; content: string; deletedAt?: Date | null; createdAt: Date; mediaUrl?: string | null; postType: string; creatureId?: number | null; xpEarned: number; energyEarned: number; isFlagged: boolean; engagementScore: number; viewCount: number; metadata?: unknown }
interface PlayerRow { id: number; clerkId?: string | null; displayName?: string | null; username?: string | null; avatarUrl?: string | null; creatorBadge?: string | null }
interface CommentRow { id: number; postId: number; playerId: number; content: string; createdAt: Date; updatedAt?: Date | null }

const state = {
  posts: new Map<number, PostRow>(),
  players: new Map<number, PlayerRow>(),
  comments: [] as CommentRow[],
  // viewerId -> list of hidden player ids (blocked either direction).
  hiddenByViewer: new Map<number, number[]>(),
  // Set when a test wants the request to be treated as authenticated.
  authPlayerId: null as number | null,
  authClerkId: null as string | null,
};

function resetState() {
  state.posts = new Map();
  state.players = new Map();
  state.comments = [];
  state.hiddenByViewer = new Map();
  state.authPlayerId = null;
  state.authClerkId = null;
}

// ── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authClerkId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// attachPlayer's mock simply forwards state.authPlayerId onto the request,
// which is what the real middleware does after looking up the clerk session.
mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (req: { playerId?: number | null }, _res: unknown, next: () => void) => {
      req.playerId = state.authPlayerId;
      next();
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
mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => undefined },
});
mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async () => 0, RETENTION_DAYS: 30 },
});

// The block-and-hide behavior is driven entirely by getHiddenPlayerIds,
// so we route it through state to simulate per-viewer block lists.
mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async (viewerId: number) =>
      state.hiddenByViewer.get(viewerId) ?? [],
  },
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

// ── drizzle predicate builder mocks ─────────────────────────────────────────
interface Pred { __op: string; col?: { __col?: string; __table?: string }; val?: unknown; args?: Pred[] }
const col = (table: string, name: string) => ({ __table: table, __col: name });

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (c: { __col?: string; __table?: string }, v: unknown) => ({ __op: "eq", col: c, val: v }),
    and: (...args: Pred[]) => ({ __op: "and", args }),
    or: (...args: Pred[]) => ({ __op: "or", args }),
    ne: (c: { __col?: string }, v: unknown) => ({ __op: "ne", col: c, val: v }),
    desc: () => ({}),
    gt: () => ({}),
    gte: () => ({}),
    notInArray: () => ({}),
    ilike: () => ({}),
    inArray: (c: { __col?: string; __table?: string }, v: unknown[]) => ({ __op: "inArray", col: c, val: v }),
    notInArray: (c: { __col?: string; __table?: string }, v: unknown[]) => ({ __op: "notInArray", col: c, val: v }),
    isNull: () => ({}),
    isNotNull: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});
mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: () => ({}) },
});

function findPred(node: Pred | undefined, op: string, table: string, colName: string): Pred | undefined {
  if (!node) return undefined;
  if ((node.__op === "and" || node.__op === "or") && node.args) {
    for (const a of node.args) {
      const r = findPred(a, op, table, colName);
      if (r) return r;
    }
    return undefined;
  }
  if (node.__op === op && node.col?.__col === colName && node.col?.__table === table) return node;
  return undefined;
}

const postsTable = { id: col("posts", "id"), playerId: col("posts", "playerId") };
const postCommentsTable = { id: col("comments", "id"), postId: col("comments", "postId"), playerId: col("comments", "playerId") };
const postCommentReactionsTable = { commentId: col("commentReactions", "commentId"), playerId: col("commentReactions", "playerId") };
const playersTable = { id: col("players", "id"), clerkId: col("players", "clerkId") };
const postReactionsTable = { postId: col("postReactions", "postId") };
const postRepostsTable = { postId: col("postReposts", "postId"), playerId: col("postReposts", "playerId") };
const hatchlingsTable = { id: col("hatchlings", "id") };

const fakeDb = {
  query: {
    postsTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "eq", "posts", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        const p = state.posts.get(id);
        return p ? { ...p } : undefined;
      },
    },
    playersTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "eq", "players", "id")?.val as number | undefined;
        if (id !== undefined) return state.players.get(id);
        const clerkId = findPred(where, "eq", "players", "clerkId")?.val as string | undefined;
        if (clerkId !== undefined) {
          for (const p of state.players.values()) {
            if (p.clerkId === clerkId) return p;
          }
        }
        return undefined;
      },
    },
    postReactionsTable: {
      findMany: async () => [],
    },
    postCommentsTable: {
      findMany: async ({ where }: { where?: Pred }) => {
        const postId = findPred(where, "eq", "comments", "postId")?.val as number | undefined;
        const rows = state.comments.filter(c => c.postId === postId);
        // Route asks for desc(createdAt); mimic that ordering.
        return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      },
    },
    postCommentReactionsTable: {
      findMany: async () => [],
    },
    postRepostsTable: {
      findFirst: async () => undefined,
    },
    hatchlingsTable: {
      findFirst: async () => undefined,
    },
  },
  select: (_proj: unknown) => ({
    from: (t: unknown) => ({
      where: (cond: Pred) =>
        Promise.resolve([
          {
            count: (() => {
              // Only enrichPost's two count() queries hit `select` in the
              // surfaces under test: total comments on a post and total
              // reposts. Differentiate by which table the predicate names.
              if (t === postCommentsTable) {
                const postId = findPred(cond, "eq", "comments", "postId")?.val as number | undefined;
                return state.comments.filter(c => c.postId === postId).length;
              }
              return 0;
            })(),
          },
        ]),
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    postsTable,
    postViewsTable: {},
    postReactionsTable,
    postCommentsTable,
    postCommentRevisionsTable: {},
    postCommentReactionsTable,
    playerFollowsTable: {},
    postRepostsTable,
    playersTable,
    hatchlingsTable,
    groupMembersTable: {},
    groupsTable: {},
    userReportsTable: {},
    notificationsTable: {},
  },
});

// ── Server setup ─────────────────────────────────────────────────────────────
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

// ── Fixtures ─────────────────────────────────────────────────────────────────
const VIEWER_ID = 1;
const VIEWER_CLERK_ID = "user_viewer";
const FRIEND_ID = 2;
const BLOCKED_ID = 99;
const POST_AUTHOR_ID = 7;

function seedFixture() {
  state.players.set(VIEWER_ID, { id: VIEWER_ID, clerkId: VIEWER_CLERK_ID, displayName: "Viewer" });
  state.players.set(FRIEND_ID, { id: FRIEND_ID, displayName: "Friend" });
  state.players.set(BLOCKED_ID, { id: BLOCKED_ID, displayName: "Blocked" });
  state.players.set(POST_AUTHOR_ID, { id: POST_AUTHOR_ID, displayName: "Author" });

  state.posts.set(10, {
    id: 10,
    playerId: POST_AUTHOR_ID,
    content: "Hello",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    postType: "general",
    xpEarned: 0,
    energyEarned: 0,
    isFlagged: false,
    engagementScore: 0,
    viewCount: 0,
    deletedAt: null,
    metadata: null,
  });

  // Six comments total: 3 from BLOCKED_ID (newest), 3 from FRIEND_ID
  // (older). Newest-first ordering means the unfiltered top-3 would be
  // all blocked, so filtering must surface the friend's comments instead.
  const t0 = Date.parse("2026-01-01T01:00:00Z");
  const mk = (id: number, playerId: number, offsetMin: number, content: string): CommentRow => ({
    id,
    postId: 10,
    playerId,
    content,
    createdAt: new Date(t0 + offsetMin * 60_000),
    updatedAt: null,
  });
  state.comments = [
    mk(101, FRIEND_ID, 0, "friend-1"),
    mk(102, FRIEND_ID, 1, "friend-2"),
    mk(103, FRIEND_ID, 2, "friend-3"),
    mk(201, BLOCKED_ID, 10, "blocked-1"),
    mk(202, BLOCKED_ID, 11, "blocked-2"),
    mk(203, BLOCKED_ID, 12, "blocked-3"),
  ];
}

beforeEach(() => {
  resetState();
  seedFixture();
});

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function getPost(id: number) {
  const res = await fetch(`${baseUrl}/social/posts/${id}`);
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function getComments(id: number) {
  const res = await fetch(`${baseUrl}/social/posts/${id}/comments`);
  return { status: res.status, body: await res.json() as Array<Record<string, unknown>> };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("block-and-hide for comments", () => {
  it("enrichPost: signed-in viewer who blocked the author sees no blocked comments in the top-3 preview", async () => {
    state.authPlayerId = VIEWER_ID;
    state.authClerkId = VIEWER_CLERK_ID;
    state.hiddenByViewer.set(VIEWER_ID, [BLOCKED_ID]);

    const { status, body } = await getPost(10);
    assert.equal(status, 200);

    const comments = body.comments as Array<{ playerId: number; content: string }>;
    assert.equal(comments.length, 3, "top-3 preview should contain exactly three comments");
    for (const c of comments) {
      assert.notEqual(c.playerId, BLOCKED_ID, `blocked author must not appear in preview (got ${c.content})`);
    }
    // The only remaining authors are friends.
    assert.deepEqual(
      comments.map(c => c.content).sort(),
      ["friend-1", "friend-2", "friend-3"],
    );
  });

  it("enrichPost: commentCount on the post reflects the filtered view, not the raw total", async () => {
    state.authPlayerId = VIEWER_ID;
    state.authClerkId = VIEWER_CLERK_ID;
    state.hiddenByViewer.set(VIEWER_ID, [BLOCKED_ID]);

    const { body } = await getPost(10);
    // 6 raw comments, 3 of which belong to the blocked user → 3 visible.
    assert.equal(body.commentCount, 3, "commentCount must match the number of visible comments");
  });

  it("GET /social/posts/:id/comments drops the blocked author's comments from the full list", async () => {
    state.authPlayerId = VIEWER_ID;
    state.authClerkId = VIEWER_CLERK_ID;
    state.hiddenByViewer.set(VIEWER_ID, [BLOCKED_ID]);

    const { status, body } = await getComments(10);
    assert.equal(status, 200);
    assert.equal(body.length, 3, "all blocked comments should be removed");
    for (const c of body) {
      assert.notEqual(c.playerId, BLOCKED_ID);
    }
  });

  it("anonymous permalink viewers still see every comment (blocks are per-viewer)", async () => {
    // No auth set: viewerId stays null in enrichPost, so getHiddenPlayerIds
    // is never consulted and nothing is filtered.
    state.hiddenByViewer.set(VIEWER_ID, [BLOCKED_ID]);

    const { status, body } = await getPost(10);
    assert.equal(status, 200);
    assert.equal(body.commentCount, 6, "anonymous viewers see the raw total");

    const comments = body.comments as Array<{ playerId: number }>;
    assert.equal(comments.length, 3, "still capped at the top-3 preview size");
    // With no filtering and newest-first ordering, the preview is entirely
    // from the (newer) blocked author — exactly what the signed-in viewer
    // would have seen without the block list applied.
    for (const c of comments) {
      assert.equal(c.playerId, BLOCKED_ID);
    }
  });

  it("hiding is symmetric: when the *other* user has blocked the viewer, the viewer also stops seeing their comments", async () => {
    // safety.getHiddenPlayerIds already returns both directions (blocker
    // or blocked); we simulate that by adding BLOCKED_ID to the viewer's
    // hidden list as if BLOCKED_ID had blocked the viewer.
    state.authPlayerId = VIEWER_ID;
    state.authClerkId = VIEWER_CLERK_ID;
    state.hiddenByViewer.set(VIEWER_ID, [BLOCKED_ID]);

    const { body: postBody } = await getPost(10);
    assert.equal(postBody.commentCount, 3);

    const { body: list } = await getComments(10);
    assert.equal(list.length, 3);
    assert.ok(
      list.every(c => c.playerId !== BLOCKED_ID),
      "no blocked-direction comments should leak through either endpoint",
    );
  });

  it("a viewer with no blocks sees every comment and the raw total", async () => {
    state.authPlayerId = VIEWER_ID;
    state.authClerkId = VIEWER_CLERK_ID;
    // No entry in hiddenByViewer → no filtering.

    const { body: postBody } = await getPost(10);
    assert.equal(postBody.commentCount, 6, "no blocks → raw count path is exercised");

    const { body: list } = await getComments(10);
    assert.equal(list.length, 6);
  });
});
