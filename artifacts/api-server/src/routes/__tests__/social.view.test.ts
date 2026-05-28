// Abuse-protection tests for POST /social/posts/:id/view.
//
// The view endpoint has four layers of defense that this file pins down:
//   1. Per-(post, viewerKey, day) dedup so a viewer refreshing the page
//      doesn't inflate the count.
//   2. HMAC-hashed IP viewerKey so anonymous viewers are stable but raw IPs
//      never hit the database.
//   3. postViewLimiter (120/min/IP) as a second line of defense against
//      bots cycling through posts.
//   4. Per-(viewerKey, hour) cap on the number of *distinct* posts that can
//      be counted, so a bot rotating through many post IDs from the same IP
//      still can't inflate counts beyond the cap.
//
// The route is exercised against a real Express server with the DB / auth /
// peripheral modules mocked out, but the rate limiter is the real one from
// `middlewares/rateLimiters.ts` so the threshold is the production threshold.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

interface PostRow {
  id: number;
  viewCount: number;
  deletedAt?: Date | null;
  createdAt: Date;
  viewsFrozenAt?: Date | null;
  viewsFreezeReason?: string | null;
}
interface ViewInsert { postId: number; viewerKey: string; viewDate: string }
interface ViewRecord extends ViewInsert { createdAt: Date }

const state = {
  posts: new Map<number, PostRow>(),
  // Per (postId|viewerKey|viewDate) successful insert — mirrors the unique
  // index on post_views.
  viewsByKey: new Map<string, ViewRecord>(),
  // Every insert attempt (whether or not it conflicted) — lets tests assert
  // on the keys the route built.
  inserts: [] as ViewInsert[],
  // Successful inserts in time order — what the distinct-posts cap query
  // counts against.
  recordedViews: [] as ViewRecord[],
  // Override the timestamp the next insert is recorded with. Lets a test
  // age out previously-recorded views so the hour-window cap resets.
  nextInsertAt: null as Date | null,
  authUserId: null as string | null,
};

function resetState() {
  state.posts = new Map([[1, { id: 1, viewCount: 0, createdAt: new Date() }]]);
  state.viewsByKey = new Map();
  state.inserts = [];
  state.recordedViews = [];
  state.nextInsertAt = null;
  state.authUserId = null;
}

// Convenience getter for tests that still read `state.post`.
function getPost1(): PostRow {
  const p = state.posts.get(1);
  if (!p) throw new Error("post 1 missing from state");
  return p;
}

// Anonymous view path by default. Some tests flip state.authUserId to exercise
// the player:<id> viewerKey path.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authUserId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (_req: unknown, _res: unknown, next: () => void) => next(),
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
// postPurgeJob pulls in the api-server logger, which uses a path-style
// import that doesn't resolve under Node's strict ESM test runner. The view
// route never actually invokes the purge job, so a no-op stub is enough.
mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async () => 0, RETENTION_DAYS: 30 },
});
// safety.ts transitively pulls in emailVerification → emailService, which
// uses an extensionless import that fails resolution under the strict ESM
// test runner. The view route doesn't touch any of safety's helpers, so a
// trivial stub keeps the import graph quiet.
mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => [],
    filterDiscoverableCandidates: async (_v: number, rows: any[]) =>
      rows.filter((r: any) => r?.locationVisibility !== "hidden" && r?.isMinor !== true),
  },
});
// social.ts imports Zod body schemas from @workspace/api-zod, but its
// generated bundle isn't built in the test environment. Stub schemas keep
// the imports satisfied without pulling in generated code the view route
// never executes.
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

// drizzle predicate builders are mocked to return tagged objects so the
// fake db can walk a `where` tree and pull out the values the route passed
// in (e.g. the viewerKey on the distinct-posts-per-hour cap query).
interface Pred { __op: string; col?: { __col?: string }; val?: unknown; args?: Pred[] }
const col = (name: string) => ({ __col: name });

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
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

const fakeDb = {
  query: {
    postsTable: {
      findFirst: async ({ where }: { where?: Pred }) => {
        const id = findPred(where, "eq", "id")?.val as number | undefined;
        if (id === undefined) return undefined;
        if (!state.posts.has(id)) state.posts.set(id, { id, viewCount: 0, createdAt: new Date() });
        return { ...state.posts.get(id)! };
      },
    },
    playersTable: {
      // Returns a stub player when the route resolves a Clerk session. The
      // burst-traffic test sets authUserId to `user_<n>` to simulate many
      // distinct signed-in viewers from a single IP; we parse the trailing
      // digits so each clerk id maps to its own playerId (and therefore its
      // own viewerKey).
      findFirst: async () => {
        if (!state.authUserId) return undefined;
        const m = state.authUserId.match(/(\d+)$/);
        const id = m ? Number(m[1]) : 42;
        return { id, clerkId: state.authUserId };
      },
    },
  },
  insert: (_t: unknown) => ({
    values: (vals: ViewInsert) => {
      state.inserts.push(vals);
      const key = `${vals.postId}|${vals.viewerKey}|${vals.viewDate}`;
      return {
        onConflictDoNothing: (_o: unknown) => ({
          returning: async () => {
            if (state.viewsByKey.has(key)) return [];
            const record: ViewRecord = {
              ...vals,
              createdAt: state.nextInsertAt ?? new Date(),
            };
            state.viewsByKey.set(key, record);
            state.recordedViews.push(record);
            return [{ id: state.recordedViews.length }];
          },
        }),
      };
    },
  }),
  update: (_t: unknown) => ({
    // The route uses two `set` shapes against postsTable: an sql-expression
    // increment of viewCount (consumed via `.returning()`) and a freeze
    // update that just `await`s the `.where(...)` chain. Apply the write
    // eagerly inside `where(...)` and return a value that's both
    // PromiseLike and has a `.returning()` accessor so either call style
    // sees the result.
    set: (vals: Record<string, unknown>) => ({
      where: (cond: Pred) => {
        const id = findPred(cond, "eq", "id")?.val as number | undefined;
        const target = id !== undefined ? state.posts.get(id) : undefined;
        if (target) {
          if ("viewsFrozenAt" in vals) {
            target.viewsFrozenAt = (vals.viewsFrozenAt as Date | null) ?? null;
            target.viewsFreezeReason = (vals.viewsFreezeReason as string | null) ?? null;
          } else if ("viewCount" in vals) {
            // sql template result — the route is incrementing.
            target.viewCount += 1;
          }
        }
        const result = [{ viewCount: target?.viewCount ?? 0 }];
        return {
          returning: async () => result,
          then: (resolve: (v: unknown) => void) => resolve(result),
        };
      },
    }),
  }),
  // Used by two queries:
  //  1. per-(viewerKey, hour) distinct-posts cap → filters by viewerKey +
  //     createdAt + excluded postId and counts distinct postIds.
  //  2. per-post recent-views check (abuse detector) → filters by eq(postId)
  //     + createdAt cutoff and counts matching rows.
  select: (_proj: unknown) => ({
    from: (_t: unknown) => ({
      where: (cond: Pred) =>
        Promise.resolve([
          {
            count: (() => {
              const eqPostId = findPred(cond, "eq", "postId")?.val as number | undefined;
              const cutoff = findPred(cond, "gte", "createdAt")?.val as Date | undefined;
              if (eqPostId !== undefined) {
                let n = 0;
                for (const v of state.recordedViews) {
                  if (v.postId !== eqPostId) continue;
                  if (cutoff && v.createdAt < cutoff) continue;
                  n++;
                }
                return n;
              }
              const viewerKey = findPred(cond, "eq", "viewerKey")?.val as string | undefined;
              const exclude = findPred(cond, "ne", "postId")?.val as number | undefined;
              const ids = new Set<number>();
              for (const v of state.recordedViews) {
                if (viewerKey !== undefined && v.viewerKey !== viewerKey) continue;
                if (cutoff && v.createdAt < cutoff) continue;
                if (exclude !== undefined && v.postId === exclude) continue;
                ids.add(v.postId);
              }
              return ids.size;
            })(),
          },
        ]),
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
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

// ── Imports that depend on the mocks above ───────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;
const { VIEW_DISTINCT_POSTS_PER_HOUR, resolveViewDistinctPostsPerHour } = await import("../social.ts");
const { BURST_MIN_VIEWS } = await import("../../services/viewAbuseDetection.ts");
const { postViewLimiter } = await import("../../middlewares/rateLimiters.ts");

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  // Trust the test client's X-Forwarded-For so each test can pretend to come
  // from a distinct IP, matching how the real proxy fronts the API.
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(socialRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

// Each test starts with a fresh in-memory state and a fresh rate-limit budget
// for the IPs we use, so ordering between tests doesn't matter.
const TEST_IPS = ["9.9.9.9", "1.2.3.4", "5.6.7.8", "127.0.0.1", "::ffff:127.0.0.1"];
beforeEach(() => {
  resetState();
  const lim = postViewLimiter as unknown as { resetKey?: (key: string) => void };
  for (const ip of TEST_IPS) lim.resetKey?.(ip);
});

async function postView(
  postId: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: { viewCount?: number; counted?: boolean; frozen?: boolean; error?: string } }> {
  const res = await fetch(`${baseUrl}/social/posts/${postId}/view`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
  const body = (await res.json().catch(() => ({}))) as { viewCount?: number; counted?: boolean; error?: string };
  return { status: res.status, body };
}

describe("POST /social/posts/:id/view — abuse protection", () => {
  it("dedups: the same viewer pinging twice on the same day only counts once", async () => {
    const first = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(first.status, 200);
    assert.equal(first.body.counted, true);
    assert.equal(first.body.viewCount, 1);

    const second = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(second.status, 200);
    assert.equal(second.body.counted, false, "second ping must not inflate the count");
    assert.equal(second.body.viewCount, 1);

    assert.equal(state.inserts.length, 2, "both pings should attempt an insert");
    assert.equal(
      state.inserts[0].viewerKey,
      state.inserts[1].viewerKey,
      "same viewer must produce the same viewerKey",
    );
  });

  it("dedups signed-in viewers by playerId, not by IP", async () => {
    state.authUserId = "user_clerk_xyz";
    const r1 = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    // Same player, different IP — the playerId-based key still dedups.
    const r2 = await postView(1, { "x-forwarded-for": "8.8.8.8" });

    assert.equal(r1.body.counted, true);
    assert.equal(r2.body.counted, false);
    assert.equal(r2.body.viewCount, 1);
    assert.equal(state.inserts[0].viewerKey, "player:42");
    assert.equal(state.inserts[1].viewerKey, "player:42");
  });

  it("hashed IP viewerKey is stable for the same IP and different for different IPs", async () => {
    await postView(1, { "x-forwarded-for": "1.2.3.4" });
    await postView(1, { "x-forwarded-for": "1.2.3.4" });
    await postView(1, { "x-forwarded-for": "5.6.7.8" });

    assert.equal(state.inserts.length, 3);
    const [a1, a2, b] = state.inserts.map((i) => i.viewerKey);

    assert.equal(a1, a2, "same IP must produce the same viewerKey");
    assert.notEqual(a1, b, "different IPs must produce different viewerKeys");
    assert.match(a1, /^ip:[0-9a-f]{32}$/, "anonymous viewerKey must be the hashed form");
    assert.ok(!a1.includes("1.2.3.4"), "raw IP must never appear in viewerKey");
    assert.ok(!b.includes("5.6.7.8"), "raw IP must never appear in viewerKey");
  });

  it("caps distinct posts per viewerKey per hour even when a bot rotates post IDs", async () => {
    // A bot from a single IP cycles through fresh post IDs. The first
    // VIEW_DISTINCT_POSTS_PER_HOUR succeed (each becomes a distinct view),
    // but anything beyond that returns counted=false without recording.
    for (let i = 0; i < VIEW_DISTINCT_POSTS_PER_HOUR; i++) {
      const r = await postView(1000 + i, { "x-forwarded-for": "9.9.9.9" });
      assert.equal(r.status, 200);
      assert.equal(r.body.counted, true, `post #${i + 1} should still fit under the cap`);
    }

    const blocked = await postView(9999, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(blocked.status, 200, "over-cap responses are still 200 so the UI behaves");
    assert.equal(blocked.body.counted, false, "request past the hourly cap must not count");
    assert.equal(
      blocked.body.viewCount,
      0,
      "blocked target post's stored viewCount must not be incremented",
    );
    assert.equal(
      state.recordedViews.length,
      VIEW_DISTINCT_POSTS_PER_HOUR,
      "no extra view rows should be recorded once the cap is hit",
    );
    assert.ok(
      !state.recordedViews.some((v) => v.postId === 9999),
      "the over-cap post must not have a recorded view",
    );
  });

  it("the distinct-posts cap is per viewerKey — different IPs each get their own budget", async () => {
    // Saturate one IP's hourly budget.
    for (let i = 0; i < VIEW_DISTINCT_POSTS_PER_HOUR; i++) {
      const r = await postView(2000 + i, { "x-forwarded-for": "1.2.3.4" });
      assert.equal(r.body.counted, true);
    }
    const overA = await postView(2999, { "x-forwarded-for": "1.2.3.4" });
    assert.equal(overA.body.counted, false, "IP A is now over its hourly cap");

    // A different IP for the same post still counts — the cap is keyed per
    // viewerKey, not globally per post.
    const otherIp = await postView(2999, { "x-forwarded-for": "5.6.7.8" });
    assert.equal(otherIp.body.counted, true, "different viewerKey must not share IP A's cap");
  });

  it("views older than an hour fall outside the cap window and don't count against it", async () => {
    // Record VIEW_DISTINCT_POSTS_PER_HOUR views aged ~2 hours ago, then
    // confirm the next fresh view still counts because the stale ones have
    // dropped out of the rolling window.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (let i = 0; i < VIEW_DISTINCT_POSTS_PER_HOUR; i++) {
      state.nextInsertAt = twoHoursAgo;
      const r = await postView(3000 + i, { "x-forwarded-for": "1.2.3.4" });
      assert.equal(r.body.counted, true);
    }
    state.nextInsertAt = null;

    const fresh = await postView(3999, { "x-forwarded-for": "1.2.3.4" });
    assert.equal(fresh.body.counted, true, "stale views must not consume the current hour's budget");
  });

  it("the distinct-posts cap defaults to 60 when no env var is set", () => {
    // The default is intentionally pinned here: even though the cap is now
    // env-tunable, the production default must stay 60 unless someone
    // consciously changes it (and updates this test).
    assert.equal(VIEW_DISTINCT_POSTS_PER_HOUR, 60);
    assert.equal(resolveViewDistinctPostsPerHour(undefined), 60);
    assert.equal(resolveViewDistinctPostsPerHour(""), 60);
  });

  it("the distinct-posts cap honors a valid env override", () => {
    assert.equal(resolveViewDistinctPostsPerHour("75"), 75);
    assert.equal(resolveViewDistinctPostsPerHour("1"), 1);
  });

  it("the distinct-posts cap falls back to 60 for invalid env values", () => {
    // Non-numeric, zero, negative, and non-integer values should all be
    // rejected so a misconfigured env can never silently disable the cap.
    assert.equal(resolveViewDistinctPostsPerHour("not-a-number"), 60);
    assert.equal(resolveViewDistinctPostsPerHour("0"), 60);
    assert.equal(resolveViewDistinctPostsPerHour("-5"), 60);
    assert.equal(resolveViewDistinctPostsPerHour("12.5"), 60);
  });

  it("freezes the view counter when a synthetic burst hits a single post from many distinct viewers", async () => {
    // Mature post (created 24h ago) with no prior views — the detector's
    // baseline floor is 1/hr, so 60 unique viewers in a single hour trips
    // the spike-ratio rule (60 >> 20× baseline AND ≥ BURST_MIN_VIEWS).
    state.posts.set(1, {
      id: 1,
      viewCount: 0,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    let lastBody: { viewCount?: number; counted?: boolean; frozen?: boolean } = {};
    for (let i = 0; i < BURST_MIN_VIEWS; i++) {
      state.authUserId = `user_${i}`;
      const r = await postView(1, { "x-forwarded-for": "127.0.0.1" });
      assert.equal(r.status, 200);
      lastBody = r.body as typeof lastBody;
    }
    state.authUserId = null;

    assert.equal(lastBody.counted, true, "the burst view itself still counts");
    assert.equal(
      lastBody.frozen,
      true,
      "the BURST_MIN_VIEWS-th view should trip the anomaly detector",
    );

    const frozenCount = lastBody.viewCount ?? 0;
    assert.equal(frozenCount, BURST_MIN_VIEWS);

    // Confirm we persisted the freeze on the post itself.
    const stored = getPost1();
    assert.ok(stored.viewsFrozenAt instanceof Date, "viewsFrozenAt must be set on the post");
    assert.match(stored.viewsFreezeReason ?? "", /spike_ratio/);

    // Subsequent views from a fresh viewer bounce immediately — the counter
    // is frozen until an admin unfreezes it.
    state.authUserId = "user_after_freeze";
    const afterFreeze = await postView(1, { "x-forwarded-for": "127.0.0.1" });
    assert.equal(afterFreeze.status, 200, "frozen posts still respond 200 so the UI keeps working");
    assert.equal(afterFreeze.body.counted, false);
    assert.equal(afterFreeze.body.frozen, true);
    assert.equal(
      afterFreeze.body.viewCount,
      frozenCount,
      "post-freeze pings must not move the stored viewCount",
    );
  });

  it("does not freeze posts on an organic small bump", async () => {
    // Mature post with 30 unique viewers in an hour — well under the
    // BURST_MIN_VIEWS absolute floor, even though the spike ratio is large.
    state.posts.set(1, {
      id: 1,
      viewCount: 0,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    let lastBody: { frozen?: boolean } = {};
    for (let i = 0; i < 30; i++) {
      state.authUserId = `user_${i}`;
      const r = await postView(1, { "x-forwarded-for": "127.0.0.1" });
      lastBody = r.body;
    }
    state.authUserId = null;
    assert.notEqual(lastBody.frozen, true, "organic-sized bumps must not trigger a freeze");
    assert.equal(getPost1().viewsFrozenAt ?? null, null);
  });

  it("postViewLimiter blocks bursts above the per-minute threshold", async () => {
    // The real limiter allows 120/min/IP. Fire that many serially from the
    // same connection — all should succeed — and then assert the 121st is
    // rejected with 429.
    for (let i = 0; i < 120; i++) {
      const r = await postView(1);
      assert.equal(r.status, 200, `request #${i + 1} should be allowed under the limit`);
    }
    const blocked = await postView(1);
    assert.equal(blocked.status, 429, "request #121 must be rate-limited");
    assert.match(
      blocked.body.error ?? "",
      /view pings/i,
      "limiter should return the configured message",
    );
  });
});
