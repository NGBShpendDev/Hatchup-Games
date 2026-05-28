import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Fake DB state ──────────────────────────────────────────────────────────
// The purge job is pure I/O over a handful of tables. We model each table as
// an in-memory array and replace drizzle operators with predicate functions
// so `where(...)` filters work just like SQL.

type Post = { id: number; deletedAt: Date | null };
type PostComment = { id: number; postId: number };
type PostCommentReaction = { id: number; commentId: number };
type PostReaction = { id: number; postId: number };
type PostRepost = { id: number; postId: number };
type PostView = { id: number; postId: number };

const state = {
  posts: [] as Post[],
  comments: [] as PostComment[],
  commentReactions: [] as PostCommentReaction[],
  reactions: [] as PostReaction[],
  reposts: [] as PostRepost[],
  views: [] as PostView[],
};

function reset() {
  state.posts = [];
  state.comments = [];
  state.commentReactions = [];
  state.reactions = [];
  state.reposts = [];
  state.views = [];
}

// Column stubs — each table column carries its own logical name so the mocked
// drizzle operators can read the right field off a row.
const col = (name: string) => ({ __col: name }) as const;

const postsTable = {
  __store: "posts" as const,
  id: col("id"),
  deletedAt: col("deletedAt"),
};
const postCommentsTable = {
  __store: "comments" as const,
  id: col("id"),
  postId: col("postId"),
};
const postCommentReactionsTable = {
  __store: "commentReactions" as const,
  commentId: col("commentId"),
};
const postReactionsTable = {
  __store: "reactions" as const,
  postId: col("postId"),
};
const postRepostsTable = {
  __store: "reposts" as const,
  postId: col("postId"),
};
const postViewsTable = {
  __store: "views" as const,
  postId: col("postId"),
};

type Pred = (row: Record<string, unknown>) => boolean;

const storeFor = (t: { __store: keyof typeof state }) =>
  state[t.__store] as Array<Record<string, unknown>>;

const fakeDb = {
  select: (_cols: unknown) => ({
    from: (table: { __store: keyof typeof state }) => ({
      where: async (pred: Pred) =>
        storeFor(table).filter((r) => pred(r)).map((r) => ({ id: r.id })),
    }),
  }),
  delete: (table: { __store: keyof typeof state }) => ({
    where: async (pred: Pred) => {
      const list = storeFor(table);
      const kept = list.filter((r) => !pred(r));
      // Mutate in place so the shared `state` reference stays consistent.
      list.length = 0;
      list.push(...kept);
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    postsTable,
    postCommentsTable,
    postCommentReactionsTable,
    postReactionsTable,
    postRepostsTable,
    postViewsTable,
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    and:
      (...parts: Pred[]): Pred =>
      (row) =>
        parts.every((p) => p(row)),
    eq:
      (c: { __col: string }, val: unknown): Pred =>
      (row) =>
        row[c.__col] === val,
    lt:
      (c: { __col: string }, val: unknown): Pred =>
      (row) => {
        const v = row[c.__col];
        if (v == null || val == null) return false;
        return (v as Date | number) < (val as Date | number);
      },
    isNotNull:
      (c: { __col: string }): Pred =>
      (row) =>
        row[c.__col] != null,
    inArray:
      (c: { __col: string }, vals: unknown[]): Pred =>
      (row) =>
        vals.includes(row[c.__col]),
  },
});

mock.module("../lib/logger.ts", {
  namedExports: {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  },
});

const { purgeSoftDeletedPosts } = await import("./postPurgeJob.ts");

const NOW = new Date("2026-05-28T12:00:00Z");
const dayMs = 24 * 60 * 60 * 1000;
// `postPurgeJob` uses a 30-day retention window.
const olderThanRetention = new Date(NOW.getTime() - 31 * dayMs);
const insideRetention = new Date(NOW.getTime() - 10 * dayMs);

function seed() {
  // Two posts that have been soft-deleted long enough to purge.
  state.posts = [
    { id: 1, deletedAt: olderThanRetention },
    { id: 2, deletedAt: olderThanRetention },
    // Fresh soft-delete — should remain.
    { id: 3, deletedAt: insideRetention },
    // Live post — should remain.
    { id: 4, deletedAt: null },
  ];
  state.comments = [
    { id: 10, postId: 1 },
    { id: 11, postId: 1 },
    { id: 12, postId: 2 },
    { id: 20, postId: 3 }, // fresh-deleted post's comment stays
    { id: 21, postId: 4 }, // live post's comment stays
  ];
  state.commentReactions = [
    { id: 100, commentId: 10 },
    { id: 101, commentId: 11 },
    { id: 102, commentId: 12 },
    { id: 200, commentId: 20 },
    { id: 201, commentId: 21 },
  ];
  state.reactions = [
    { id: 300, postId: 1 },
    { id: 301, postId: 2 },
    { id: 302, postId: 3 },
    { id: 303, postId: 4 },
  ];
  state.reposts = [
    { id: 400, postId: 1 },
    { id: 401, postId: 4 },
  ];
  state.views = [
    { id: 500, postId: 1 },
    { id: 501, postId: 2 },
    { id: 502, postId: 3 },
    { id: 503, postId: 4 },
  ];
}

describe("purgeSoftDeletedPosts", () => {
  beforeEach(reset);

  it("hard-removes posts soft-deleted longer than the retention window", async () => {
    seed();
    const result = await purgeSoftDeletedPosts(NOW);
    assert.equal(result.purged, 2);
    const remainingIds = state.posts.map((p) => p.id).sort();
    assert.deepEqual(remainingIds, [3, 4]);
  });

  it("cascades the delete to comments, comment reactions, reactions, reposts, and views", async () => {
    seed();
    await purgeSoftDeletedPosts(NOW);

    // Comments on purged posts (1, 2) are gone; comments on 3 and 4 survive.
    assert.deepEqual(
      state.comments.map((c) => c.id).sort(),
      [20, 21],
    );
    // Comment reactions on the purged-post comments (100, 101, 102) are gone.
    assert.deepEqual(
      state.commentReactions.map((r) => r.id).sort(),
      [200, 201],
    );
    // Reactions on purged posts (300, 301) are gone; 302, 303 survive.
    assert.deepEqual(
      state.reactions.map((r) => r.id).sort(),
      [302, 303],
    );
    // Reposts on purged post (400) gone; 401 survives.
    assert.deepEqual(state.reposts.map((r) => r.id).sort(), [401]);
    // Views on purged posts (500, 501) gone; 502, 503 survive.
    assert.deepEqual(
      state.views.map((v) => v.id).sort(),
      [502, 503],
    );
  });

  it("leaves recently soft-deleted posts (inside retention window) untouched", async () => {
    state.posts = [{ id: 3, deletedAt: insideRetention }];
    const result = await purgeSoftDeletedPosts(NOW);
    assert.equal(result.purged, 0);
    assert.equal(state.posts.length, 1);
  });

  it("never touches posts that have not been soft-deleted", async () => {
    state.posts = [{ id: 4, deletedAt: null }];
    state.comments = [{ id: 21, postId: 4 }];
    state.reactions = [{ id: 303, postId: 4 }];
    const result = await purgeSoftDeletedPosts(NOW);
    assert.equal(result.purged, 0);
    assert.equal(state.posts.length, 1);
    assert.equal(state.comments.length, 1);
    assert.equal(state.reactions.length, 1);
  });

  it("is a no-op when nothing is past the retention window", async () => {
    state.posts = [
      { id: 3, deletedAt: insideRetention },
      { id: 4, deletedAt: null },
    ];
    const result = await purgeSoftDeletedPosts(NOW);
    assert.equal(result.purged, 0);
    assert.equal(state.posts.length, 2);
  });

  it("uses exactly the 30-day boundary (29d 23h kept, 30d 1s purged)", async () => {
    state.posts = [
      { id: 90, deletedAt: new Date(NOW.getTime() - (30 * dayMs - 3_600_000)) }, // 29d 23h
      { id: 91, deletedAt: new Date(NOW.getTime() - (30 * dayMs + 1_000)) }, // 30d + 1s
    ];
    const result = await purgeSoftDeletedPosts(NOW);
    assert.equal(result.purged, 1);
    assert.deepEqual(state.posts.map((p) => p.id), [90]);
  });
});
