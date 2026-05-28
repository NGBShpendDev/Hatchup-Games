// Contract tests for the /battles/* and /leaderboards/battle-elo REST
// endpoints in `routes/battles.ts`.
//
// Each route is exercised against a real Express server, and every JSON
// response body is parsed with the generated Zod schema from
// `@workspace/api-zod`. If the OpenAPI spec and the actual handler ever
// drift, the matching `.parse()` here will throw and fail the test.
//
// We mock Clerk, the auth middlewares, the subscription guards, the
// matchmaking queue (so we don't pull in the WebSocket server), and
// `@workspace/db` (so reads/writes hit in-memory state).

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

interface BattleRow {
  id: number;
  player1Id: number;
  player2Id: number | null;
  winnerId: number | null;
  hatchling1Id: number;
  hatchling2Id: number | null;
  turnsJson: unknown;
  xpAwarded: number;
  coinsAwarded: number;
  battleMode: string;
  eloChange: number;
  createdAt: Date;
}

interface PlayerRow {
  id: number;
  username: string | null;
  displayName: string | null;
  battleElo: number;
  totalBattleWins: number;
  level: number;
}

interface HatchlingRow {
  id: number;
  playerId: number;
  name: string;
}

interface InviteRow {
  id: string;
  fromPlayerId: number;
  toPlayerId: number;
  mode: "casual" | "ranked";
  fromHatchlingId: number;
  fromHatchlingName: string;
  fromBattleId: number;
  status: "pending" | "accepted" | "declined" | "consumed" | "expired";
  createdAt: number;
  expiresAt: number;
}

interface NotificationInsert {
  playerId: number;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  sourceId?: number | null;
}

const state = {
  authPlayerId: 1 as number | null,
  players: new Map<number, PlayerRow>(),
  hatchlings: new Map<number, HatchlingRow>(),
  battles: [] as BattleRow[],
  invites: new Map<string, InviteRow>(),
  notifications: [] as NotificationInsert[],
};

function resetState() {
  state.authPlayerId = 1;
  state.players = new Map();
  state.hatchlings = new Map();
  state.battles = [];
  state.invites = new Map();
  state.notifications = [];
}

// ── Mocks ────────────────────────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authPlayerId !== null ? `clerk_${state.authPlayerId}` : null }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

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
    enforceBattleDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../services/matchmakingQueue.ts", {
  namedExports: {
    issueWsToken: (_playerId: number) => "test-token-abc",
    async createRematchInvite(input: {
      fromPlayerId: number;
      toPlayerId: number;
      mode: "casual" | "ranked";
      fromHatchlingId: number;
      fromHatchlingName: string;
      fromBattleId: number;
    }) {
      const now = Date.now();
      const row: InviteRow = {
        id: `inv-${state.invites.size + 1}`,
        ...input,
        status: "pending",
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000,
      };
      state.invites.set(row.id, row);
      return { ...row };
    },
    async getRematchInvite(id: string) {
      const row = state.invites.get(id);
      return row ? { ...row } : null;
    },
    async listPendingRematchInvitesFor(playerId: number) {
      return [...state.invites.values()]
        .filter((i) => i.status === "pending" && (i.fromPlayerId === playerId || i.toPlayerId === playerId))
        .map((i) => ({ ...i }));
    },
    async setRematchInviteStatus(id: string, status: InviteRow["status"]) {
      const row = state.invites.get(id);
      if (!row) return null;
      row.status = status;
      return { ...row };
    },
  },
});

// drizzle-orm operators are used as opaque markers — the fake db below
// never inspects them.
mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
    desc: () => ({}),
    or: () => ({}),
    and: () => ({}),
    inArray: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

// Tiny callback-style query interface that mirrors what the routes use:
//   db.query.foo.findMany({ where: (t, { inArray }) => ... })
// We don't actually evaluate the where clause — we just return the full
// in-memory collection and trust the route's own logic to filter as needed.
const drizzleHelpers = {
  inArray: () => ({}),
  eq: (_c: unknown, v: unknown) => ({ __op: "eq", val: v }),
};

const fakeDb = {
  query: {
    battlesTable: {
      findFirst: async (opts?: { where?: { val?: unknown } }) => {
        const id = opts?.where?.val as number | undefined;
        return id !== undefined ? state.battles.find((b) => b.id === id) : state.battles[0];
      },
      findMany: async (opts?: { where?: unknown | ((t: unknown, h: typeof drizzleHelpers) => unknown); limit?: number }) => {
        if (typeof opts?.where === "function") opts.where({}, drizzleHelpers);
        const rows = state.battles;
        return opts?.limit ? rows.slice(0, opts.limit) : rows;
      },
    },
    playersTable: {
      findFirst: async (opts?: { where?: { val?: unknown } }) => {
        const id = opts?.where?.val as number | undefined;
        return id !== undefined ? state.players.get(id) : undefined;
      },
      findMany: async (opts?: { where?: unknown | ((t: unknown, h: typeof drizzleHelpers) => unknown); orderBy?: unknown; limit?: number }) => {
        if (typeof opts?.where === "function") opts.where({}, drizzleHelpers);
        const rows = [...state.players.values()];
        return opts?.limit ? rows.slice(0, opts.limit) : rows;
      },
    },
    hatchlingsTable: {
      findFirst: async (opts?: { where?: { val?: unknown } }) => {
        const id = opts?.where?.val as number | undefined;
        return id !== undefined ? state.hatchlings.get(id) : undefined;
      },
      findMany: async (opts?: { where?: unknown | ((t: unknown, h: typeof drizzleHelpers) => unknown) }) => {
        if (typeof opts?.where === "function") opts.where({}, drizzleHelpers);
        return [...state.hatchlings.values()];
      },
    },
  },
  insert: (_table: unknown) => ({
    values: async (row: NotificationInsert) => {
      state.notifications.push(row);
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    battlesTable: { player1Id: { __c: "p1" }, player2Id: { __c: "p2" }, createdAt: { __c: "createdAt" } },
    hatchlingsTable: { id: { __c: "id" } },
    notificationsTable: { __t: "notifications" },
    playersTable: { id: { __c: "id" }, battleElo: { __c: "battleElo" } },
  },
});

// ── Imports that depend on the mocks above ──────────────────────────────────
const express = (await import("express")).default;
const battlesRouter = (await import("../battles.ts")).default;
const {
  JoinBattleQueueResponse,
  IssueBattleWsTokenResponse,
  LeaveBattleQueueResponse,
  ListBattleHistoryResponse,
  ListBattleRivalsResponse,
  GetBattleRivalDetailResponse,
  GetBattleResponse,
  GetBattleRematchResponse,
  ListPendingBattleRematchesResponse,
  AcceptBattleRematchResponse,
  DeclineBattleRematchResponse,
  GetBattleEloLeaderboardResponse,
} = await import("@workspace/api-zod");

// ── Server setup ────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(battlesRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

// ── Fixtures ────────────────────────────────────────────────────────────────
const VIEWER_ID = 1;
const OPPONENT_ID = 2;
const STRANGER_ID = 3;

function seedPlayers() {
  state.players.set(VIEWER_ID, {
    id: VIEWER_ID, username: "viewer", displayName: "Viewer",
    battleElo: 1200, totalBattleWins: 5, level: 15,
  });
  state.players.set(OPPONENT_ID, {
    id: OPPONENT_ID, username: "opp", displayName: "Opponent",
    battleElo: 1150, totalBattleWins: 3, level: 12,
  });
  state.players.set(STRANGER_ID, {
    id: STRANGER_ID, username: null, displayName: null,
    battleElo: 1000, totalBattleWins: 0, level: 1,
  });
}

function seedHatchlings() {
  state.hatchlings.set(10, { id: 10, playerId: VIEWER_ID, name: "Sparky" });
  state.hatchlings.set(20, { id: 20, playerId: OPPONENT_ID, name: "Bolt" });
}

function makeBattle(overrides: Partial<BattleRow> = {}): BattleRow {
  return {
    id: 100,
    player1Id: VIEWER_ID,
    player2Id: OPPONENT_ID,
    winnerId: VIEWER_ID,
    hatchling1Id: 10,
    hatchling2Id: 20,
    turnsJson: [{ turn: 1 }],
    xpAwarded: 50,
    coinsAwarded: 10,
    battleMode: "casual",
    eloChange: 12,
    createdAt: new Date("2026-05-28T12:00:00.000Z"),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe("battles REST contract", () => {
  it("POST /battles/queue/join validates against JoinBattleQueueResponse", async () => {
    seedPlayers();
    seedHatchlings();
    const res = await fetch(`${baseUrl}/battles/queue/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hatchlingId: 10, mode: "casual" }),
    });
    assert.equal(res.status, 200);
    JoinBattleQueueResponse.parse(await res.json());
  });

  it("POST /battles/ws-token validates against IssueBattleWsTokenResponse", async () => {
    const res = await fetch(`${baseUrl}/battles/ws-token`, { method: "POST" });
    assert.equal(res.status, 200);
    IssueBattleWsTokenResponse.parse(await res.json());
  });

  it("DELETE /battles/queue/leave validates against LeaveBattleQueueResponse", async () => {
    const res = await fetch(`${baseUrl}/battles/queue/leave`, { method: "DELETE" });
    assert.equal(res.status, 200);
    LeaveBattleQueueResponse.parse(await res.json());
  });

  it("GET /battles/history validates against ListBattleHistoryResponse", async () => {
    seedPlayers();
    seedHatchlings();
    state.battles = [
      makeBattle({ id: 100 }),
      makeBattle({ id: 101, winnerId: OPPONENT_ID, eloChange: -8 }),
      // Bot battle (player2/hatchling2 null) — schema allows nulls.
      makeBattle({ id: 102, player2Id: null, hatchling2Id: null, winnerId: 0 }),
    ];
    const res = await fetch(`${baseUrl}/battles/history?limit=10`);
    assert.equal(res.status, 200);
    const parsed = ListBattleHistoryResponse.parse(await res.json());
    assert.equal(parsed.length, 3);
  });

  it("GET /battles/rivals validates against ListBattleRivalsResponse", async () => {
    seedPlayers();
    seedHatchlings();
    // Need >=2 battles with the same human opponent to surface as a rival.
    state.battles = [
      makeBattle({ id: 200 }),
      makeBattle({ id: 201, winnerId: OPPONENT_ID, eloChange: -10 }),
      makeBattle({ id: 202 }),
    ];
    const res = await fetch(`${baseUrl}/battles/rivals`);
    assert.equal(res.status, 200);
    const parsed = ListBattleRivalsResponse.parse(await res.json());
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].opponentId, OPPONENT_ID);
  });

  it("GET /battles/rivals — empty array still parses cleanly", async () => {
    seedPlayers();
    state.battles = [];
    const res = await fetch(`${baseUrl}/battles/rivals`);
    assert.equal(res.status, 200);
    ListBattleRivalsResponse.parse(await res.json());
  });

  it("GET /battles/rivals/:opponentId matches the documented head-to-head shape", async () => {
    seedPlayers();
    seedHatchlings();
    state.battles = [
      makeBattle({ id: 300 }),
      makeBattle({ id: 301, winnerId: OPPONENT_ID, eloChange: -7 }),
      makeBattle({ id: 302, winnerId: null, eloChange: 0 }),
    ];
    const res = await fetch(`${baseUrl}/battles/rivals/${OPPONENT_ID}`);
    assert.equal(res.status, 200);
    const parsed = GetBattleRivalDetailResponse.parse(await res.json());
    assert.equal(parsed.opponentId, OPPONENT_ID);
    assert.equal(parsed.totalBattles, 3);
  });

  it("GET /battles/:id validates against GetBattleResponse", async () => {
    state.battles = [makeBattle({ id: 400 })];
    const res = await fetch(`${baseUrl}/battles/400`);
    assert.equal(res.status, 200);
    GetBattleResponse.parse(await res.json());
  });

  it("POST /battles/rematch validates against the BattleRematchInvite schema", async () => {
    seedPlayers();
    seedHatchlings();
    state.battles = [makeBattle({ id: 500 })];
    const res = await fetch(`${baseUrl}/battles/rematch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ battleId: 500, hatchlingId: 10 }),
    });
    assert.equal(res.status, 201);
    // The create response uses the same `BattleRematchInvite` component
    // shape as GET /battles/rematch/:id.
    GetBattleRematchResponse.parse(await res.json());
  });

  it("GET /battles/rematch/pending validates against ListPendingBattleRematchesResponse", async () => {
    seedPlayers();
    state.invites.set("inv-pending", {
      id: "inv-pending",
      fromPlayerId: VIEWER_ID,
      toPlayerId: OPPONENT_ID,
      mode: "casual",
      fromHatchlingId: 10,
      fromHatchlingName: "Sparky",
      fromBattleId: 500,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const res = await fetch(`${baseUrl}/battles/rematch/pending`);
    assert.equal(res.status, 200);
    const parsed = ListPendingBattleRematchesResponse.parse(await res.json());
    assert.equal(parsed.length, 1);
  });

  it("GET /battles/rematch/:id validates against GetBattleRematchResponse", async () => {
    seedPlayers();
    state.invites.set("inv-get", {
      id: "inv-get",
      fromPlayerId: VIEWER_ID,
      toPlayerId: OPPONENT_ID,
      mode: "ranked",
      fromHatchlingId: 10,
      fromHatchlingName: "Sparky",
      fromBattleId: 500,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const res = await fetch(`${baseUrl}/battles/rematch/inv-get`);
    assert.equal(res.status, 200);
    GetBattleRematchResponse.parse(await res.json());
  });

  it("POST /battles/rematch/:id/accept validates against AcceptBattleRematchResponse", async () => {
    seedPlayers();
    state.invites.set("inv-accept", {
      id: "inv-accept",
      fromPlayerId: OPPONENT_ID,
      toPlayerId: VIEWER_ID, // viewer is the recipient
      mode: "casual",
      fromHatchlingId: 20,
      fromHatchlingName: "Bolt",
      fromBattleId: 500,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const res = await fetch(`${baseUrl}/battles/rematch/inv-accept/accept`, { method: "POST" });
    assert.equal(res.status, 200);
    AcceptBattleRematchResponse.parse(await res.json());
  });

  it("POST /battles/rematch/:id/decline validates against DeclineBattleRematchResponse", async () => {
    seedPlayers();
    state.invites.set("inv-decline", {
      id: "inv-decline",
      fromPlayerId: OPPONENT_ID,
      toPlayerId: VIEWER_ID,
      mode: "casual",
      fromHatchlingId: 20,
      fromHatchlingName: "Bolt",
      fromBattleId: 500,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    const res = await fetch(`${baseUrl}/battles/rematch/inv-decline/decline`, { method: "POST" });
    assert.equal(res.status, 200);
    DeclineBattleRematchResponse.parse(await res.json());
  });

  it("GET /leaderboards/battle-elo validates against GetBattleEloLeaderboardResponse", async () => {
    seedPlayers();
    const res = await fetch(`${baseUrl}/leaderboards/battle-elo?limit=10`);
    assert.equal(res.status, 200);
    const parsed = GetBattleEloLeaderboardResponse.parse(await res.json());
    assert.ok(parsed.length >= 1);
    assert.equal(parsed[0].rank, 1);
  });
});
