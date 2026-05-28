// End-to-end style tests for the deleted-post hiding rules in social.ts.
//
// We mount the real `socialRouter` on a tiny express app with all DB,
// drizzle, auth, rate-limit, guard, and helper modules mocked out, then
// drive it over real HTTP. The fake DB evaluates drizzle predicates as
// JS functions so the route's actual `where` clauses do the filtering —
// no behaviour-coupling stubs.
import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Table column stubs ───────────────────────────────────────────────────
// Each "column" is just a tag the mocked drizzle operators read off rows.
const col = (name: string) => ({ __col: name }) as const;

function makeTable<T extends string>(store: T, columns: readonly string[]) {
  const t: Record<string, unknown> = { __store: store };
  for (const c of columns) t[c] = col(c);
  return t;
}

const postsTable = makeTable("posts", [
  "id", "playerId", "content", "mediaUrl", "postType", "creatureId",
  "xpEarned", "energyEarned", "isFlagged", "engagementScore", "viewCount",
  "metadata", "deletedAt", "createdAt", "viewsFrozenAt", "viewsFreezeReason",
]);
const postCommentRevisionsTable = makeTable("postCommentRevisions", ["id", "commentId", "previousContent", "editedAt"]);
const userReportsTable = makeTable("userReports", ["id", "reporterId", "contentType", "contentId", "reason", "description", "status", "createdAt", "resolvedAt"]);
const postViewsTable = makeTable("postViews", ["id", "postId", "viewerKey", "viewDate", "createdAt"]);
const postReactionsTable = makeTable("postReactions", ["id", "postId", "playerId", "reactionType", "createdAt"]);
const postCommentsTable = makeTable("postComments", ["id", "postId", "playerId", "content", "isFlagged", "createdAt", "updatedAt"]);
const postCommentReactionsTable = makeTable("postCommentReactions", ["id", "commentId", "playerId", "reactionType", "createdAt"]);
const postRepostsTable = makeTable("postReposts", ["id", "postId", "playerId", "createdAt"]);
const playerFollowsTable = makeTable("playerFollows", ["id", "followerId", "followeeId", "createdAt"]);
const playersTable = makeTable("players", [
  "id", "clerkId", "username", "displayName", "avatarUrl", "creatorBadge",
  "fitnessRealm", "physiqueGoal", "fitnessLevel",
  "locationVisibility", "isMinor",
]);
const hatchlingsTable = makeTable("hatchlings", ["id", "playerId", "name"]);
const groupMembersTable = makeTable("groupMembers", ["id", "groupId", "playerId"]);
const groupsTable = makeTable("groups", ["id", "name"]);
const notificationsTable = makeTable("notifications", ["id", "playerId", "type", "sourceId"]);

type Row = Record<string, unknown>;
type Pred = (row: Row) => boolean;

const state = {
  posts: [] as Row[],
  postViews: [] as Row[],
  postReactions: [] as Row[],
  postComments: [] as Row[],
  postCommentReactions: [] as Row[],
  postReposts: [] as Row[],
  playerFollows: [] as Row[],
  players: [] as Row[],
  hatchlings: [] as Row[],
  groupMembers: [] as Row[],
  groups: [] as Row[],
  notifications: [] as Row[],
};

function resetState() {
  for (const k of Object.keys(state) as (keyof typeof state)[]) state[k].length = 0;
}

const storeFor = (t: unknown): Row[] => {
  const key = (t as { __store?: keyof typeof state }).__store;
  if (!key) return [];
  return state[key] as Row[];
};

// ── Mocked drizzle operators (predicate functions) ──────────────────────
const TRUE_PRED: Pred = () => true;
const ensure = (p: unknown): Pred =>
  typeof p === "function" ? (p as Pred) : TRUE_PRED;

const opAnd = (...parts: unknown[]): Pred =>
  (row) => parts.filter(Boolean).every((p) => ensure(p)(row));
const opOr = (...parts: unknown[]): Pred =>
  (row) => parts.filter(Boolean).some((p) => ensure(p)(row));
const opEq = (c: { __col: string }, val: unknown): Pred =>
  (row) => row[c.__col] === val;
const opNe = (c: { __col: string }, val: unknown): Pred =>
  (row) => row[c.__col] !== val;
const opIsNull = (c: { __col: string }): Pred => (row) => row[c.__col] == null;
const opIsNotNull = (c: { __col: string }): Pred => (row) => row[c.__col] != null;
const opInArray = (c: { __col: string }, vals: unknown[]): Pred =>
  (row) => vals.includes(row[c.__col]);
const opGte = (c: { __col: string }, val: unknown): Pred =>
  (row) => {
    const v = row[c.__col];
    if (v == null || val == null) return false;
    return (v as number | Date) >= (val as number | Date);
  };
const opLt = (c: { __col: string }, val: unknown): Pred =>
  (row) => {
    const v = row[c.__col];
    if (v == null || val == null) return false;
    return (v as number | Date) < (val as number | Date);
  };
const opIlike = (c: { __col: string }, pattern: string): Pred => {
  const p = String(pattern).toLowerCase().replace(/%/g, "");
  return (row) => String(row[c.__col] ?? "").toLowerCase().includes(p);
};
const opDesc = (c: { __col: string }) => ({ __desc: c.__col });

// Permissive sql`` tag. Detects the simple "${col} IS [NOT] NULL" template
// pattern so it can act as a real predicate in `where` clauses; everything
// else falls back to a TRUE passthrough (and is also tagged __sql so the
// select builder can treat aggregate select items like `count(*)`).
const opSql = (...args: unknown[]): Pred & { __sql: true } => {
  const strings = args[0];
  const vals = args.slice(1);
  if (Array.isArray(strings) && strings.length === 2 && vals.length === 1) {
    const tail = String(strings[1]).trim().toUpperCase();
    const colRef = vals[0] as { __col?: string } | undefined;
    const colName = colRef?.__col;
    if (colName) {
      if (tail === "IS NOT NULL") {
        const p = ((row: Row) => row[colName] != null) as Pred & { __sql: true };
        p.__sql = true;
        return p;
      }
      if (tail === "IS NULL") {
        const p = ((row: Row) => row[colName] == null) as Pred & { __sql: true };
        p.__sql = true;
        return p;
      }
    }
  }
  const p = TRUE_PRED as Pred & { __sql: true };
  p.__sql = true;
  return p;
};
const opAlias = (t: unknown, _name: string) => t;

mock.module("drizzle-orm", {
  namedExports: {
    eq: opEq, ne: opNe, and: opAnd, or: opOr,
    isNull: opIsNull, isNotNull: opIsNotNull, inArray: opInArray,
    notInArray: (c: { __col: string }, vals: unknown[]): Pred =>
      (row) => !vals.includes(row[c.__col]),
    gte: opGte, lt: opLt, ilike: opIlike, desc: opDesc, sql: opSql,
  },
});
mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: opAlias },
});

// ── Fake DB ──────────────────────────────────────────────────────────────
function sortRows(rows: Row[], orderBy?: unknown[]): Row[] {
  if (!orderBy?.length) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const o of orderBy) {
      const desc = (o as { __desc?: string }).__desc;
      if (!desc) continue;
      const av = a[desc] as number | Date | string | null;
      const bv = b[desc] as number | Date | string | null;
      const an = av instanceof Date ? av.getTime() : (av as number);
      const bn = bv instanceof Date ? bv.getTime() : (bv as number);
      if (an == null && bn == null) continue;
      if (bn !== an) return (bn ?? 0) - (an ?? 0);
    }
    return 0;
  });
  return sorted;
}

function makeQueryHandle(key: keyof typeof state) {
  return {
    findFirst: async (args?: { where?: Pred }) => {
      const pred = args?.where ?? TRUE_PRED;
      return (state[key] as Row[]).find(pred);
    },
    findMany: async (args?: { where?: Pred; orderBy?: unknown[]; limit?: number }) => {
      const pred = args?.where ?? TRUE_PRED;
      let rows = (state[key] as Row[]).filter(pred);
      rows = sortRows(rows, args?.orderBy);
      if (args?.limit != null) rows = rows.slice(0, args.limit);
      return rows;
    },
  };
}

function makeSelectBuilder(cols: Record<string, unknown> | undefined) {
  let rows: Row[] = [];
  let pred: Pred = TRUE_PRED;
  let groupByCol: string | null = null;
  let limit: number | null = null;
  let orderBy: unknown[] | undefined;
  const finalize = (): Row[] => {
    let out = rows.filter(pred);
    out = sortRows(out, orderBy);
    if (limit != null) out = out.slice(0, limit);

    const wantsCount = cols
      ? Object.values(cols).some(
          (v) => (v as { __sql?: boolean } | undefined)?.__sql === true,
        )
      : false;

    if (groupByCol) {
      const groups = new Map<unknown, Row[]>();
      for (const r of out) {
        const k = r[groupByCol];
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }
      const grouped: Row[] = [];
      for (const [k, list] of groups.entries()) {
        const r: Row = {};
        for (const [outKey, src] of Object.entries(cols ?? {})) {
          if ((src as { __sql?: boolean }).__sql) r[outKey] = list.length;
          else if (typeof src === "object" && src && "__col" in src) {
            const inner = (src as { __col: string }).__col;
            r[outKey] = inner === groupByCol ? k : list[0]?.[inner];
          }
        }
        grouped.push(r);
      }
      return grouped;
    }

    if (wantsCount && cols) {
      // Single-row aggregate
      const r: Row = {};
      for (const [outKey, src] of Object.entries(cols)) {
        if ((src as { __sql?: boolean }).__sql) r[outKey] = out.length;
        else if (typeof src === "object" && src && "__col" in src) {
          r[outKey] = out[0]?.[(src as { __col: string }).__col];
        }
      }
      return [r];
    }

    if (cols) {
      return out.map((row) => {
        const projected: Row = {};
        for (const [outKey, src] of Object.entries(cols)) {
          if (typeof src === "object" && src && "__col" in src) {
            projected[outKey] = row[(src as { __col: string }).__col];
          } else {
            projected[outKey] = row[outKey];
          }
        }
        return projected;
      });
    }
    return out;
  };

  const builder: {
    from: (t: unknown) => typeof builder;
    where: (p: Pred) => typeof builder;
    innerJoin: (..._a: unknown[]) => typeof builder;
    leftJoin: (..._a: unknown[]) => typeof builder;
    groupBy: (c: { __col: string }) => typeof builder;
    orderBy: (...o: unknown[]) => typeof builder;
    limit: (n: number) => typeof builder;
    then: <T>(
      onFulfilled: (rows: Row[]) => T,
      onRejected?: (err: unknown) => unknown,
    ) => Promise<T>;
  } = {
    from(t: unknown) { rows = [...storeFor(t)]; return builder; },
    where(p: Pred) { pred = ensure(p); return builder; },
    innerJoin(_t: unknown, _on: unknown) { return builder; },
    leftJoin(_t: unknown, _on: unknown) { return builder; },
    groupBy(c: { __col: string }) { groupByCol = c.__col; return builder; },
    orderBy(...o: unknown[]) { orderBy = o; return builder; },
    limit(n: number) { limit = n; return builder; },
    then(onFulfilled, onRejected) {
      try { return Promise.resolve(onFulfilled(finalize())); }
      catch (e) { return onRejected ? Promise.resolve(onRejected(e) as never) : Promise.reject(e); }
    },
  };
  return builder;
}

let nextId = 1000;
const fakeDb = {
  query: {
    postsTable: makeQueryHandle("posts"),
    postViewsTable: makeQueryHandle("postViews"),
    postReactionsTable: makeQueryHandle("postReactions"),
    postCommentsTable: makeQueryHandle("postComments"),
    postCommentReactionsTable: makeQueryHandle("postCommentReactions"),
    postRepostsTable: makeQueryHandle("postReposts"),
    playerFollowsTable: makeQueryHandle("playerFollows"),
    playersTable: makeQueryHandle("players"),
    hatchlingsTable: makeQueryHandle("hatchlings"),
    groupMembersTable: makeQueryHandle("groupMembers"),
    groupsTable: makeQueryHandle("groups"),
    notificationsTable: makeQueryHandle("notifications"),
  },
  select(cols?: Record<string, unknown>) { return makeSelectBuilder(cols); },
  insert(table: unknown) {
    const key = (table as { __store: keyof typeof state }).__store;
    return {
      values(v: Row | Row[]) {
        const arr = Array.isArray(v) ? v : [v];
        for (const row of arr) state[key].push({ id: nextId++, ...row });
        const ret = {
          onConflictDoNothing: () => ret,
          returning: (_cols?: unknown) => Promise.resolve(arr.map(() => ({ id: nextId - 1 }))),
          then: <T>(onFulfilled: (rows: unknown) => T) => Promise.resolve(onFulfilled(undefined)),
        };
        return ret;
      },
    };
  },
  update(table: unknown) {
    const key = (table as { __store: keyof typeof state }).__store;
    return {
      set(values: Row) {
        return {
          where(pred: Pred) {
            const list = state[key];
            for (let i = 0; i < list.length; i++) {
              if (ensure(pred)(list[i])) list[i] = { ...list[i], ...values };
            }
            const result = {
              returning: () => Promise.resolve([]),
              then: <T>(onFulfilled: (rows: unknown) => T) => Promise.resolve(onFulfilled(undefined)),
            };
            return result;
          },
        };
      },
    };
  },
  delete(table: unknown) {
    const key = (table as { __store: keyof typeof state }).__store;
    return {
      where(pred: Pred) {
        const list = state[key];
        const kept = list.filter((r) => !ensure(pred)(r));
        list.length = 0;
        list.push(...kept);
        return Promise.resolve();
      },
    };
  },
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
    db: fakeDb,
    postsTable, postViewsTable, postReactionsTable, postCommentsTable,
    postCommentReactionsTable, postRepostsTable, playerFollowsTable,
    playersTable, hatchlingsTable, groupMembersTable, groupsTable,
    notificationsTable, postCommentRevisionsTable, userReportsTable,
  },
});

mock.module("../services/postPurgeJob.ts", {
  namedExports: {
    hardDeletePosts: async (_ids: number[]) => {},
    RETENTION_DAYS: 30,
  },
});
mock.module("./sharedGroups.ts", {
  namedExports: {
    groupSharedGroupRows: (rows: unknown[]) => rows,
    groupMutualWorkoutPartnerRows: () => new Map(),
    MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT: 3,
    loadSharedGroupsForViewer: async () => new Map(),
    loadMutualWorkoutPartnersForViewer: async () => new Map(),
  },
});
mock.module("./socialCommentOrdering.ts", {
  namedExports: {
    selectTopComments: <T,>(rows: T[]) => rows,
  },
});

// ── Mocked middlewares / helpers ─────────────────────────────────────────
const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
const attachPlayerMw = (req: { playerId?: number }, _res: unknown, next: () => void) => {
  req.playerId = 1;
  next();
};

mock.module("../middlewares/auth.ts", {
  namedExports: { requireAuth: passThrough, attachPlayer: attachPlayerMw },
});
mock.module("../middlewares/rateLimiters.ts", {
  namedExports: {
    socialWriteLimiter: passThrough,
    postViewLimiter: passThrough,
    locationUpdateLimiter: passThrough,
    fitnessLogLimiter: passThrough,
    aiCoachLimiter: passThrough,
    recapPreviewLimiter: passThrough,
    scanLimiter: passThrough,
  },
});
mock.module("../middlewares/minorGuard.ts", {
  namedExports: { blockMinorSocialWrite: passThrough },
});
mock.module("../middlewares/suspendedGuard.ts", {
  namedExports: { blockSuspendedSocialWrite: passThrough },
});
mock.module("./safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => [],
    filterDiscoverableCandidates: async (_v: number, rows: any[]) =>
      rows.filter((r: any) => r?.locationVisibility !== "hidden" && r?.isMinor !== true),
  },
});
mock.module("../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: passThrough,
    requirePremium: passThrough,
  },
});
mock.module("../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => {} },
});
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "clerk_user_1" }),
  },
});

// Permissive Zod-ish body schemas — every parse succeeds with the raw body.
// social.ts only uses these via `.safeParse(req.body)`, so the shape is enough.
const passSchema = {
  safeParse: (data: unknown) => ({ success: true as const, data: (data ?? {}) as Record<string, unknown> }),
};
mock.module("@workspace/api-zod", {
  namedExports: {
    CreatePostBody: passSchema,
    ReactToPostBody: passSchema,
    AddPostCommentBody: passSchema,
    EditPostCommentBody: passSchema,
    FollowPlayerBody: passSchema,
    RepostPostBody: passSchema,
  },
});

// ── Boot the router under test ───────────────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("./social.ts")).default;

const app = express();
app.use(express.json());
app.use(socialRouter);

let server: http.Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ── Seed helpers ─────────────────────────────────────────────────────────
function seedBaseline() {
  state.players.push({
    id: 1, clerkId: "clerk_user_1", username: "viewer",
    displayName: "Viewer", avatarUrl: null, creatorBadge: null,
    fitnessRealm: "strength", physiqueGoal: null, fitnessLevel: "beginner",
  });
  state.players.push({
    id: 2, clerkId: "clerk_user_2", username: "author",
    displayName: "Author", avatarUrl: null, creatorBadge: null,
    fitnessRealm: "strength", physiqueGoal: null, fitnessLevel: "beginner",
  });
}

function makePost(overrides: Partial<Row> & { id: number; playerId: number }): Row {
  return {
    content: "hello", mediaUrl: null, postType: "general", creatureId: null,
    xpEarned: 0, energyEarned: 0, isFlagged: false, engagementScore: 0,
    viewCount: 0, metadata: null, deletedAt: null,
    createdAt: new Date("2026-05-20T12:00:00Z"),
    ...overrides,
  };
}

const LIVE_ID = 100;
const DELETED_ID = 200;

function seedLiveAndDeleted(playerId = 2) {
  state.posts.push(makePost({ id: LIVE_ID, playerId, content: "live post" }));
  state.posts.push(
    makePost({
      id: DELETED_ID,
      playerId,
      content: "deleted post",
      deletedAt: new Date("2026-05-25T00:00:00Z"),
      createdAt: new Date("2026-05-21T00:00:00Z"),
    }),
  );
}

// ── HTTP helper ──────────────────────────────────────────────────────────
async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer x" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

// ── Tests ────────────────────────────────────────────────────────────────
describe("social.ts deleted-post hiding", () => {
  beforeEach(() => {
    resetState();
    seedBaseline();
  });

  describe("read endpoints exclude soft-deleted posts", () => {
    it("GET /social/feed only returns live posts", async () => {
      seedLiveAndDeleted();
      const { status, body } = await req("GET", "/social/feed");
      assert.equal(status, 200);
      const ids = (body as { posts: { id: number }[] }).posts.map((p) => p.id);
      assert.ok(ids.includes(LIVE_ID), `live post missing: got ${ids.join(",")}`);
      assert.ok(!ids.includes(DELETED_ID), `deleted post leaked: got ${ids.join(",")}`);
    });

    it("GET /social/trending excludes soft-deleted posts even when they have views in window", async () => {
      seedLiveAndDeleted();
      const now = new Date();
      state.postViews.push(
        { id: 1, postId: LIVE_ID, viewerKey: "ip:a", viewDate: "2026-05-28", createdAt: now },
        { id: 2, postId: LIVE_ID, viewerKey: "ip:b", viewDate: "2026-05-28", createdAt: now },
        { id: 3, postId: DELETED_ID, viewerKey: "ip:c", viewDate: "2026-05-28", createdAt: now },
        { id: 4, postId: DELETED_ID, viewerKey: "ip:d", viewDate: "2026-05-28", createdAt: now },
        { id: 5, postId: DELETED_ID, viewerKey: "ip:e", viewDate: "2026-05-28", createdAt: now },
      );
      const { status, body } = await req("GET", "/social/trending");
      assert.equal(status, 200);
      const ids = (body as { posts: { id: number }[] }).posts.map((p) => p.id);
      assert.deepEqual(ids, [LIVE_ID]);
    });

    it("GET /social/posts/:id returns 404 for a soft-deleted post", async () => {
      seedLiveAndDeleted();
      const { status, body } = await req("GET", `/social/posts/${DELETED_ID}`);
      assert.equal(status, 404);
      assert.match(JSON.stringify(body), /Post not found/);
    });

    it("GET /social/posts/:id still returns the live post", async () => {
      seedLiveAndDeleted();
      const { status, body } = await req("GET", `/social/posts/${LIVE_ID}`);
      assert.equal(status, 200);
      assert.equal((body as { id: number }).id, LIVE_ID);
    });

    it("GET /social/posts/:id/comments returns [] for a deleted parent post", async () => {
      seedLiveAndDeleted();
      // Seed a comment under the deleted post — it must not leak.
      state.postComments.push({
        id: 1, postId: DELETED_ID, playerId: 2, content: "ghost",
        isFlagged: false, createdAt: new Date(), updatedAt: null,
      });
      const { status, body } = await req("GET", `/social/posts/${DELETED_ID}/comments`);
      assert.equal(status, 200);
      assert.deepEqual(body, []);
    });

    it("GET /social/players/:id/profile omits the player's soft-deleted posts", async () => {
      seedLiveAndDeleted(2);
      const { status, body } = await req("GET", "/social/players/2/profile");
      assert.equal(status, 200);
      const ids = (body as { posts: { id: number }[] }).posts.map((p) => p.id);
      assert.deepEqual(ids, [LIVE_ID]);
    });

    it("GET /social/memories ignores soft-deleted posts when picking an anniversary", async () => {
      const now = new Date();
      // A post created exactly 1 year ago today that has been soft-deleted —
      // it must not surface as a memory.
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      state.posts.push(
        makePost({
          id: DELETED_ID, playerId: 1, content: "old deleted",
          createdAt: oneYearAgo, deletedAt: new Date(),
        }),
      );
      const { status, body } = await req("GET", "/social/memories");
      assert.equal(status, 200);
      assert.equal(body, null);
    });

    it("GET /social/discover does not surface authors whose only recent posts are soft-deleted", async () => {
      // Replace the baseline so we can fully control candidate qualification:
      // viewer has fitness traits that match nobody, no shared groups, and
      // neither candidate has a creator badge. The only way a candidate can
      // enter `/discover` here is the "recently_active" path, which reads
      // `posts WHERE deleted_at IS NULL`.
      state.players.length = 0;
      state.players.push({
        id: 1, clerkId: "clerk_user_1", username: "viewer",
        displayName: "Viewer", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "viewer_only_realm", physiqueGoal: "viewer_only_goal",
        fitnessLevel: "viewer_only_level",
      });
      state.players.push({
        id: 2, clerkId: "clerk_user_2", username: "deleted_author",
        displayName: "Deleted Author", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "other", physiqueGoal: "other", fitnessLevel: "other",
      });
      state.players.push({
        id: 3, clerkId: "clerk_user_3", username: "live_author",
        displayName: "Live Author", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "other", physiqueGoal: "other", fitnessLevel: "other",
      });

      // Deleted author's only post is soft-deleted.
      state.posts.push(
        makePost({
          id: DELETED_ID, playerId: 2, content: "ghost",
          deletedAt: new Date("2026-05-27T00:00:00Z"),
        }),
      );
      // Live author has a fresh live post.
      state.posts.push(makePost({ id: LIVE_ID, playerId: 3, content: "fresh" }));

      const { status, body } = await req("GET", "/social/discover");
      assert.equal(status, 200);
      const ids = (body as { id: number }[]).map((p) => p.id);
      assert.ok(ids.includes(3), `live author missing: got ${ids.join(",")}`);
      assert.ok(!ids.includes(2), `deleted-only author leaked: got ${ids.join(",")}`);
    });

    it("GET /social/discover ranks goal-matched peers above recently-active-only peers", async () => {
      // Reset baseline so we fully control candidate qualification: no shared
      // groups, no creator badges, and a viewer whose realm/goal/level only
      // matches peer A. Peer B is "recently_active" only via a fresh post;
      // peer C is the same. As the pool grows we want to be sure the
      // hand-tuned weights still rank similar-goals (70+) above
      // recently_active (30).
      state.players.length = 0;
      state.players.push({
        id: 1, clerkId: "clerk_user_1", username: "viewer",
        displayName: "Viewer", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "strength", physiqueGoal: "lose_fat",
        fitnessLevel: "intermediate",
      });
      // Peer A: matches realm + goal + level (similar_goals, weight 80).
      state.players.push({
        id: 2, clerkId: "clerk_user_2", username: "goal_match",
        displayName: "Goal Match", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "strength", physiqueGoal: "lose_fat",
        fitnessLevel: "intermediate",
      });
      // Peers B & C: nothing in common with viewer; only qualify via a
      // recent post (recently_active, weight 30).
      state.players.push({
        id: 3, clerkId: "clerk_user_3", username: "recent_only_b",
        displayName: "Recent B", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "endurance", physiqueGoal: "build_muscle",
        fitnessLevel: "advanced",
      });
      state.players.push({
        id: 4, clerkId: "clerk_user_4", username: "recent_only_c",
        displayName: "Recent C", avatarUrl: null, creatorBadge: null,
        fitnessRealm: "flexibility", physiqueGoal: "build_muscle",
        fitnessLevel: "advanced",
      });

      // Fresh live posts for the recently-active-only peers. Peer A has no
      // posts at all — they should still outrank the recent posters.
      state.posts.push(
        makePost({ id: 301, playerId: 3, content: "B today",
          createdAt: new Date("2026-05-28T10:00:00Z") }),
        makePost({ id: 302, playerId: 4, content: "C today",
          createdAt: new Date("2026-05-28T11:00:00Z") }),
      );

      const { status, body } = await req("GET", "/social/discover");
      assert.equal(status, 200);
      const rows = body as Array<{ id: number; reason: string }>;
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(2), `goal-matched peer missing: got ${ids.join(",")}`);
      assert.ok(ids.includes(3), `recently-active peer B missing: got ${ids.join(",")}`);
      assert.ok(ids.includes(4), `recently-active peer C missing: got ${ids.join(",")}`);

      const idxA = ids.indexOf(2);
      const idxB = ids.indexOf(3);
      const idxC = ids.indexOf(4);
      assert.ok(
        idxA < idxB && idxA < idxC,
        `goal-matched peer must rank above recently-active-only peers: order=${ids.join(",")}`,
      );

      const peerA = rows.find((r) => r.id === 2);
      assert.equal(peerA?.reason, "similar_goals");
      assert.equal(rows.find((r) => r.id === 3)?.reason, "recently_active");
      assert.equal(rows.find((r) => r.id === 4)?.reason, "recently_active");
    });

    it("GET /social/me/post-insights excludes soft-deleted posts from creator analytics", async () => {
      // The viewer is player 1; surface their own posts only.
      state.posts.push(
        makePost({ id: LIVE_ID, playerId: 1, content: "mine live" }),
        makePost({
          id: DELETED_ID, playerId: 1, content: "mine deleted",
          deletedAt: new Date(),
        }),
      );
      const { status, body } = await req("GET", "/social/me/post-insights");
      assert.equal(status, 200);
      const ids = (body as { posts: { id: number }[] }).posts.map((p) => p.id);
      assert.deepEqual(ids, [LIVE_ID]);
    });
  });

  describe("write endpoints reject soft-deleted posts with 404", () => {
    beforeEach(() => {
      seedLiveAndDeleted();
    });

    it("POST /social/posts/:id/react → 404 for a deleted post", async () => {
      const { status } = await req("POST", `/social/posts/${DELETED_ID}/react`, {
        reactionType: "like",
      });
      assert.equal(status, 404);
      // No reaction row should have been created.
      assert.equal(state.postReactions.length, 0);
    });

    it("POST /social/posts/:id/repost → 404 for a deleted post", async () => {
      const { status } = await req("POST", `/social/posts/${DELETED_ID}/repost`, {});
      assert.equal(status, 404);
      assert.equal(state.postReposts.length, 0);
    });

    it("POST /social/posts/:id/comments → 404 for a deleted post", async () => {
      const { status } = await req("POST", `/social/posts/${DELETED_ID}/comments`, {
        content: "nope",
      });
      assert.equal(status, 404);
      assert.equal(state.postComments.length, 0);
    });

    it("write endpoints still succeed against a live post (control)", async () => {
      const r = await req("POST", `/social/posts/${LIVE_ID}/react`, { reactionType: "like" });
      assert.equal(r.status, 200);
      assert.equal(state.postReactions.length, 1);
    });
  });
});

// ── Comment-like notifications ──────────────────────────────────────────
// Covers the toggleCommentLike notification path: self-like skip,
// dedupe on rapid toggle, and that unliking preserves the existing
// notification row (we never retract a notification on unlike).
describe("social.ts comment-like notifications", () => {
  const COMMENT_ID = 5000;
  const POST_ID = LIVE_ID;

  // Viewer (req.playerId) is player 1 from seedBaseline; author is player 2.
  function seedAuthoredComment(authorId: number) {
    state.posts.push(makePost({ id: POST_ID, playerId: authorId, content: "p" }));
    state.postComments.push({
      id: COMMENT_ID,
      postId: POST_ID,
      playerId: authorId,
      content: "great workout!",
      isFlagged: false,
      createdAt: new Date(),
      updatedAt: null,
    });
  }

  const likePath = `/social/posts/${POST_ID}/comments/${COMMENT_ID}/like`;

  beforeEach(() => {
    resetState();
    seedBaseline();
  });

  it("liking another player's comment creates exactly one notification", async () => {
    seedAuthoredComment(2);
    const r = await req("POST", likePath, {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { liked: true, likeCount: 1 });
    assert.equal(state.notifications.length, 1);
    const notif = state.notifications[0] as Record<string, unknown>;
    assert.equal(notif.playerId, 2);
    assert.equal(notif.type, "comment_like");
    assert.equal(notif.sourceId, COMMENT_ID);
  });

  it("self-likes create no notification", async () => {
    // Author is player 1 (the same as the viewer).
    seedAuthoredComment(1);
    const r = await req("POST", likePath, {});
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { liked: true, likeCount: 1 });
    assert.equal(state.notifications.length, 0);
  });

  it("rapid unlike + relike does not create a duplicate notification row", async () => {
    seedAuthoredComment(2);
    // 1) like
    const a = await req("POST", likePath, {});
    assert.equal(a.status, 200);
    assert.equal((a.body as { liked: boolean }).liked, true);
    assert.equal(state.notifications.length, 1);
    // 2) unlike
    const b = await req("POST", likePath, {});
    assert.equal(b.status, 200);
    assert.equal((b.body as { liked: boolean }).liked, false);
    // 3) relike — must hit the dedupe guard
    const c = await req("POST", likePath, {});
    assert.equal(c.status, 200);
    assert.equal((c.body as { liked: boolean }).liked, true);
    assert.equal(
      state.notifications.length,
      1,
      `expected dedupe to hold; got ${state.notifications.length} notifications`,
    );
  });

  it("unliking does not remove the existing notification", async () => {
    seedAuthoredComment(2);
    const a = await req("POST", likePath, {});
    assert.equal(a.status, 200);
    assert.equal(state.notifications.length, 1);
    const notifIdBefore = (state.notifications[0] as { id: number }).id;

    const b = await req("POST", likePath, {});
    assert.equal(b.status, 200);
    assert.equal((b.body as { liked: boolean }).liked, false);
    assert.equal(state.postCommentReactions.length, 0);
    // Notification row is intentionally retained on unlike.
    assert.equal(state.notifications.length, 1);
    assert.equal((state.notifications[0] as { id: number }).id, notifIdBefore);
  });
});
