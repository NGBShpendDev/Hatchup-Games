// Coverage for the canonical 3-rule people-discovery filter (block list ∪
// visibility=hidden ∪ isMinor) on the remaining HATCHUP people surfaces.
//
// The pattern matches social.mutuals.test.ts: an in-memory drizzle DSL fake
// against the real Express router. We assert that mutual-followers,
// mutual-following, followers, and following endpoints all drop accounts that:
//   1. The viewer has blocked (or who have blocked the viewer)
//   2. Have locationVisibility = "hidden"
//   3. Are flagged as a minor (isMinor = true)
//
// See safety.ts for the doc block describing this contract.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  creatorBadge: string | null;
  locationVisibility?: string;
  isMinor?: boolean;
  isSuspended?: boolean;
}

interface FollowRow { id: number; followerId: number; followeeId: number }

const state = {
  players: [] as PlayerRow[],
  follows: [] as FollowRow[],
  currentClerkId: "u_viewer",
  hiddenByViewer: new Map<number, number[]>(),
};

function resetState() {
  state.players = [];
  state.follows = [];
  state.currentClerkId = "u_viewer";
  state.hiddenByViewer = new Map();
}

let followAutoId = 1;
function seedPlayer(p: Partial<PlayerRow> & { id: number; clerkId: string; username: string }): PlayerRow {
  const row: PlayerRow = {
    displayName: p.username,
    avatarUrl: null,
    creatorBadge: null,
    locationVisibility: "city",
    isMinor: false,
    isSuspended: false,
    ...p,
  } as PlayerRow;
  state.players.push(row);
  return row;
}

function seedFollow(followerId: number, followeeId: number) {
  state.follows.push({ id: followAutoId++, followerId, followeeId });
}

mock.module("@clerk/express", {
  namedExports: { getAuth: () => ({ userId: state.currentClerkId }) },
});

mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => undefined },
});

mock.module("../../services/postPurgeJob.ts", {
  namedExports: {
    hardDeletePosts: async () => undefined,
    RETENTION_DAYS: 30,
    purgeSoftDeletedPosts: async () => ({ purged: 0 }),
    startPostPurgeJob: () => undefined,
  },
});

{
  const expressMod = (await import("express")).default;
  mock.module("../safety.ts", {
    namedExports: {
      getHiddenPlayerIds: async (viewerId: number) =>
        state.hiddenByViewer.get(viewerId) ?? [],
      filterDiscoverableCandidates: async (viewerId: number, rows: any[]) => {
        const hidden = new Set(state.hiddenByViewer.get(viewerId) ?? []);
        return rows.filter((r: any) =>
          !hidden.has(r?.id)
          && r?.locationVisibility !== "hidden"
          && r?.isMinor !== true,
        );
      },
    },
    defaultExport: expressMod.Router(),
  });
}

const passthrough = (_req: unknown, _res: unknown, next: () => void) => next();
mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: { socialWriteLimiter: passthrough, postViewLimiter: passthrough },
});

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

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: { attachEntitlement: passthrough, requirePremium: passthrough },
});

mock.module("../../middlewares/minorGuard.ts", {
  namedExports: { blockMinorSocialWrite: passthrough },
});

mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: { blockSuspendedSocialWrite: passthrough },
});

type Col = { __col: true; table: string; col: string };
type Predicate =
  | { __op: "eq"; a: any; b: any }
  | { __op: "ne"; a: any; b: any }
  | { __op: "and"; args: Predicate[] }
  | { __op: "or"; args: Predicate[] }
  | { __op: "inArray"; col: Col; vals: any[] }
  | { __op: "notInArray"; col: Col; vals: any[] }
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
    notInArray: (col: any, vals: any[]) => ({ __op: "notInArray", col, vals }),
    isNull: (col: any) => ({ __op: "isNull", col }),
    isNotNull: (col: any) => ({ __op: "isNotNull", col }),
    ilike: () => ({ __op: "ilike" }),
    gt: () => ({ __op: "gt" }),
    gte: () => ({ __op: "gte" }),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({ __sql: true }),
      { raw: (_s: string) => ({ __sql: true }) },
    ),
  },
});

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
  namedExports: { alias: (table: any, name: string) => makeTable(table.__tableName, name) },
});

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
    case "inArray":    return pred.vals.includes(evalJoined(combo, pred.col));
    case "notInArray": return !pred.vals.includes(evalJoined(combo, pred.col));
    case "isNull":     return evalJoined(combo, pred.col) == null;
    default: return true;
  }
}

function resolveSingle(row: any, x: any): any {
  if (x && typeof x === "object" && x.__col) return row?.[x.col];
  return x;
}

function evalSingle(row: any, pred: Predicate): boolean {
  if (!pred) return true;
  switch (pred.__op) {
    case "and": return pred.args.every(p => evalSingle(row, p));
    case "or":  return pred.args.some(p => evalSingle(row, p));
    case "eq":  return resolveSingle(row, pred.a) === resolveSingle(row, pred.b);
    case "ne":  return resolveSingle(row, pred.a) !== resolveSingle(row, pred.b);
    case "inArray":    return pred.vals.includes(resolveSingle(row, pred.col));
    case "notInArray": return !pred.vals.includes(resolveSingle(row, pred.col));
    case "isNull":     return resolveSingle(row, pred.col) == null;
    default: return true;
  }
}

function buildQueryHandler(tableName: string) {
  return {
    findFirst: async (opts: { where?: Predicate } = {}) => {
      return tablesByName[tableName]().filter(r => evalSingle(r, opts.where))[0];
    },
    findMany: async (opts: { where?: Predicate; limit?: number } = {}) => {
      let rows = tablesByName[tableName]().filter(r => evalSingle(r, opts.where));
      if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);
      return rows;
    },
  };
}

interface SelectChainState {
  cols: Record<string, any>;
  combos: Array<Record<string, any>>;
  limit?: number;
  offset?: number;
}

function materialize(s: SelectChainState): any[] {
  const colEntries = Object.entries(s.cols);
  const isCount = colEntries.length === 1 && (colEntries[0][1] as any)?.__sql === true;
  if (isCount) {
    const key = colEntries[0][0];
    return [{ [key]: s.combos.length }];
  }
  let rows = s.combos;
  if (s.offset !== undefined) rows = rows.slice(s.offset);
  if (s.limit !== undefined) rows = rows.slice(0, s.limit);
  return rows.map(combo => {
    const out: Record<string, any> = {};
    for (const [k, v] of colEntries) out[k] = evalJoined(combo, v);
    return out;
  });
}

function makeSelectChain(cols: Record<string, any>) {
  const s: SelectChainState = { cols, combos: [] };
  const chain: any = {
    from(table: any) {
      s.combos = tablesByName[table.__tableName]().map(r => ({ [table.__alias]: r }));
      return chain;
    },
    innerJoin(table: any, predicate: Predicate) {
      const rows = tablesByName[table.__tableName]();
      const next: Array<Record<string, any>> = [];
      for (const combo of s.combos) {
        for (const r of rows) {
          const candidate = { ...combo, [table.__alias]: r };
          if (evalJoinedPred(candidate, predicate)) next.push(candidate);
        }
      }
      s.combos = next;
      return chain;
    },
    leftJoin(table: any, predicate: Predicate) { return chain.innerJoin(table, predicate); },
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
    limit(n: number) { s.limit = n; return chain; },
    offset(n: number) { s.offset = n; return chain; },
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(materialize(s)).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

const fakeDb: any = {
  query: new Proxy({}, { get: (_t, name: string) => buildQueryHandler(name) }),
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

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
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
    blockedUsersTable: makeTable("blockedUsersTable"),
  },
});

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

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: await res.json() as any };
}

// ── mutual-followers ────────────────────────────────────────────────────────

describe("GET /social/players/:id/mutual-followers — 3-rule filter", () => {
  function seedThreeMutuals() {
    // viewer (1), profile (99), and three candidate mutuals 10/11/12 all
    // following profile AND followed by viewer.
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 99, clerkId: "u_profile", username: "profile" });
    for (const id of [10, 11, 12]) {
      seedPlayer({ id, clerkId: `u_${id}`, username: `m${id}` });
      seedFollow(1, id);
      seedFollow(id, 99);
    }
  }

  it("drops blocked accounts (rule 1)", async () => {
    seedThreeMutuals();
    state.hiddenByViewer.set(1, [11]);

    const { res, body } = await getJson("/social/players/99/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [10, 12]);
  });

  it("drops accounts with locationVisibility=hidden (rule 2)", async () => {
    seedThreeMutuals();
    state.players.find(p => p.id === 12)!.locationVisibility = "hidden";

    const { res, body } = await getJson("/social/players/99/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [10, 11]);
  });

  it("drops minor accounts (rule 3)", async () => {
    seedThreeMutuals();
    state.players.find(p => p.id === 10)!.isMinor = true;

    const { res, body } = await getJson("/social/players/99/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [11, 12]);
  });

  it("applies all three rules together", async () => {
    seedThreeMutuals();
    state.hiddenByViewer.set(1, [10]);
    state.players.find(p => p.id === 11)!.locationVisibility = "hidden";
    state.players.find(p => p.id === 12)!.isMinor = true;

    const { res, body } = await getJson("/social/players/99/mutual-followers?viewerId=1");
    assert.equal(res.status, 200);
    assert.deepEqual(body, { players: [], total: 0, nextCursor: null });
  });
});

// ── mutual-following ────────────────────────────────────────────────────────

describe("GET /social/players/:id/mutual-following — 3-rule filter", () => {
  function seedThreeMutuals() {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 2, clerkId: "u_profile", username: "profile" });
    for (const id of [20, 21, 22]) {
      seedPlayer({ id, clerkId: `u_${id}`, username: `m${id}` });
      seedFollow(1, id); // viewer follows id
      seedFollow(2, id); // profile follows id
    }
  }

  it("drops blocked accounts (rule 1)", async () => {
    seedThreeMutuals();
    state.hiddenByViewer.set(1, [21]);

    const { res, body } = await getJson("/social/players/2/mutual-following?viewerId=1");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [20, 22]);
  });

  it("drops hidden-visibility accounts (rule 2)", async () => {
    seedThreeMutuals();
    state.players.find(p => p.id === 22)!.locationVisibility = "hidden";

    const { res, body } = await getJson("/social/players/2/mutual-following?viewerId=1");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [20, 21]);
  });

  it("drops minor accounts (rule 3)", async () => {
    seedThreeMutuals();
    state.players.find(p => p.id === 20)!.isMinor = true;

    const { res, body } = await getJson("/social/players/2/mutual-following?viewerId=1");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [21, 22]);
  });
});

// ── followers ──────────────────────────────────────────────────────────────

describe("GET /social/players/:id/followers — 3-rule filter", () => {
  function seedThreeFollowers() {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 9, clerkId: "u_target", username: "target" });
    for (const id of [30, 31, 32]) {
      seedPlayer({ id, clerkId: `u_${id}`, username: `f${id}` });
      seedFollow(id, 9);
    }
  }

  it("drops blocked accounts (rule 1)", async () => {
    seedThreeFollowers();
    state.hiddenByViewer.set(1, [31]);

    const { res, body } = await getJson("/social/players/9/followers");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [30, 32]);
  });

  it("drops hidden-visibility accounts (rule 2)", async () => {
    seedThreeFollowers();
    state.players.find(p => p.id === 32)!.locationVisibility = "hidden";

    const { res, body } = await getJson("/social/players/9/followers");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [30, 31]);
  });

  it("drops minor accounts (rule 3)", async () => {
    seedThreeFollowers();
    state.players.find(p => p.id === 30)!.isMinor = true;

    const { res, body } = await getJson("/social/players/9/followers");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [31, 32]);
  });
});

// ── following ──────────────────────────────────────────────────────────────

describe("GET /social/players/:id/following — 3-rule filter", () => {
  function seedThreeFollowees() {
    seedPlayer({ id: 1, clerkId: "u_viewer", username: "viewer" });
    seedPlayer({ id: 7, clerkId: "u_source", username: "source" });
    for (const id of [40, 41, 42]) {
      seedPlayer({ id, clerkId: `u_${id}`, username: `g${id}` });
      seedFollow(7, id);
    }
  }

  it("drops blocked accounts (rule 1)", async () => {
    seedThreeFollowees();
    state.hiddenByViewer.set(1, [42]);

    const { res, body } = await getJson("/social/players/7/following");
    assert.equal(res.status, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [40, 41]);
  });

  it("drops hidden-visibility accounts (rule 2)", async () => {
    seedThreeFollowees();
    state.players.find(p => p.id === 40)!.locationVisibility = "hidden";

    const { res, body } = await getJson("/social/players/7/following");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [41, 42]);
  });

  it("drops minor accounts (rule 3)", async () => {
    seedThreeFollowees();
    state.players.find(p => p.id === 41)!.isMinor = true;

    const { res, body } = await getJson("/social/players/7/following");
    assert.equal(body.total, 2);
    assert.deepEqual(body.players.map((p: any) => p.id).sort(), [40, 42]);
  });
});
