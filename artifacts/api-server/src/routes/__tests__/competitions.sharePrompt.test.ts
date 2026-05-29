// Integration test: POST /competitions/:id/result → hatchlingEvolutionSharePrompt flag
//
// Verifies that the competition result route correctly propagates the
// shouldTriggerSharePrompt signal (true/false/null) onto the response body
// so the client can fire the "Share milestone!" toast at the right moments.
//
// Scenarios covered:
//   A. Hatchling at level 4 receives enough XP to cross level-5 threshold → true
//   B. Hatchling at level 14 receives enough XP to cross level-15 threshold → true
//   C. Hatchling at level 1 receives small XP that stays below level 5 → false
//   D. Hatchling already at level 5 gains more levels (5→6) → false (no new crossing)
//   E. applyHatchlingXp returns null (no hatchling found) → null in response

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Mutable fixtures — adjusted per test via beforeEach/inline assignment
// ---------------------------------------------------------------------------

const PLAYER_ID = 1;
const COMPETITION_ID = 42;

const fakeComp = {
  id: COMPETITION_ID,
  playerId: PLAYER_ID,
  hatchlingId: 10,
  status: "active",
  score: 0,
  mode: "race",
  duration: null,
  rank: null,
  xpEarned: null,
  coinsEarned: null,
  createdAt: new Date(),
};

// Start at level 4, xp=300 so that +100 XP pushes to xp=400 → level 5
let fakeHatchling = {
  id: 10,
  xp: 300,
  level: 4,
  playerId: PLAYER_ID,
  name: "Blaze",
  realm: "fire",
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

// Sentinel table objects so the update() spy can identify which table is written
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
    competitionsTable: {
      findFirst: async () => fakeComp,
    },
    hatchlingsTable: {
      findFirst: async () => fakeHatchling,
    },
    playersTable: {
      findFirst: async () => fakePlayer,
    },
  },
  update: (table: unknown) => ({
    set: (data: Record<string, unknown>) => ({
      where: (_cond: unknown) =>
        makeWhereResult(
          table === FAKE_COMPETITIONS_TABLE
            ? {
                ...fakeComp,
                status: "completed",
                score: data.score ?? 0,
                rank: data.rank ?? 1,
                xpEarned: data.xpEarned ?? 0,
                coinsEarned: data.coinsEarned ?? 0,
              }
            : fakePlayer,
        ),
    }),
  }),
};

// ---------------------------------------------------------------------------
// Capture route registrations without a real HTTP server
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

await mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (_req: unknown, _res: unknown, next: () => void) => next(),
    requirePlayerOwnership: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

await mock.module("@workspace/api-zod", {
  namedExports: {
    ListCompetitionsQueryParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    CreateCompetitionBody: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    GetCompetitionParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    SubmitCompetitionResultParams: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    SubmitCompetitionResultBody: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  },
});

await mock.module("../../services/activePartner.ts", {
  namedExports: { resolveActivePartner: async () => null },
});

// Load competitions module — triggers all router.post() registrations
await import("../competitions.ts" /* resolves as the parent dir */);

const resultHandlers = capturedPost["/competitions/:id/result"];
const resultHandler = resultHandlers![resultHandlers!.length - 1]!;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(score: number, rank: number, duration = 60) {
  return {
    params: { id: String(COMPETITION_ID) },
    body: { score, rank, duration },
    playerId: PLAYER_ID,
  };
}

function makeRes() {
  const state = { status: 200, body: null as unknown };
  return {
    _state: state,
    status: (code: number) => {
      state.status = code;
      return { json: (b: unknown) => { state.body = b; } };
    },
    json: (b: unknown) => { state.body = b; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /competitions/:id/result — hatchlingEvolutionSharePrompt flag", () => {
  beforeEach(() => {
    // Reset to a neutral, below-threshold state between tests
    fakeHatchling = { id: 10, xp: 0, level: 1, playerId: PLAYER_ID, name: "Blaze", realm: "fire", happiness: 80, energy: 70, friendshipLevel: 30 };
  });

  // -------------------------------------------------------------------------
  // Scenario A — level-5 threshold crossing
  // -------------------------------------------------------------------------
  it("returns hatchlingEvolutionSharePrompt: true when the Pal crosses level 5 (level 4 → 5)", async () => {
    // Set hatchling to level 4, xp=300. Adding score=0/rank=1 → XP = 0*2+200 = 200
    // newXp = 300+200 = 500, newLevel = max(4, 1+floor(500/100)) = max(4,6) = 6 ≥ 5
    // prevLevel(4) < 5 ≤ newLevel(6) → share prompt
    fakeHatchling = { ...fakeHatchling, xp: 300, level: 4 };
    const res = makeRes();
    await resultHandler(makeReq(0, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.ok(body, "response body must be set");
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      true,
      `Expected true when crossing level 5, got ${body.hatchlingEvolutionSharePrompt}`,
    );
  });

  it("returns hatchlingEvolutionSharePrompt: true when Pal crosses level 5 with exact XP (level 4, xp=300 + 100 → level 5)", async () => {
    // score=25, rank=3 → XP = 25*2+50 = 100; newXp=400, newLevel=max(4,5)=5
    // prevLevel(4) < 5 ≤ newLevel(5) → true
    fakeHatchling = { ...fakeHatchling, xp: 300, level: 4 };
    const res = makeRes();
    await resultHandler(makeReq(25, 3), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      true,
      "Exact threshold crossing at level 5 should return true",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario B — level-15 threshold crossing
  // -------------------------------------------------------------------------
  it("returns hatchlingEvolutionSharePrompt: true when the Pal crosses level 15 (level 14 → 15)", async () => {
    // xp=1300, level=14. score=25/rank=3 → XP=100; newXp=1400, newLevel=max(14,15)=15
    // prevLevel(14) < 15 ≤ newLevel(15) → true
    fakeHatchling = { ...fakeHatchling, xp: 1300, level: 14 };
    const res = makeRes();
    await resultHandler(makeReq(25, 3), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      true,
      "Crossing level 15 should return true",
    );
  });

  it("returns hatchlingEvolutionSharePrompt: true when Pal jumps over level 15 (level 12 → 16)", async () => {
    // xp=1100, level=12. score=100/rank=1 → XP=400; newXp=1500, newLevel=max(12,16)=16
    // prevLevel(12) < 15 ≤ newLevel(16) → true
    fakeHatchling = { ...fakeHatchling, xp: 1100, level: 12 };
    const res = makeRes();
    await resultHandler(makeReq(100, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      true,
      "Jumping over level-15 threshold should still return true",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario C — no threshold crossed (stays below level 5)
  // -------------------------------------------------------------------------
  it("returns hatchlingEvolutionSharePrompt: false when Pal stays below level 5", async () => {
    // xp=0, level=1. score=1/rank=3 → XP = 2+50 = 52; newXp=52, newLevel=1 (below 5)
    fakeHatchling = { ...fakeHatchling, xp: 0, level: 1 };
    const res = makeRes();
    await resultHandler(makeReq(1, 3), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      false,
      "No threshold crossed below level 5 should return false",
    );
  });

  it("returns hatchlingEvolutionSharePrompt: false when Pal stays between thresholds (level 6 → 9)", async () => {
    // xp=500, level=6. score=100/rank=2 → XP = 200+100 = 300; newXp=800, newLevel=max(6,9)=9
    // 5 < prevLevel(6) so no level-5 crossing; 9 < 15 so no level-15 crossing
    fakeHatchling = { ...fakeHatchling, xp: 500, level: 6 };
    const res = makeRes();
    await resultHandler(makeReq(100, 2), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      false,
      "Level jump between thresholds (6→9) should return false",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario D — already past threshold, no new crossing
  // -------------------------------------------------------------------------
  it("returns hatchlingEvolutionSharePrompt: false when Pal is already at level 5 and gains more levels (5 → 6)", async () => {
    // xp=400, level=5. score=25/rank=3 → XP=100; newXp=500, newLevel=max(5,6)=6
    // prevLevel(5) ≥ 5, so no crossing of level-5; 6 < 15, so no crossing of level-15
    fakeHatchling = { ...fakeHatchling, xp: 400, level: 5 };
    const res = makeRes();
    await resultHandler(makeReq(25, 3), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      false,
      "Already at level 5 going to level 6 — no new threshold crossing",
    );
  });

  it("returns hatchlingEvolutionSharePrompt: false when Pal is already at level 15", async () => {
    // xp=1400, level=15. score=100/rank=1 → XP=400; newXp=1800, newLevel=max(15,19)=19
    // prevLevel(15) ≥ 15, so level-15 already crossed in the past
    fakeHatchling = { ...fakeHatchling, xp: 1400, level: 15 };
    const res = makeRes();
    await resultHandler(makeReq(100, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      false,
      "Already at level 15 — no new threshold crossing",
    );
  });

  // -------------------------------------------------------------------------
  // Scenario E — applyHatchlingXp returns null (hatchling not found)
  // -------------------------------------------------------------------------
  it("returns hatchlingEvolutionSharePrompt: null when hatchling is not found", async () => {
    // Force the DB to return no hatchling so applyHatchlingXp returns null
    (fakeDb.query.hatchlingsTable as Record<string, unknown>).findFirst = async () => null;
    const res = makeRes();
    await resultHandler(makeReq(100, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.strictEqual(
      body.hatchlingEvolutionSharePrompt,
      null,
      "Null hatchling should produce null share prompt flag",
    );
    // Restore to the live fakeHatchling closure so subsequent tests work correctly
    (fakeDb.query.hatchlingsTable as Record<string, unknown>).findFirst = async () => fakeHatchling;
  });

  // -------------------------------------------------------------------------
  // Shape contract — related response fields are present
  // -------------------------------------------------------------------------
  it("includes hatchlingXpDelta, hatchlingPrevLevel, hatchlingNewLevel alongside the flag", async () => {
    // xp=300, level=4 + score=0/rank=1 → XP=200 → share prompt = true, level 4→6
    fakeHatchling = { ...fakeHatchling, xp: 300, level: 4 };
    const res = makeRes();
    await resultHandler(makeReq(0, 1), res);
    const body = res._state.body as Record<string, unknown>;
    assert.ok("hatchlingXpDelta" in body, "hatchlingXpDelta must be in response");
    assert.ok("hatchlingPrevLevel" in body, "hatchlingPrevLevel must be in response");
    assert.ok("hatchlingNewLevel" in body, "hatchlingNewLevel must be in response");
    assert.ok("hatchlingNewXp" in body, "hatchlingNewXp must be in response");
    assert.strictEqual(body.hatchlingPrevLevel, 4);
    assert.strictEqual(body.hatchlingXpDelta, 200);
    assert.ok(
      (body.hatchlingNewLevel as number) >= 5,
      "newLevel must have crossed the level-5 threshold",
    );
  });
});
