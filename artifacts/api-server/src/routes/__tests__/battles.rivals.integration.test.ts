// Integration tests for the rivals endpoints in `routes/battles.ts`.
//
// `battles.contract.integration.test.ts` already covers the basic shape of
// `GET /battles/rivals` (bot filter, 2-battle floor, Zod contract). This
// file locks in the *computed* fields that power the head-to-head UI on the
// Compete page so a regression in streak math, ELO sign handling, or sort
// order would fail loudly:
//
//   - GET /battles/rivals:
//       * W/L/D tallies across mixed outcomes
//       * `lastEloChange` is the viewer's signed delta from the most-recent
//         battle (flipped when the viewer was player2)
//       * `streakType` / `streakCount` reflect the leading run of identical
//         outcomes from the most-recent battle backwards
//       * Sort order: totalBattles desc, then lastBattleAt desc tiebreak
//       * `limit` query param caps the result set
//
//   - GET /battles/rivals/:opponentId:
//       * 400 for malformed opponentId / self-opponent
//       * 404 when the opponent doesn't exist
//       * Empty battle log when the opponent exists but never fought us
//       * W/L/D + `viewerEloDelta` with the player1/player2 sign flip
//       * `battles` log reverse-chronological with viewer-perspective
//         hatchling names, outcome, and signed `eloChange`
//
// Auth is mocked at the middleware boundary (header-driven impersonation)
// so the real `battles` router runs against the shared Postgres pool.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

// ── Auth mock: header-driven impersonation ───────────────────────────────────
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: null }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    attachPlayer: (req: Request, res: Response, next: NextFunction) => {
      const raw = req.header("x-test-player-id");
      const id = raw ? Number(raw) : NaN;
      if (!raw || Number.isNaN(id)) {
        res.status(401).json({ error: "Missing x-test-player-id" });
        return;
      }
      req.playerId = id;
      next();
    },
  },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: Request, _res: Response, next: NextFunction) => next(),
    enforceBattleDailyCap: (_req: Request, _res: Response, next: NextFunction) => next(),
    checkAndConsumeBattleCap: async () => ({ ok: true }),
  },
});

const { db } = await import("@workspace/db");
const {
  playersTable,
  hatchlingsTable,
  battlesTable,
} = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const battlesRouter = (await import("../battles.ts")).default;

// ── Test data tagging ────────────────────────────────────────────────────────
const TAG = `battles-rivals-${process.pid}-${Date.now()}`;

const createdPlayerIds: number[] = [];
const createdHatchlingIds: number[] = [];
const createdBattleIds: number[] = [];

async function seedPlayer(suffix: string, extras: { battleElo?: number } = {}): Promise<number> {
  const [row] = await db.insert(playersTable).values({
    clerkId: `clerk_${TAG}_${suffix}`,
    username: `${TAG}_${suffix}`,
    displayName: `Test ${suffix}`,
    ...(extras.battleElo !== undefined ? { battleElo: extras.battleElo } : {}),
  }).returning();
  createdPlayerIds.push(row!.id);
  return row!.id;
}

async function seedHatchling(playerId: number, name: string): Promise<number> {
  const [row] = await db.insert(hatchlingsTable).values({
    playerId,
    name,
    species: "TestSpecies",
  }).returning();
  createdHatchlingIds.push(row!.id);
  return row!.id;
}

interface SeedBattleOpts {
  winnerId?: number | null;
  mode?: "casual" | "ranked";
  eloChange?: number;     // stored from player1's perspective
  xpAwarded?: number;
  coinsAwarded?: number;
  createdAt?: Date;       // explicit timestamp for ordering/streak tests
}

async function seedBattle(
  p1: number,
  p2: number | null,
  h1: number,
  h2: number | null,
  opts: SeedBattleOpts = {},
): Promise<number> {
  const values: Record<string, unknown> = {
    player1Id: p1,
    player2Id: p2,
    hatchling1Id: h1,
    hatchling2Id: h2,
    winnerId: opts.winnerId ?? null,
    battleMode: opts.mode ?? "casual",
    eloChange: opts.eloChange ?? 0,
    xpAwarded: opts.xpAwarded ?? 0,
    coinsAwarded: opts.coinsAwarded ?? 0,
  };
  if (opts.createdAt) values.createdAt = opts.createdAt;
  const [row] = await db.insert(battlesTable).values(values as never).returning();
  createdBattleIds.push(row!.id);
  return row!.id;
}

async function cleanup() {
  if (createdBattleIds.length > 0) {
    await db.delete(battlesTable).where(inArray(battlesTable.id, createdBattleIds));
  }
  if (createdHatchlingIds.length > 0) {
    await db.delete(hatchlingsTable).where(inArray(hatchlingsTable.id, createdHatchlingIds));
  }
  if (createdPlayerIds.length > 0) {
    await db.delete(playersTable).where(inArray(playersTable.id, createdPlayerIds));
  }
  createdBattleIds.length = 0;
  createdHatchlingIds.length = 0;
  createdPlayerIds.length = 0;
}

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request).log = {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
    } as never;
    next();
  });
  app.use(battlesRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await cleanup();
  await closeServer();
});

beforeEach(async () => {
  await cleanup();
});

// ── HTTP helper ──────────────────────────────────────────────────────────────
interface JsonResp<T = unknown> { status: number; body: T }

async function asPlayer<T = unknown>(playerId: number, method: string, path: string, body?: unknown): Promise<JsonResp<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-player-id": String(playerId),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed as T };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const T0 = new Date("2026-01-01T00:00:00.000Z").getTime();
/** Returns a date `i` minutes after the fixture epoch — bigger `i` is more recent. */
const at = (i: number) => new Date(T0 + i * 60_000);

// Shape returned by GET /battles/rivals (mirrors ListBattleRivalsResponseItem).
interface RivalRow {
  opponentId: number;
  opponentUsername: string | null;
  opponentDisplayName: string | null;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  lastBattleAt: string;
  lastBattleId: number;
  lastEloChange: number;
  streakType: "W" | "L" | "D";
  streakCount: number;
}

interface RivalDetailBattle {
  id: number;
  createdAt: string;
  battleMode: string;
  outcome: "win" | "loss" | "draw";
  viewerWon: boolean;
  myHatchlingId: number | null;
  myHatchlingName: string | null;
  opponentHatchlingId: number | null;
  opponentHatchlingName: string | null;
  eloChange: number;
  xpAwarded: number;
  coinsAwarded: number;
}

interface RivalDetail {
  opponentId: number;
  opponentUsername: string | null;
  opponentDisplayName: string | null;
  opponentBattleElo: number;
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  viewerEloDelta: number;
  lastBattleId: number | null;
  lastBattleAt: string | null;
  battles: RivalDetailBattle[];
}

// ── Tests: GET /battles/rivals ───────────────────────────────────────────────
describe("GET /battles/rivals — aggregate fields", () => {
  it("computes W/L/D, lastEloChange (viewer-signed), and the leading streak", async () => {
    const viewer = await seedPlayer("agg_viewer");
    const opp = await seedPlayer("agg_opp");
    const hV = await seedHatchling(viewer, "Sparky");
    const hO = await seedHatchling(opp, "Blaze");

    // Chronological: L (viewer was p2, p1 won, eloChange=+8 → viewer sees -8)
    //                W (viewer p1, viewer won, eloChange=+10 → viewer +10)
    //                D (viewer p1, no winner, eloChange=0)
    //                W (viewer p2, viewer won, eloChange=-7 → viewer +7)
    //                W (viewer p1, viewer won, eloChange=+11 → viewer +11) ← most recent
    await seedBattle(opp, viewer, hO, hV, { winnerId: opp,    eloChange:  8, createdAt: at(1) });
    await seedBattle(viewer, opp, hV, hO, { winnerId: viewer, eloChange: 10, createdAt: at(2) });
    await seedBattle(viewer, opp, hV, hO, { winnerId: null,   eloChange:  0, createdAt: at(3) });
    await seedBattle(opp, viewer, hO, hV, { winnerId: viewer, eloChange: -7, createdAt: at(4) });
    const mostRecentId = await seedBattle(viewer, opp, hV, hO, {
      winnerId: viewer, eloChange: 11, createdAt: at(5),
    });

    const res = await asPlayer<RivalRow[]>(viewer, "GET", "/battles/rivals");
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    const r = res.body[0]!;

    assert.equal(r.opponentId, opp);
    assert.equal(r.totalBattles, 5);
    assert.equal(r.wins, 3);
    assert.equal(r.losses, 1);
    assert.equal(r.draws, 1);

    // lastBattle* mirror the most-recent (chronological) battle.
    assert.equal(r.lastBattleId, mostRecentId);
    assert.equal(r.lastBattleAt, at(5).toISOString());
    assert.equal(r.lastEloChange, 11, "viewer was p1 on most recent battle → no sign flip");

    // Streak: most-recent two are W,W (then D breaks it) → streakType=W, count=2.
    assert.equal(r.streakType, "W");
    assert.equal(r.streakCount, 2);
  });

  it("flips lastEloChange when the viewer was player2 on the most-recent battle", async () => {
    const viewer = await seedPlayer("sign_viewer");
    const opp = await seedPlayer("sign_opp");
    const hV = await seedHatchling(viewer, "S");
    const hO = await seedHatchling(opp, "B");

    // Two battles so opp qualifies as a rival. Most recent: viewer is p2,
    // opp won, eloChange stored from p1's perspective = +9 →
    // viewer sees -9.
    await seedBattle(viewer, opp, hV, hO, { winnerId: viewer, eloChange:  5, createdAt: at(1) });
    await seedBattle(opp, viewer, hO, hV, { winnerId: opp,    eloChange:  9, createdAt: at(2) });

    const res = await asPlayer<RivalRow[]>(viewer, "GET", "/battles/rivals");
    assert.equal(res.status, 200);
    const r = res.body[0]!;
    assert.equal(r.opponentId, opp);
    assert.equal(r.lastEloChange, -9);
    assert.equal(r.streakType, "L");
    assert.equal(r.streakCount, 1);
  });

  it("treats draws (winnerId=null) as their own streak type", async () => {
    const viewer = await seedPlayer("draw_v");
    const opp = await seedPlayer("draw_o");
    const hV = await seedHatchling(viewer, "S");
    const hO = await seedHatchling(opp, "B");

    await seedBattle(viewer, opp, hV, hO, { winnerId: viewer, eloChange: 6, createdAt: at(1) });
    await seedBattle(viewer, opp, hV, hO, { winnerId: null,   eloChange: 0, createdAt: at(2) });
    await seedBattle(viewer, opp, hV, hO, { winnerId: null,   eloChange: 0, createdAt: at(3) });

    const res = await asPlayer<RivalRow[]>(viewer, "GET", "/battles/rivals");
    const r = res.body[0]!;
    assert.equal(r.draws, 2);
    assert.equal(r.wins, 1);
    assert.equal(r.streakType, "D");
    assert.equal(r.streakCount, 2);
  });

  it("orders rivals by totalBattles desc, then by most-recent battle desc as tiebreak, and respects the limit param", async () => {
    const viewer = await seedPlayer("ord_v");
    const oppMost = await seedPlayer("ord_most");       // 3 battles
    const oppTieA = await seedPlayer("ord_tieA");       // 2 battles, slightly older most-recent
    const oppTieB = await seedPlayer("ord_tieB");       // 2 battles, newest most-recent
    const oppNone = await seedPlayer("ord_none");       // 1 battle → excluded

    const hV = await seedHatchling(viewer, "S");
    const hM = await seedHatchling(oppMost, "M");
    const hA = await seedHatchling(oppTieA, "A");
    const hB = await seedHatchling(oppTieB, "B");
    const hN = await seedHatchling(oppNone, "N");

    // oppMost: 3 battles
    await seedBattle(viewer, oppMost, hV, hM, { winnerId: viewer, eloChange: 5, createdAt: at(1) });
    await seedBattle(viewer, oppMost, hV, hM, { winnerId: viewer, eloChange: 5, createdAt: at(2) });
    await seedBattle(viewer, oppMost, hV, hM, { winnerId: viewer, eloChange: 5, createdAt: at(3) });

    // oppTieA: 2 battles, latest at t=10
    await seedBattle(viewer, oppTieA, hV, hA, { winnerId: viewer, eloChange: 4, createdAt: at(8)  });
    await seedBattle(viewer, oppTieA, hV, hA, { winnerId: viewer, eloChange: 4, createdAt: at(10) });

    // oppTieB: 2 battles, latest at t=20 (more recent than oppTieA → ranks ahead)
    await seedBattle(viewer, oppTieB, hV, hB, { winnerId: viewer, eloChange: 4, createdAt: at(15) });
    await seedBattle(viewer, oppTieB, hV, hB, { winnerId: viewer, eloChange: 4, createdAt: at(20) });

    // oppNone: 1 battle → must NOT appear (< 2 floor)
    await seedBattle(viewer, oppNone, hV, hN, { winnerId: viewer, eloChange: 4, createdAt: at(25) });

    const res = await asPlayer<RivalRow[]>(viewer, "GET", "/battles/rivals");
    assert.equal(res.status, 200);
    const ids = res.body.map(r => r.opponentId);
    assert.deepEqual(ids, [oppMost, oppTieB, oppTieA],
      "totalBattles desc first (oppMost=3), then most-recent-battle desc (oppTieB ahead of oppTieA)");
    assert.ok(!ids.includes(oppNone), "one-shot opponent excluded");

    // limit clamps the result set.
    const limited = await asPlayer<RivalRow[]>(viewer, "GET", "/battles/rivals?limit=2");
    assert.equal(limited.status, 200);
    assert.equal(limited.body.length, 2);
    assert.deepEqual(limited.body.map(r => r.opponentId), [oppMost, oppTieB]);
  });
});

// ── Tests: GET /battles/rivals/:opponentId ───────────────────────────────────
describe("GET /battles/rivals/:opponentId — head-to-head detail", () => {
  it("400s for non-numeric / non-positive / self opponentId", async () => {
    const me = await seedPlayer("self_v");

    const nan = await asPlayer(me, "GET", "/battles/rivals/not-a-number");
    assert.equal(nan.status, 400);

    const zero = await asPlayer(me, "GET", "/battles/rivals/0");
    assert.equal(zero.status, 400);

    const self = await asPlayer(me, "GET", `/battles/rivals/${me}`);
    assert.equal(self.status, 400);
  });

  it("404s when the opponent player doesn't exist", async () => {
    const me = await seedPlayer("v404");
    // Pick an id we know wasn't created.
    const res = await asPlayer(me, "GET", "/battles/rivals/2147483640");
    assert.equal(res.status, 404);
  });

  it("returns zeroed totals and empty log when the opponent exists but never fought us", async () => {
    const me = await seedPlayer("nofight_v");
    const opp = await seedPlayer("nofight_o", { battleElo: 1234 });

    const res = await asPlayer<RivalDetail>(me, "GET", `/battles/rivals/${opp}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.opponentId, opp);
    assert.equal(res.body.opponentBattleElo, 1234);
    assert.equal(res.body.totalBattles, 0);
    assert.equal(res.body.wins, 0);
    assert.equal(res.body.losses, 0);
    assert.equal(res.body.draws, 0);
    assert.equal(res.body.viewerEloDelta, 0);
    assert.equal(res.body.lastBattleId, null);
    assert.equal(res.body.lastBattleAt, null);
    assert.deepEqual(res.body.battles, []);
  });

  it("computes W/L/D and viewerEloDelta with the player1/player2 sign flip and returns a reverse-chronological log", async () => {
    const me = await seedPlayer("h2h_v");
    const opp = await seedPlayer("h2h_o", { battleElo: 1500 });
    const stranger = await seedPlayer("h2h_stranger");

    const hMe = await seedHatchling(me, "Sparky");
    const hOpp = await seedHatchling(opp, "Blaze");
    const hStranger = await seedHatchling(stranger, "Ghost");

    // Battles between me and opp:
    //   t=1: me p1, me won,  eloChange=+10 (viewer sees +10)
    //   t=2: me p2, opp won, eloChange=+8  (viewer sees -8)
    //   t=3: me p1, draw,    eloChange=0   (viewer sees 0)
    //   t=4: me p2, me won,  eloChange=-7  (viewer sees +7) ← most recent
    const b1 = await seedBattle(me,  opp, hMe,  hOpp, {
      winnerId: me,  eloChange: 10, mode: "casual", xpAwarded: 50, coinsAwarded: 5, createdAt: at(1),
    });
    const b2 = await seedBattle(opp, me,  hOpp, hMe,  {
      winnerId: opp, eloChange:  8, mode: "ranked", createdAt: at(2),
    });
    const b3 = await seedBattle(me,  opp, hMe,  hOpp, {
      winnerId: null, eloChange: 0, createdAt: at(3),
    });
    const b4 = await seedBattle(opp, me,  hOpp, hMe,  {
      winnerId: me,  eloChange: -7, mode: "ranked", createdAt: at(4),
    });

    // Noise: a battle between me and an unrelated player should NOT influence
    // the head-to-head log against `opp`.
    await seedBattle(me, stranger, hMe, hStranger, { winnerId: me, eloChange: 99, createdAt: at(5) });

    const res = await asPlayer<RivalDetail>(me, "GET", `/battles/rivals/${opp}`);
    assert.equal(res.status, 200);

    assert.equal(res.body.opponentId, opp);
    assert.equal(res.body.opponentBattleElo, 1500);
    assert.equal(res.body.totalBattles, 4);
    assert.equal(res.body.wins, 2);
    assert.equal(res.body.losses, 1);
    assert.equal(res.body.draws, 1);
    // viewerEloDelta = +10 + -8 + 0 + +7 = +9
    assert.equal(res.body.viewerEloDelta, 9);

    assert.equal(res.body.lastBattleId, b4);
    assert.equal(res.body.lastBattleAt, at(4).toISOString());

    // Reverse chronological: b4, b3, b2, b1.
    assert.deepEqual(res.body.battles.map(b => b.id), [b4, b3, b2, b1]);

    const byId = new Map(res.body.battles.map(b => [b.id, b]));

    const e1 = byId.get(b1)!;
    assert.equal(e1.outcome, "win");
    assert.equal(e1.viewerWon, true);
    assert.equal(e1.eloChange, 10, "viewer was p1 → no sign flip");
    assert.equal(e1.myHatchlingId, hMe);
    assert.equal(e1.myHatchlingName, "Sparky");
    assert.equal(e1.opponentHatchlingId, hOpp);
    assert.equal(e1.opponentHatchlingName, "Blaze");
    assert.equal(e1.xpAwarded, 50);
    assert.equal(e1.coinsAwarded, 5);
    assert.equal(e1.battleMode, "casual");

    const e2 = byId.get(b2)!;
    assert.equal(e2.outcome, "loss");
    assert.equal(e2.viewerWon, false);
    assert.equal(e2.eloChange, -8, "viewer was p2 → eloChange sign is flipped");
    assert.equal(e2.myHatchlingId, hMe,    "myHatchling tracks the viewer's side, not p1");
    assert.equal(e2.opponentHatchlingId, hOpp);
    assert.equal(e2.battleMode, "ranked");

    const e3 = byId.get(b3)!;
    assert.equal(e3.outcome, "draw");
    assert.equal(e3.viewerWon, false);
    assert.equal(e3.eloChange, 0);

    const e4 = byId.get(b4)!;
    assert.equal(e4.outcome, "win");
    assert.equal(e4.viewerWon, true);
    assert.equal(e4.eloChange, 7, "viewer was p2 → +(-(-7)) = +7");
    assert.equal(e4.myHatchlingId, hMe);
    assert.equal(e4.opponentHatchlingId, hOpp);
  });
});
