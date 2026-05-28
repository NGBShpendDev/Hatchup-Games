// Tests for GET /social/posts/:id/view-series.
//
// The view-series endpoint powers the creator's sparkline chart and has
// three behavioral contracts that this file pins down:
//   1. It's owner-only — non-owners get 403, missing/deleted posts get 404.
//   2. It always returns exactly `windowHours` (24) hourly buckets, oldest
//      first, zero-filled for hours with no views.
//   3. Views in different hours land in the right bucket and `total` is the
//      sum of all bucket counts.
//
// The route is exercised against a real Express server with the DB / auth /
// peripheral modules mocked out. The fake DB lets the test seed
// post_views rows with explicit createdAt timestamps so it can verify the
// date_trunc('hour', ...) bucketing logic the route applies.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

interface PostRow { id: number; playerId: number; viewCount: number; deletedAt?: Date | null }
interface ViewRecord { postId: number; viewerKey: string; viewDate: string; createdAt: Date }

const state = {
  posts: new Map<number, PostRow>(),
  views: [] as ViewRecord[],
  // The playerId attachPlayer should put on the request for the next call.
  currentPlayerId: 1 as number | null,
};

function resetState() {
  state.posts = new Map();
  state.views = [];
  state.currentPlayerId = 1;
}

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "user_test" }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// requireAuth: pass-through. attachPlayer: set req.playerId from state so
// tests can swap who the "viewer" is between non-owner and owner cases.
mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (req: { playerId?: number | null }, _res: unknown, next: () => void) => {
      req.playerId = state.currentPlayerId ?? undefined;
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
mock.module("../safety.ts", {
  namedExports: { getHiddenPlayerIds: async () => [] },
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

// Tagged-object drizzle predicates so the fake db can walk a `where` tree
// and pull out the values the route passed in (postId filter, cutoff time).
interface Pred { __op: string; col?: { __col?: string }; val?: unknown; args?: Pred[] }
const col = (name: string) => ({ __col: name });

mock.module("drizzle-orm", {
  namedExports: {
    eq: (c: { __col?: string }, v: unknown) => ({ __op: "eq", col: c, val: v }),
    and: (...args: Pred[]) => ({ __op: "and", args }),
    or: () => ({}),
    ne: (c: { __col?: string }, v: unknown) => ({ __op: "ne", col: c, val: v }),
    desc: () => ({}),
    gt: () => ({}),
    gte: (c: { __col?: string }, v: unknown) => ({ __op: "gte", col: c, val: v }),
    ilike: () => ({}),
    inArray: () => ({}),
    notInArray: () => ({}),
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

function findPred(node: Pred | undefined, op: string, colName: string): Pred | undefined {
  if (!node) return undefined;
  if (node.__op === "and" && node.args) {
    for (const a of node.args) {
      const r = findPred(a, op, colName);
      if (r) return r;
    }
    return undefined;
  }
  if (node.__op === op && node.col?.__col === colName) return node;
  return undefined;
}

const postsTable = { id: col("id") };
const postViewsTable = {
  id: col("id"),
  postId: col("postId"),
  viewerKey: col("viewerKey"),
  viewDate: col("viewDate"),
  createdAt: col("createdAt"),
};
const playersTable = { id: col("id"), clerkId: col("clerkId") };

// Bucket a Date to the top of its hour, mirroring date_trunc('hour', ...).
function truncHour(d: Date): Date {
  const t = d.getTime();
  return new Date(t - (t % 3600_000));
}

const fakeDb = {
  query: {
    postsTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "eq", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        const row = state.posts.get(id);
        return row ? { ...row } : undefined;
      },
    },
    playersTable: {
      findFirst: async () => ({ id: state.currentPlayerId ?? 0, clerkId: "user_test" }),
    },
  },
  // The view-series route uses `db.select(...).from(postViewsTable).where(...).groupBy(...)`.
  // Return a thenable from groupBy that resolves to per-hour aggregated rows
  // filtered by postId + createdAt >= cutoff.
  select: (_proj: unknown) => ({
    from: (_t: unknown) => ({
      where: (cond: Pred) => ({
        groupBy: (_g: unknown) => {
          const postId = findPred(cond, "eq", "postId")?.val as number | undefined;
          const cutoff = findPred(cond, "gte", "createdAt")?.val as Date | undefined;
          const grouped = new Map<number, number>();
          for (const v of state.views) {
            if (postId !== undefined && v.postId !== postId) continue;
            if (cutoff && v.createdAt < cutoff) continue;
            const hourT = truncHour(v.createdAt).getTime();
            grouped.set(hourT, (grouped.get(hourT) ?? 0) + 1);
          }
          return Promise.resolve(
            Array.from(grouped.entries()).map(([t, views]) => ({
              hour: new Date(t),
              views,
            })),
          );
        },
      }),
    }),
  }),
  insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    postsTable,
    postViewsTable,
    postReactionsTable: {},
    postCommentsTable: {},
    postCommentRevisionsTable: {},
    postCommentReactionsTable: {},
    playerFollowsTable: {},
    postRepostsTable: {},
    playersTable,
    hatchlingsTable: {},
    groupMembersTable: {},
    groupsTable: {},
    userReportsTable: {},
    notificationsTable: {},
  },
});

const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.set("trust proxy", true);
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
});

interface SeriesBody {
  windowHours?: number;
  total?: number;
  buckets?: { hour: string; views: number }[];
  error?: string;
}

async function getSeries(postId: number): Promise<{ status: number; body: SeriesBody }> {
  const res = await fetch(`${baseUrl}/social/posts/${postId}/view-series`);
  const body = (await res.json().catch(() => ({}))) as SeriesBody;
  return { status: res.status, body };
}

describe("GET /social/posts/:id/view-series", () => {
  it("returns 404 for a missing post", async () => {
    // No post seeded — the lookup should miss and the route should bail
    // before doing any aggregation.
    const r = await getSeries(999);
    assert.equal(r.status, 404);
    assert.equal(r.body.error, "Post not found");
  });

  it("returns 404 for a soft-deleted post", async () => {
    // Soft-deleted posts must not leak their analytics — the owner check
    // happens after the deleted-at check, so even the owner gets 404.
    state.posts.set(1, { id: 1, playerId: 1, viewCount: 5, deletedAt: new Date() });
    const r = await getSeries(1);
    assert.equal(r.status, 404);
  });

  it("returns 404 for a non-numeric post id", async () => {
    const res = await fetch(`${baseUrl}/social/posts/not-a-number/view-series`);
    assert.equal(res.status, 404);
  });

  it("returns 403 when the viewer is not the post owner", async () => {
    // Post belongs to player 2 but the viewer is player 1 — the chip is
    // creator-only, so non-owners are forbidden, not just empty.
    state.posts.set(1, { id: 1, playerId: 2, viewCount: 0 });
    state.currentPlayerId = 1;
    const r = await getSeries(1);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Not your post");
  });

  it("returns exactly 24 zero-filled buckets oldest-first when there are no views", async () => {
    state.posts.set(1, { id: 1, playerId: 1, viewCount: 0 });
    state.currentPlayerId = 1;

    const r = await getSeries(1);
    assert.equal(r.status, 200);
    assert.equal(r.body.windowHours, 24);
    assert.ok(r.body.buckets);
    assert.equal(r.body.buckets!.length, 24, "must always return windowHours buckets");
    assert.equal(r.body.total, 0);
    // Every bucket is zeroed and aligned to the top of an hour.
    for (const b of r.body.buckets!) {
      assert.equal(b.views, 0);
      const d = new Date(b.hour);
      assert.equal(d.getUTCMinutes(), 0);
      assert.equal(d.getUTCSeconds(), 0);
      assert.equal(d.getUTCMilliseconds(), 0);
    }
    // Buckets are strictly increasing in time (oldest first).
    for (let i = 1; i < r.body.buckets!.length; i++) {
      const prev = new Date(r.body.buckets![i - 1].hour).getTime();
      const cur = new Date(r.body.buckets![i].hour).getTime();
      assert.equal(cur - prev, 3600_000, `bucket ${i} should be one hour after bucket ${i - 1}`);
    }
    // The last bucket is the current hour.
    const now = Date.now();
    const currentHourStart = now - (now % 3600_000);
    assert.equal(
      new Date(r.body.buckets![23].hour).getTime(),
      currentHourStart,
      "last bucket should be the current hour",
    );
  });

  it("places views in the correct hourly bucket and total matches the sum", async () => {
    state.posts.set(1, { id: 1, playerId: 1, viewCount: 0 });
    state.currentPlayerId = 1;

    const now = Date.now();
    const currentHourStart = now - (now % 3600_000);
    // Seed views: 3 in the current hour, 2 in the bucket 5 hours ago, 1 in
    // the oldest bucket (23 hours ago), plus a stale view 30 hours ago that
    // must be excluded by the cutoff.
    const seed = (hoursAgo: number, count: number) => {
      const base = currentHourStart - hoursAgo * 3600_000;
      for (let i = 0; i < count; i++) {
        // Put each seeded view at 15min past the hour to confirm
        // date_trunc bucketing rounds down to the hour start.
        state.views.push({
          postId: 1,
          viewerKey: `k${state.views.length}`,
          viewDate: "2024-01-01",
          createdAt: new Date(base + 15 * 60_000),
        });
      }
    };
    seed(0, 3);
    seed(5, 2);
    seed(23, 1);
    seed(30, 9); // outside window — must be ignored

    const r = await getSeries(1);
    assert.equal(r.status, 200);
    assert.equal(r.body.windowHours, 24);
    assert.equal(r.body.buckets!.length, 24);

    // total reflects only views inside the 24h window.
    assert.equal(r.body.total, 6);

    // Sum of bucket views equals total.
    const sum = r.body.buckets!.reduce((a, b) => a + b.views, 0);
    assert.equal(sum, r.body.total);

    // Each seeded hour lands in the right bucket.
    const bucketFor = (hoursAgo: number) =>
      r.body.buckets!.find(
        (b) => new Date(b.hour).getTime() === currentHourStart - hoursAgo * 3600_000,
      );
    assert.equal(bucketFor(0)?.views, 3, "current-hour bucket should hold 3 views");
    assert.equal(bucketFor(5)?.views, 2, "5h-ago bucket should hold 2 views");
    assert.equal(bucketFor(23)?.views, 1, "oldest bucket should hold 1 view");

    // Every other bucket is zero.
    const nonZeroOffsets = new Set([0, 5, 23]);
    for (let i = 0; i < 24; i++) {
      const hoursAgo = 23 - i;
      if (nonZeroOffsets.has(hoursAgo)) continue;
      assert.equal(
        r.body.buckets![i].views,
        0,
        `bucket ${i} (${hoursAgo}h ago) should be zero-filled`,
      );
    }
  });
});
