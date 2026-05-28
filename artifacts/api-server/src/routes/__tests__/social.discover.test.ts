// Tests for GET /social/discover and GET /social/search. Locks in the same
// privacy-critical rules that /players/search and /leaderboards/scoped
// enforce, so blocked, hidden-visibility, and minor accounts never leak into
// people-discovery surfaces (the social discover card / people search UI).
//
// We mount the real `socialRouter` on a tiny express app with all DB,
// drizzle, auth, rate-limit, guard, and helper modules mocked out (same
// pattern as social.test.ts and players.search.test.ts) and drive it over
// real HTTP.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── Table column stubs ───────────────────────────────────────────────────
const col = (name: string) => ({ __col: name }) as const;
function makeTable<T extends string>(store: T, columns: readonly string[]) {
  const t: Record<string, unknown> = { __store: store };
  for (const c of columns) t[c] = col(c);
  return t;
}

const postsTable = makeTable("posts", [
  "id", "playerId", "content", "mediaUrl", "postType", "creatureId",
  "xpEarned", "energyEarned", "isFlagged", "engagementScore", "viewCount",
  "metadata", "deletedAt", "createdAt",
]);
const postCommentRevisionsTable = makeTable("postCommentRevisions", ["id"]);
const userReportsTable = makeTable("userReports", ["id"]);
const postViewsTable = makeTable("postViews", ["id"]);
const postReactionsTable = makeTable("postReactions", ["id", "postId"]);
const postCommentsTable = makeTable("postComments", ["id", "postId"]);
const postCommentReactionsTable = makeTable("postCommentReactions", ["id"]);
const postRepostsTable = makeTable("postReposts", ["id", "postId"]);
const playerFollowsTable = makeTable("playerFollows", ["id", "followerId", "followeeId"]);
const playersTable = makeTable("players", [
  "id", "clerkId", "username", "displayName", "avatarUrl", "creatorBadge",
  "fitnessRealm", "physiqueGoal", "fitnessLevel",
  "locationVisibility", "isMinor",
]);
const hatchlingsTable = makeTable("hatchlings", ["id"]);
const groupMembersTable = makeTable("groupMembers", ["id", "groupId", "playerId"]);
const groupsTable = makeTable("groups", ["id", "name"]);
const notificationsTable = makeTable("notifications", ["id"]);

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
  hiddenIds: [] as number[],
};

function resetState() {
  for (const k of Object.keys(state) as (keyof typeof state)[]) {
    (state[k] as unknown[]).length = 0;
  }
}

const storeFor = (t: unknown): Row[] => {
  const key = (t as { __store?: keyof typeof state }).__store;
  if (!key || key === "hiddenIds") return [];
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
  (row) => (row[c.__col] as number) >= (val as number);
const opIlike = (c: { __col: string }, pattern: string): Pred => {
  const p = String(pattern).toLowerCase().replace(/%/g, "");
  return (row) => String(row[c.__col] ?? "").toLowerCase().includes(p);
};
const opAsc = (c: { __col: string }) => ({ __asc: c.__col });
const opDesc = (c: { __col: string }) => ({ __desc: c.__col });
const opSql = (..._args: unknown[]): Pred & { __sql: true } => {
  const p = TRUE_PRED as Pred & { __sql: true };
  p.__sql = true;
  return p;
};
const opAlias = (t: unknown, _name: string) => t;

mock.module("drizzle-orm", {
  namedExports: {
    eq: opEq, ne: opNe, and: opAnd, or: opOr,
    isNull: opIsNull, isNotNull: opIsNotNull, inArray: opInArray,
    gte: opGte, lt: () => TRUE_PRED, ilike: opIlike,
    asc: opAsc, desc: opDesc, sql: opSql,
  },
});
mock.module("drizzle-orm/pg-core", { namedExports: { alias: opAlias } });

// ── Fake DB ──────────────────────────────────────────────────────────────
function sortRows(rows: Row[], orderBy?: unknown[]): Row[] {
  if (!orderBy?.length) return rows;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    for (const o of orderBy) {
      const desc = (o as { __desc?: string }).__desc;
      const asc = (o as { __asc?: string }).__asc;
      const colName = desc ?? asc;
      if (!colName) continue;
      const av = a[colName] as number | Date | string | null;
      const bv = b[colName] as number | Date | string | null;
      const an = av instanceof Date ? av.getTime() : (av as number | string);
      const bn = bv instanceof Date ? bv.getTime() : (bv as number | string);
      if (an == null && bn == null) continue;
      if (an !== bn) {
        const cmp = (an as number) < (bn as number) ? -1 : 1;
        return desc ? -cmp : cmp;
      }
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
    findMany: async (args?: { where?: Pred; orderBy?: unknown[] | ((t: unknown, h: { asc: typeof opAsc; desc: typeof opDesc }) => unknown[]); limit?: number }) => {
      const pred = args?.where ?? TRUE_PRED;
      let rows = (state[key] as Row[]).filter(pred);
      const orderBy = typeof args?.orderBy === "function"
        ? args.orderBy({}, { asc: opAsc, desc: opDesc })
        : args?.orderBy;
      rows = sortRows(rows, orderBy);
      if (args?.limit != null) rows = rows.slice(0, args.limit);
      return rows;
    },
  };
}

function makeSelectBuilder(cols: Record<string, unknown> | undefined) {
  let rows: Row[] = [];
  let pred: Pred = TRUE_PRED;
  let groupByCol: string | null = null;
  const finalize = (): Row[] => {
    const out = rows.filter(pred);
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
    return out;
  };

  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    from(t: unknown) { rows = [...storeFor(t)]; return builder; },
    where(p: Pred) { pred = ensure(p); return builder; },
    innerJoin(_t: unknown, _on: unknown) { return builder; },
    leftJoin(_t: unknown, _on: unknown) { return builder; },
    groupBy(c: { __col: string }) { groupByCol = c.__col; return builder; },
    orderBy(..._o: unknown[]) { return builder; },
    limit(_n: number) { return builder; },
    then(onFulfilled: (rows: Row[]) => unknown) {
      return Promise.resolve(onFulfilled(finalize()));
    },
  });
  return builder;
}

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
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    postsTable, postViewsTable, postReactionsTable, postCommentsTable,
    postCommentReactionsTable, postRepostsTable, playerFollowsTable,
    playersTable, hatchlingsTable, groupMembersTable, groupsTable,
    notificationsTable, postCommentRevisionsTable, userReportsTable,
  },
});

// ── Module mocks ─────────────────────────────────────────────────────────
const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
const attachPlayerMw = (req: { playerId?: number }, _res: unknown, next: () => void) => {
  req.playerId = 1;
  next();
};

mock.module("../../middlewares/auth.ts", {
  namedExports: { requireAuth: passThrough, attachPlayer: attachPlayerMw },
});
mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    socialWriteLimiter: passThrough, postViewLimiter: passThrough,
    locationUpdateLimiter: passThrough, fitnessLogLimiter: passThrough,
    aiCoachLimiter: passThrough, recapPreviewLimiter: passThrough,
    scanLimiter: passThrough,
  },
});
mock.module("../../middlewares/minorGuard.ts", {
  namedExports: { blockMinorSocialWrite: passThrough },
});
mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: { blockSuspendedSocialWrite: passThrough },
});
mock.module("../safety.ts", {
  namedExports: { getHiddenPlayerIds: async (_viewerId: number) => state.hiddenIds },
});
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: { attachEntitlement: passThrough, requirePremium: passThrough },
});
mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => {} },
});
mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async (_ids: number[]) => {}, RETENTION_DAYS: 30 },
});
mock.module("../sharedGroups.ts", {
  namedExports: {
    groupSharedGroupRows: (rows: unknown[]) => rows,
    loadSharedGroupsForViewer: async () => new Map(),
    loadMutualWorkoutPartnersForViewer: async () => new Map(),
  },
});
mock.module("../socialCommentOrdering.ts", {
  namedExports: { selectTopComments: <T,>(rows: T[]) => rows },
});
mock.module("@clerk/express", {
  namedExports: { getAuth: () => ({ userId: "clerk_user_1" }) },
});

const passSchema = {
  safeParse: (data: unknown) => ({ success: true as const, data: (data ?? {}) as Record<string, unknown> }),
};
mock.module("@workspace/api-zod", {
  namedExports: {
    CreatePostBody: passSchema, ReactToPostBody: passSchema,
    AddPostCommentBody: passSchema, EditPostCommentBody: passSchema,
    FollowPlayerBody: passSchema, RepostPostBody: passSchema,
  },
});

// ── Boot the router under test ───────────────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;

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
type PlayerOverride = Partial<Row> & { id: number; clerkId: string; username: string };
function makePlayer(over: PlayerOverride): Row {
  return {
    displayName: over.username,
    avatarUrl: null,
    creatorBadge: null,
    // Default everyone into the same realm/level so they show up as
    // similar-goals candidates for /social/discover.
    fitnessRealm: "strength",
    physiqueGoal: null,
    fitnessLevel: "beginner",
    locationVisibility: "city",
    isMinor: false,
    ...over,
  };
}

function seedViewer(over: Partial<Row> = {}) {
  state.players.push(makePlayer({ id: 1, clerkId: "clerk_user_1", username: "viewer", ...over }));
}

async function req(path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: "Bearer x" },
  });
  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

beforeEach(() => { resetState(); });

// ── /social/search tests ────────────────────────────────────────────────
describe("GET /social/search — privacy rules", () => {
  it("excludes the viewer themselves from their own search results", async () => {
    seedViewer({ username: "alice" });
    state.players.push(makePlayer({ id: 2, clerkId: "u_a", username: "alicebob" }));

    const { status, body } = await req("/social/search?q=alice");
    assert.equal(status, 200);
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });

  it("excludes candidates with visibility=hidden", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_v", username: "searchzvisible" }));
    state.players.push(makePlayer({
      id: 3, clerkId: "u_g", username: "searchzghost",
      locationVisibility: "hidden",
    }));

    const { body } = await req("/social/search?q=searchz");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });

  it("excludes minors entirely from search results", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_adult", username: "fitzadult" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_kid", username: "fitzkid", isMinor: true }));

    const { body } = await req("/social/search?q=fitz");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });

  it("excludes users blocked by the viewer or who have blocked the viewer (either direction)", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_blocked", username: "userzblocked" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_ok", username: "userzok" }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_blocker", username: "userzblocker" }));
    state.hiddenIds.push(2, 4);

    const { body } = await req("/social/search?q=userz");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [3]);
  });

  it("combines all three exclusions in a single query", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_ok", username: "teamzok" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_hidden", username: "teamzhidden", locationVisibility: "hidden" }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_minor", username: "teamzminor", isMinor: true }));
    state.players.push(makePlayer({ id: 5, clerkId: "u_block", username: "teamzblock" }));
    state.hiddenIds.push(5);

    const { body } = await req("/social/search?q=teamz");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });
});

// ── /social/discover tests ──────────────────────────────────────────────
describe("GET /social/discover — privacy rules", () => {
  it("includes a similar-goals peer in the default cohort", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_peer", username: "peer" }));

    const { status, body } = await req("/social/discover");
    assert.equal(status, 200);
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2], "baseline: peer should appear in discover");
  });

  it("excludes candidates with visibility=hidden", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_v", username: "visiblepeer" }));
    state.players.push(makePlayer({
      id: 3, clerkId: "u_g", username: "ghostpeer",
      locationVisibility: "hidden",
    }));

    const { body } = await req("/social/discover");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });

  it("excludes minors entirely from discover", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_adult", username: "adultpeer" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_kid", username: "kidpeer", isMinor: true }));

    const { body } = await req("/social/discover");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [2]);
  });

  it("excludes users blocked by the viewer or who have blocked the viewer (either direction)", async () => {
    seedViewer();
    state.players.push(makePlayer({ id: 2, clerkId: "u_blocked", username: "blockedpeer" }));
    state.players.push(makePlayer({ id: 3, clerkId: "u_ok", username: "okpeer" }));
    state.players.push(makePlayer({ id: 4, clerkId: "u_blocker", username: "blockerpeer" }));
    state.hiddenIds.push(2, 4);

    const { body } = await req("/social/discover");
    const ids = (body as Array<{ id: number }>).map(p => p.id);
    assert.deepEqual(ids.sort(), [3]);
  });
});
