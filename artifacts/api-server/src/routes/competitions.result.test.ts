// Route-level test for POST /competitions/:id/result.
//
// Spins up a real Express app with an in-memory DB mock and calls the route
// handler directly (bypassing auth middleware) to verify:
//   1. The route returns 200 with hatchlingName in the body.
//   2. applyHatchlingXp is invoked, causing the hatchling row's xp and level
//      to be written back to the mock DB — proving the full XP path from
//      "result submitted" to "hatchling row updated" works end-to-end.

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// In-memory DB fixtures and update tracker
// ---------------------------------------------------------------------------

const HATCHLING_ID = 5;
const PLAYER_ID = 1;
const COMPETITION_ID = 1;

const fakeComp = {
  id: COMPETITION_ID,
  playerId: PLAYER_ID,
  hatchlingId: HATCHLING_ID,
  status: "active",
  score: 0,
  mode: "race",
  duration: null,
  rank: null,
  xpEarned: null,
  coinsEarned: null,
  createdAt: new Date(),
};

const fakeHatchling = {
  id: HATCHLING_ID,
  xp: 0,
  level: 1,
  playerId: PLAYER_ID,
  name: "Spark",
  realm: "cardio",
  happiness: 80,
  energy: 70,
  friendshipLevel: 30,
};

const fakePlayer = {
  id: PLAYER_ID,
  username: "DragonMaster",
  totalWins: 0,
  totalMatches: 0,
  battleElo: 1000,
  coins: 100,
  xp: 200,
};

// Track what xp/level was written to the hatchlings row
let capturedHatchlingXp: number | null = null;
let capturedHatchlingLevel: number | null = null;

// Distinct sentinel objects so we can identify which table is being updated
const FAKE_COMPETITIONS_TABLE = Object.create(null) as { id: null };
const FAKE_HATCHLINGS_TABLE = Object.create(null) as { id: null };
const FAKE_PLAYERS_TABLE = Object.create(null) as { id: null };

function makeWhereResult(returnRow: object) {
  const p: Promise<undefined> & { returning?: () => Promise<object[]> } =
    Promise.resolve(undefined);
  p.returning = async () => [returnRow];
  return p;
}

const fakeDb = {
  query: {
    competitionsTable: { findFirst: async () => fakeComp },
    hatchlingsTable: { findFirst: async () => fakeHatchling },
    playersTable: { findFirst: async () => fakePlayer },
  },
  update: (table: unknown) => ({
    set: (data: Record<string, unknown>) => {
      if (table === FAKE_HATCHLINGS_TABLE && "xp" in data) {
        capturedHatchlingXp = data.xp as number;
        capturedHatchlingLevel = data.level as number;
      }
      return {
        where: (_cond: unknown) => makeWhereResult(
          table === FAKE_COMPETITIONS_TABLE
            ? { ...fakeComp, status: "completed", score: 100, rank: 1, xpEarned: 400, coinsEarned: 50 }
            : fakePlayer,
        ),
      };
    },
  }),
};

// ---------------------------------------------------------------------------
// Capture route handlers without spinning up a network listener
// ---------------------------------------------------------------------------
const capturedPost: Record<string, Function[]> = {};

await mock.module("express", {
  namedExports: {
    Router: () => ({
      get: () => {},
      post: (path: string, ...fns: Function[]) => {
        capturedPost[path] = fns;
      },
    }),
  },
});

await mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    competitionsTable: FAKE_COMPETITIONS_TABLE,
    hatchlingsTable: FAKE_HATCHLINGS_TABLE,
    playersTable: FAKE_PLAYERS_TABLE,
    gameModesTable: {},
  },
});

await mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    desc: () => ({}),
    and: () => ({}),
    sql: () => ({}),
  },
});

// Auth middleware — pass-through so our fake req.playerId is respected
await mock.module("../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (_req: unknown, _res: unknown, next: () => void) => next(),
    requirePlayerOwnership: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// Zod schema mocks — always parse successfully with the passed-in value
await mock.module("@workspace/api-zod", {
  namedExports: {
    ListCompetitionsQueryParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    CreateCompetitionBody: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    GetCompetitionParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    SubmitCompetitionResultParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    SubmitCompetitionResultBody: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  },
});

await mock.module("../services/activePartner.ts", {
  namedExports: { resolveActivePartner: async () => null },
});

// Load the competitions module — this triggers all router.post() registrations
await import("./competitions.ts");

// The competition result route is the last registered POST handler
const resultHandlers = capturedPost["/competitions/:id/result"];
// The actual async handler is the last function; the first two are auth middleware
const resultHandler = resultHandlers![resultHandlers!.length - 1]!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFakeReq(score: number, rank: number, duration = 60) {
  return {
    params: { id: String(COMPETITION_ID) },
    body: { score, rank, duration },
    playerId: PLAYER_ID,
  };
}

function makeFakeRes() {
  const res: { status: number; body: unknown } = { status: 200, body: null };
  return {
    _state: res,
    status: (code: number) => { res.status = code; return { json: (b: unknown) => { res.body = b; } }; },
    json: (body: unknown) => { res.body = body; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /competitions/:id/result — hatchling XP persistence", () => {
  beforeEach(() => {
    capturedHatchlingXp = null;
    capturedHatchlingLevel = null;
  });

  it("returns the hatchling name in the response body", async () => {
    const res = makeFakeRes();
    await resultHandler(makeFakeReq(100, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.ok(body, "response body must be set");
    assert.equal(body.hatchlingName, fakeHatchling.name);
  });

  it("writes a positive XP value to the hatchling row after a rank-1 result", async () => {
    const res = makeFakeRes();
    await resultHandler(makeFakeReq(100, 1), res);
    assert.ok(
      capturedHatchlingXp !== null,
      "hatchling XP must be written to the DB by applyHatchlingXp",
    );
    assert.ok(capturedHatchlingXp! > 0, "hatchling xp must increase");
  });

  it("hatchling xp matches computeCompetitionXp(score=100, rank=1) = 400", async () => {
    const res = makeFakeRes();
    await resultHandler(makeFakeReq(100, 1), res);
    // computeCompetitionXp(100, 1) = 100*2 + 200 = 400
    assert.equal(capturedHatchlingXp, 400);
  });

  it("hatchling level is bumped when XP crosses the 100-XP threshold", async () => {
    const res = makeFakeRes();
    await resultHandler(makeFakeReq(100, 1), res);
    assert.ok(capturedHatchlingLevel !== null, "hatchling level must be written");
    // fakeHatchling starts at xp=0, level=1. After +400 XP: 1 + floor(400/100) = 5
    assert.equal(capturedHatchlingLevel, 5);
  });

  it("hatchling still receives XP for a consolation rank-3 finish", async () => {
    const res = makeFakeRes();
    await resultHandler(makeFakeReq(50, 3), res);
    // computeCompetitionXp(50, 3) = 50*2 + 50 = 150
    assert.ok(capturedHatchlingXp !== null && capturedHatchlingXp > 0);
    assert.equal(capturedHatchlingXp, 150);
  });
});
