// Integration tests for the mutual-followers and mutual-following endpoints
// on the social router. We stand up the real Express router against an
// in-memory fake of the database that understands a subset of drizzle's
// query DSL (eq/and/ne/inArray + db.select chains with innerJoin). That lets
// the route logic itself (set intersections, self-filtering, viewer/profile
// exclusion, pagination, preview cap) run for real while we keep tests
// hermetic.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ─────────────────────────────────────────────────────────

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  creatorBadge: string | null;
  isMinor?: boolean;
  isSuspended?: boolean;
}

interface FollowRow { followerId: number; followeeId: number }

const state = {
  players: [] as PlayerRow[],
  follows: [] as FollowRow[],
  // The currently-authenticated player (matched via clerkId by attachPlayer).
  currentClerkId: "u_viewer",
};

function resetState() {
  state.players = [];
  state.follows = [];
  state.currentClerkId = "u_viewer";
}

function seedPlayer(p: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const row: PlayerRow = {
    displayName: p.username,
    avatarUrl: null,
    creatorBadge: null,
    isMinor: false,
    isSuspended: false,
    ...p,
  } as PlayerRow;
  state.players.push(row);
  return row;
}

function seedFollow(followerId: number, followeeId: number) {
  state.follows.push({ followerId, followeeId });
}

// ── Mocks: Clerk passthrough ────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.currentClerkId }),
  },
});

// Push notifications + other services that social.ts imports but our routes
// never call.
mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => undefined },
});

// postPurgeJob transitively imports `../lib/logger` (no extension), which
// node's experimental ESM resolver under --experimental-strip-types refuses
// to resolve. Mock it out — the routes under test never invoke it.
mock.module("../../services/postPurgeJob.ts", {
  namedExports: {
    hardDeletePosts: async () => undefined,
    RETENTION_DAYS: 30,
    purgeSoftDeletedPosts: async () => ({ purged: 0 }),
    startPostPurgeJob: () => undefined,
  },
});

// safety.ts (re-exported from social.ts via getHiddenPlayerIds) transitively
// pulls in emailVerification → emailService (also extension-less). Mock the
// one helper the routes under test actually use.
{
  const expressMod = (await import("express")).default;
  mock.module("../safety.ts", {
    namedExports: {
      getHiddenPlayerIds: async () => [] as number[],
    },
    defaultExport: expressMod.Router(),
  });
}

// Rate-limiter middlewares: pass-through in tests.
const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    socialWriteLimiter: passthrough,
    postViewLimiter: passthrough,
  },
});

// Auth: requireAuth attaches the current viewer; attachPlayer looks the
// player up against our in-memory state via clerkId.
mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (req: any, _res: any, next: () => void) => {
      req.clerkUserId = state.currentClerkId;
      next();
    },
    attachPlayer: (req: any, res: any, next: () => void) => {
      const player = state.players.find(p => p.clerkId === req.clerkUserId);
      if (!player) { res.status(404).json({ error: "no player" }); return; }
      req.playerId = player.id;
      next();
    },
    requirePlayerOwnership: passthrough,
  },
});

// Subscription guards: routes under test don't depend on entitlement; expose
// the names social.ts imports so the module load succeeds.
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: passthrough,
    requirePremium: passthrough,
  },
});

mock.module("../../middlewares/minorGuard.ts", {
  namedExports: { blockMinorSocialWrite: passthrough },
});

mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: { blockSuspendedSocialWrite: passthrough },
});

// ── Drizzle DSL mock — encode predicates as opaque markers ─────────────────

type Col = { __col: true; table: string; col: string };
type Predicate =
  | { __op: "eq"; a: any; b: any }
  | { __op: "ne"; a: any; b: any }
  | { __op: "and"; args: Predicate[] }
  | { __op: "or"; args: Predicate[] }
  | { __op: "inArray"; col: Col; vals: any[] }
  | { __op: "isNull"; col: Col }
  | undefined;

mock.module("drizzle-orm", {
  namedExports: {
    eq: (a: any, b: any) => ({ __op: "eq", a, b }),
    ne: (a: any, b: any) => ({ __op: "ne", a, b }),
    and: (...args: any[]) => ({ __op: "and", args: args.filter(Boolean) }),
    or: (...args: any[]) => ({ __op: "or", args: args.filter(Boolean) }),
    desc: (col: any) => ({ __desc: true, col }),
    inArray: (col: any, vals: any[]) => ({ __op: "inArray", col, vals }),
    isNull: (col: any) => ({ __op: "isNull", col }),
    isNotNull: (col: any) => ({ __op: "isNotNull", col }),
    ilike: () => ({ __op: "ilike" }),
    gte: () => ({ __op: "gte" }),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({ __sql: true }),
      { raw: (_s: string) => ({ __sql: true }) },
    ),
  },
});

// alias() returns a Proxy table with a different alias name. Column access on
// the alias returns col sentinels whose `table` field is the alias name, so
// join predicates referencing the same underlying table twice work.
function makeTable(tableName: string, aliasName?: string) {
  return new Proxy(
    { __tableName: tableName, __alias: aliasName ?? tableName },
    {
      get(target: any, prop) {
        if (prop === "__tableName" || prop === "__alias") return target[prop];
        if (typeof prop === "symbol") return undefined;
        return { __col: true, table: target.__alias, col: String(prop) } as Col;
      },
    },
  );
}

mock.module("drizzle-orm/pg-core", {
  namedExports: {
    alias: (table: any, name: string) => makeTable(table.__tableName, name),
  },
});

// ── Fake @workspace/db ──────────────────────────────────────────────────────

const tablesByName: Record<string, () => any[]> = {
  playersTable: () => state.players,
  playerFollowsTable: () => state.follows,
  postsTable: () => [],
  groupMembersTable: () => [],
  groupsTable: () => [],
  postReactionsTable: () => [],
  postCommentsTable: () => [],
  postRepostsTable: () => [],
  postViewsTable: () => [],
  postCommentReactionsTable: () => [],
  hatchlingsTable: () => [],
  notificationsTable: () => [],
};

function getCellValue(row: any, c: Col): any {
  // Strip any table prefix; for findFirst/findMany we evaluate on the single
  // table's row directly, so `col` is just the field name.
  return row?.[c.col];
}

function evalSingle(row: any, pred: Predicate): boolean {
  if (!pred) return true;
  switch (pred.__op) {
    case "and": return pred.args.every(p => evalSingle(row, p));
    case "or":  return pred.args.some(p => evalSingle(row, p));
    case "eq":  return resolve(row, pred.a) === resolve(row, pred.b);
    case "ne":  return resolve(row, pred.a) !== resolve(row, pred.b);
    case "inArray": return pred.vals.includes(resolve(row, pred.col));
    case "isNull":  return resolve(row, pred.col) == null;
    default: return true;
  }
}

function resolve(row: any, x: any): any {
  if (x && typeof x === "object" && x.__col) return getCellValue(row, x);
  return x;
}

function buildQueryHandler(tableName: string) {
  return {
    findFirst: async (opts: { where?: Predicate; columns?: Record<string, boolean> } = {}) => {
      const rows = tablesByName[tableName]().filter(r => evalSingle(r, opts.where));
      return rows[0];
    },
    findMany: async (opts: { where?: Predicate; limit?: number } = {}) => {
      let rows = tablesByName[tableName]().filter(r => evalSingle(r, opts.where));
      if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);
      return rows;
    },
  };
}

// ── db.select(...).from(...).innerJoin(...).where(...) chain ───────────────

interface SelectChainState {
  cols: Record<string, any>;
  combos: Array<Record<string, any>>;
  joinedAliases: Set<string>;
  limit?: number;
  offset?: number;
}

function evalJoined(combo: Record<string, any>, x: any): any {
  if (x && typeof x === "object" && x.__col) return combo[x.table]?.[x.col];
  return x;
}

function evalJoinedPred(combo: Record<string, any>, pred: Predicate): boolean {
  if (!pred) return true;
  switch (pred.__op) {
    case "and": return pred.args.every(p => evalJoinedPred(combo, p));
    case "or":  return pred.args.some(p => evalJoinedPred(combo, p));
    case "eq":  return evalJoined(combo, pred.a) === evalJoined(combo, pred.b);
    case "ne":  return evalJoined(combo, pred.a) !== evalJoined(combo, pred.b);
    case "inArray": return pred.vals.includes(evalJoined(combo, pred.col));
    case "isNull":  return evalJoined(combo, pred.col) == null;
    default: return true;
  }
}

function materialize(s: SelectChainState): any[] {
  // Detect count-style projection: a single col whose value is a sql marker.
  const colEntries = Object.entries(s.cols);
  const isCount = colEntries.length === 1 && (colEntries[0][1] as any)?.__sql === true;
  if (isCount) {
    const key = colEntries[0][0];
    return [{ [key]: s.combos.length }];
  }
  // Apply offset then limit at materialize time so the chain matches SQL
  // semantics regardless of call order.
  let rows = s.combos;
  if (s.offset !== undefined) rows = rows.slice(s.offset);
  if (s.limit !== undefined) rows = rows.slice(0, s.limit);
  return rows.map(combo => {
    const out: Record<string, any> = {};
    for (const [k, v] of colEntries) {
      out[k] = evalJoined(combo, v);
    }
    return out;
  });
}

function makeSelectChain(cols: Record<string, any>) {
  const s: SelectChainState = {
    cols,
    combos: [],
    joinedAliases: new Set(),
  };

  const chain: any = {
    from(table: any) {
      const alias = table.__alias;
      const rows = tablesByName[table.__tableName]();
      s.combos = rows.map(r => ({ [alias]: r }));
      s.joinedAliases.add(alias);
      return chain;
    },
    innerJoin(table: any, predicate: Predicate) {
      const alias = table.__alias;
      const rows = tablesByName[table.__tableName]();
      const next: Array<Record<string, any>> = [];
      for (const combo of s.combos) {
        for (const r of rows) {
          const candidate = { ...combo, [alias]: r };
          if (evalJoinedPred(candidate, predicate)) next.push(candidate);
        }
      }
      s.combos = next;
      s.joinedAliases.add(alias);
      return chain;
    },
    leftJoin(table: any, predicate: Predicate) {
      // Not used by the routes under test, but keep the chain alive.
      return chain.innerJoin(table, predicate);
    },
    where(predicate: Predicate) {
      s.combos = s.combos.filter(c => evalJoinedPred(c, predicate));
      return chain;
    },
    orderBy(...orderCols: any[]) {
      const keys = orderCols.map(c =>
        c?.__desc ? { col: c.col as Col, dir: -1 } : { col: c as Col, dir: 1 },
      );
      s.combos.sort((a, b) => {
        for (const { col, dir } of keys) {
          const av = evalJoined(a, col);
          const bv = evalJoined(b, col);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
        }
        return 0;
      });
      return chain;
    },
    limit(n: number) {
      s.limit = n;
      return chain;
    },
    offset(n: number) {
      s.offset = n;
      return chain;
    },
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(materialize(s)).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

const fakeDb: any = {
  query: new Proxy({}, {
    get: (_t, name: string) => buildQueryHandler(name),
  }),
  select: (cols: Record<string, any> = {}) => makeSelectChain(cols),
  insert: () => ({
    values: () => ({
      returning: async () => [{}],
      onConflictDoNothing: () => ({ returning: async () => [{}] }),
      then: (r: any, j: any) => Promise.resolve(undefined).then(r, j),
    }),
  }),
  update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  delete: () => ({ where: () => ({ returning: async () => [{}] }) }),
  execute: async () => ({ rows: [] }),
};

// Re-export schema as opaque markers — only ever read as table identifiers.
mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    playersTable: makeTable("playersTable"),
    playerFollowsTable: makeTable("playerFollowsTable"),
    postsTable: makeTable("postsTable"),
    postReactionsTable: makeTable("postReactionsTable"),
    postCommentsTable: makeTable("postCommentsTable"),
    postCommentRevisionsTable: makeTable("postCommentRevisionsTable"),
    postCommentReactionsTable: makeTable("postCommentReactionsTable"),
    userReportsTable: makeTable("userReportsTable"),
    postRepostsTable: makeTable("postRepostsTable"),
    postViewsTable: makeTable("postViewsTable"),
    groupMembersTable: makeTable("groupMembersTable"),
    groupsTable: makeTable("groupsTable"),
    hatchlingsTable: makeTable("hatchlingsTable"),
    notificationsTable: makeTable("notificationsTable"),
    userReportsTable: makeTable("userReportsTable"),
    blockedUsersTable: makeTable("blockedUsersTable"),
    postCommentRevisionsTable: makeTable("postCommentRevisionsTable"),
  },
});

// api-zod is loaded for unrelated POST bodies; reuse empty schemas.
mock.module("@workspace/api-zod", {
  namedExports: {
    CreatePostBody: { safeParse: () => ({ success: false }) },
    ReactToPostBody: { safeParse: () => ({ success: false }) },
    AddPostCommentBody: { safeParse: () => ({ success: false }) },
    EditPostCommentBody: { safeParse: () => ({ success: false }) },
    FollowPlayerBody: { safeParse: () => ({ success: false }) },
    RepostPostBody: { safeParse: () => ({ success: false }) },
  },
});

// ── Server bootstrap (after mocks) ─────────────────────────────────────────

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
});

async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: await res.json() as any };
}

// ── Tests: mutual-followers ─────────────────────────────────────────────────

describe("GET /social/players/:id/mutual-followers", () => {
  it("returns empty when nobody overlaps", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    seedPlayer({ id: 3, clerkId: "u_other", username: "other" });
    // viewer follows 3; nobody follows profile 2.
    seedFollow(1, 3);

    const { res, body } = await getJson("/social/players/2/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { players: [], total: 0, nextCursor: null });
  });

  it("returns empty when viewer is viewing themselves", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 5, clerkId: "u_a", username: "a" });
    // The viewer follows 5, and 5 follows the viewer — would be "mutual" with
    // anyone else but must yield empty when looking at the viewer's own profile.
    seedFollow(1, 5);
    seedFollow(5, 1);

    const { res, body } = await getJson("/social/players/1/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { players: [], total: 0, nextCursor: null });
  });

  it("excludes both the viewer and the profile from the results", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    seedPlayer({ id: 3, clerkId: "u_buddy", username: "buddy" });

    // viewer follows profile AND buddy AND themselves; buddy and profile both
    // follow profile. The route must exclude the viewer (1) and the profile
    // (2) from the resulting mutual-followers list even if such edges exist.
    seedFollow(1, 2);
    seedFollow(1, 3);
    seedFollow(3, 2);
    seedFollow(1, 1); // pathological viewer self-follow
    seedFollow(2, 2); // pathological profile self-follow

    const { res, body } = await getJson("/social/players/2/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.players.length, 1);
    assert.equal(body.players[0].id, 3);
    assert.ok(!body.players.some((p: any) => p.id === 1));
    assert.ok(!body.players.some((p: any) => p.id === 2));
    assert.equal(body.nextCursor, null);
  });

  it("paginates via cursor", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 99, clerkId: "u_profile", username: "profile" });
    // 5 mutual followers (ids 10..14). All followed by viewer AND following profile.
    for (let i = 10; i < 15; i++) {
      seedPlayer({ id: i, clerkId: `u_${i}`, username: `m${i}` });
      seedFollow(1, i);
      seedFollow(i, 99);
    }

    const page1 = await getJson("/social/players/99/mutual-followers?viewerId=1&limit=2&cursor=0");
    assert.equal(page1.res.status, 200);
    assert.equal(page1.body.total, 5);
    assert.deepEqual(page1.body.players.map((p: any) => p.id), [10, 11]);
    assert.equal(page1.body.nextCursor, 2);

    const page2 = await getJson("/social/players/99/mutual-followers?viewerId=1&limit=2&cursor=2");
    assert.deepEqual(page2.body.players.map((p: any) => p.id), [12, 13]);
    assert.equal(page2.body.nextCursor, 4);

    const page3 = await getJson("/social/players/99/mutual-followers?viewerId=1&limit=2&cursor=4");
    assert.deepEqual(page3.body.players.map((p: any) => p.id), [14]);
    assert.equal(page3.body.nextCursor, null);
  });
});

// ── Tests: mutual-following ────────────────────────────────────────────────

describe("GET /social/players/:id/mutual-following", () => {
  it("returns empty when nobody overlaps", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    seedPlayer({ id: 3, clerkId: "u_x", username: "x" });
    seedPlayer({ id: 4, clerkId: "u_y", username: "y" });
    seedFollow(1, 3);
    seedFollow(2, 4);

    const { res, body } = await getJson("/social/players/2/mutual-following?viewerId=1");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { players: [], total: 0, nextCursor: null });
  });

  it("returns empty when viewer is viewing themselves", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 5, clerkId: "u_a", username: "a" });
    seedFollow(1, 5);

    const { res, body } = await getJson("/social/players/1/mutual-following?viewerId=1");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { players: [], total: 0, nextCursor: null });
  });

  it("excludes the viewer and the profile from results", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    seedPlayer({ id: 3, clerkId: "u_target", username: "target" });

    // Viewer follows target AND profile AND themselves (pathological).
    seedFollow(1, 3);
    seedFollow(1, 2);
    seedFollow(1, 1);
    // Profile follows target AND viewer AND themselves.
    seedFollow(2, 3);
    seedFollow(2, 1);
    seedFollow(2, 2);

    const { res, body } = await getJson("/social/players/2/mutual-following?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.players.length, 1);
    assert.equal(body.players[0].id, 3);
    // The viewer (1) and the profile (2) must not appear in results.
    assert.ok(!body.players.some((p: any) => p.id === 1));
    assert.ok(!body.players.some((p: any) => p.id === 2));
    assert.equal(body.nextCursor, null);
  });

  it("paginates via cursor", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    for (let i = 10; i < 15; i++) {
      seedPlayer({ id: i, clerkId: `u_${i}`, username: `m${i}` });
      seedFollow(1, i);
      seedFollow(2, i);
    }

    const page1 = await getJson("/social/players/2/mutual-following?viewerId=1&limit=2&cursor=0");
    assert.equal(page1.res.status, 200);
    assert.equal(page1.body.total, 5);
    assert.equal(page1.body.players.length, 2);
    assert.equal(page1.body.nextCursor, 2);

    const page2 = await getJson("/social/players/2/mutual-following?viewerId=1&limit=2&cursor=2");
    assert.equal(page2.body.players.length, 2);
    assert.equal(page2.body.nextCursor, 4);

    const page3 = await getJson("/social/players/2/mutual-following?viewerId=1&limit=2&cursor=4");
    assert.equal(page3.body.players.length, 1);
    assert.equal(page3.body.nextCursor, null);

    // No overlap across pages.
    const allIds = [
      ...page1.body.players.map((p: any) => p.id),
      ...page2.body.players.map((p: any) => p.id),
      ...page3.body.players.map((p: any) => p.id),
    ];
    assert.equal(new Set(allIds).size, 5);
  });
});

// ── Tests: profile payload preview cap at 3 ────────────────────────────────

describe("GET /social/players/:id/profile mutual previews", () => {
  it("caps mutualFollowers and mutualFollowing previews at 3 while reporting full totals", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });

    // 5 mutual followers (ids 10..14): viewer follows them AND they follow profile.
    for (let i = 10; i < 15; i++) {
      seedPlayer({ id: i, clerkId: `u_f${i}`, username: `f${i}` });
      seedFollow(1, i);     // viewer -> i
      seedFollow(i, 2);     // i -> profile
    }
    // 4 mutual following (ids 20..23): both viewer and profile follow them.
    for (let i = 20; i < 24; i++) {
      seedPlayer({ id: i, clerkId: `u_g${i}`, username: `g${i}` });
      seedFollow(1, i);
      seedFollow(2, i);
    }

    const { res, body } = await getJson("/social/players/2/profile");
    assert.equal(res.status, 200);

    assert.equal(body.mutualFollowersTotal, 5);
    assert.equal(body.mutualFollowers.length, 3, "preview list caps at 3");

    assert.equal(body.mutualFollowingTotal, 4);
    assert.equal(body.mutualFollowing.length, 3, "preview list caps at 3");

    // Sanity: previewed entries must come from the mutual sets, and never
    // include the viewer or the profile.
    const followerIds = new Set([10, 11, 12, 13, 14]);
    const followingIds = new Set([20, 21, 22, 23]);
    for (const p of body.mutualFollowers) assert.ok(followerIds.has(p.id));
    for (const p of body.mutualFollowing) assert.ok(followingIds.has(p.id));
    for (const p of [...body.mutualFollowers, ...body.mutualFollowing]) {
      assert.notEqual(p.id, 1);
      assert.notEqual(p.id, 2);
    }
  });

  it("excludes the profile from its own preview lists even if it self-follows", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    seedPlayer({ id: 7, clerkId: "u_buddy", username: "buddy" });

    // Profile self-follows (pathological) and also legitimately follows buddy.
    // Viewer follows both profile and buddy. The single legitimate mutual is
    // buddy — profile must never leak into either preview.
    seedFollow(1, 2);
    seedFollow(1, 7);
    seedFollow(2, 2);
    seedFollow(2, 7);
    seedFollow(7, 2);

    const { res, body } = await getJson("/social/players/2/profile");
    assert.equal(res.status, 200);
    assert.ok(!body.mutualFollowers.some((p: any) => p.id === 2));
    assert.ok(!body.mutualFollowing.some((p: any) => p.id === 2));
    assert.equal(body.mutualFollowing.length, 1);
    assert.equal(body.mutualFollowing[0].id, 7);
  });

  it("returns empty preview lists when the viewer is viewing their own profile", async () => {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 9, clerkId: "u_x", username: "x" });
    seedFollow(1, 9);
    seedFollow(9, 1);

    const { res, body } = await getJson("/social/players/1/profile");
    assert.equal(res.status, 200);
    assert.deepEqual(body.mutualFollowers, []);
    assert.equal(body.mutualFollowersTotal, 0);
    assert.deepEqual(body.mutualFollowing, []);
    assert.equal(body.mutualFollowingTotal, 0);
  });
});
