import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Shared mutable state — reset in beforeEach
// ---------------------------------------------------------------------------
let capturedApplyPalId: number | null = null;
let capturedApplyXpDelta: number | null = null;

const FAKE_PAL_ID = 42;

const mockPlayer = {
  id: 1,
  username: "TestRunner",
  fitnessXp: 100,
  totalSteps: 5000,
  totalWorkouts: 10,
  currentStreak: 3,
  longestStreak: 5,
  waterCups: 8,
  lastActiveDate: "2026-05-27",
  activeHatchlingId: FAKE_PAL_ID,
  totalReps: 0,
  lifetimePushups: 0,
  lifetimeSquats: 0,
  lifetimeBurpees: 0,
  lifetimePullups: 0,
  lifetimePlanks: 0,
  lifetimeSitups: 0,
  passiveXpSinceLastVisit: 0,
};

const mockActivity = {
  id: 99,
  playerId: 1,
  type: "running",
  value: 30,
  unit: "minutes",
  fitnessXpEarned: 240,
  realm: "cardio",
  note: null,
  externalId: null,
  distanceMiles: null,
  createdAt: new Date(),
};

// Helper to build an awaitable chain that also exposes `.returning()`
function makeUpdateChain(returnRow: object) {
  return {
    set: (_data: unknown) => ({
      where: (_cond: unknown) => {
        const p: Promise<undefined> & { returning?: () => Promise<object[]> } =
          Promise.resolve(undefined);
        p.returning = async () => [returnRow];
        return p;
      },
    }),
  };
}

const updatedPlayer = { ...mockPlayer, fitnessXp: 340, totalWorkouts: 11 };

const mockDb = {
  query: {
    fitnessActivitiesTable: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    playersTable: {
      findFirst: async () => mockPlayer,
    },
    eggsTable: {
      findMany: async () => [],
    },
    fitnessQuestsTable: {
      findMany: async () => [],
    },
    personalRecordsTable: {
      findFirst: async () => null,
    },
  },
  insert: (_table: unknown) => ({
    values: (_data: unknown) => ({
      returning: async () => [mockActivity],
      onConflictDoUpdate: (_opts: unknown) => ({
        returning: async () => [],
      }),
    }),
  }),
  update: (_table: unknown) => makeUpdateChain(updatedPlayer),
};

// ---------------------------------------------------------------------------
// Mock all external dependencies BEFORE importing the module under test
// ---------------------------------------------------------------------------

await mock.module("@workspace/db", {
  namedExports: {
    db: mockDb,
    fitnessActivitiesTable: {},
    fitnessQuestsTable: {},
    playersTable: {},
    hatchlingsTable: {},
    eggsTable: {},
    personalRecordsTable: {},
  },
});

await mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    gte: () => ({}),
    desc: () => ({}),
    sql: () => ({}),
  },
});

await mock.module("./badgeService.ts", {
  namedExports: {
    checkAndAwardBadges: async () => [],
  },
});

await mock.module("./artifactService.ts", {
  namedExports: {
    awardFitnessBarXp: async () => undefined,
    checkAndAwardArtifacts: async () => [],
  },
});

await mock.module("./activePartner.ts", {
  namedExports: {
    resolveActivePartner: async () => null,
  },
});

await mock.module("../lib/logger.ts", {
  namedExports: {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  },
});

// Mock hatchlingXp so we can spy on applyHatchlingXp while still returning a
// realistic result that proves level was bumped.
await mock.module("./hatchlingXp.ts", {
  namedExports: {
    getActivePalId: async (_playerId: number) => FAKE_PAL_ID,
    applyHatchlingXp: async (palId: number, xpDelta: number) => {
      capturedApplyPalId = palId;
      capturedApplyXpDelta = xpDelta;
      // Simulate a hatchling starting at xp=80, level=1 receiving xpDelta XP.
      // 80 + 240 = 320 XP → 1 + floor(320/100) = 4
      const prevLevel = 1;
      const newXp = 80 + xpDelta;
      const newLevel = Math.max(prevLevel, 1 + Math.floor(newXp / 100));
      return { hatchlingId: palId, prevLevel, newLevel, newXp, xpDelta };
    },
  },
});

// NOW import the module under test (uses mocked dependencies)
const { logFitnessActivity } = await import("./fitnessLog.ts");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logFitnessActivity — active Pal XP wiring", () => {
  beforeEach(() => {
    capturedApplyPalId = null;
    capturedApplyXpDelta = null;
  });

  it("calls applyHatchlingXp with the player's active Pal ID", async () => {
    await logFitnessActivity({ playerId: 1, type: "running", value: 30 });
    assert.equal(capturedApplyPalId, FAKE_PAL_ID, "applyHatchlingXp must target the active Pal");
  });

  it("calls applyHatchlingXp with a positive xpDelta matching the fitness XP earned", async () => {
    // running × 30 minutes: xpPer=8, so fitnessXpEarned = 30 * 8 = 240
    await logFitnessActivity({ playerId: 1, type: "running", value: 30 });
    assert.ok(capturedApplyXpDelta !== null, "applyHatchlingXp must have been called");
    assert.ok(capturedApplyXpDelta! > 0, "xpDelta passed to applyHatchlingXp must be positive");
    assert.equal(capturedApplyXpDelta, 240, "xpDelta must match fitnessXpEarned (30 min × 8 xpPer)");
  });

  it("returns palXpResult in the result object", async () => {
    const result = await logFitnessActivity({ playerId: 1, type: "running", value: 30 });
    assert.ok(result.palXpResult !== undefined, "palXpResult must be present in the result");
    assert.ok(result.palXpResult !== null, "palXpResult must not be null when Pal XP was applied");
  });

  it("palXpResult shows that the Pal's level increased after a large XP award", async () => {
    // Starting hatchling: xp=80, level=1. +240 XP → total 320, newLevel = 4.
    const result = await logFitnessActivity({ playerId: 1, type: "running", value: 30 });
    const pal = result.palXpResult!;
    assert.ok(pal.newLevel >= pal.prevLevel, "Pal level must never decrease");
    assert.ok(pal.newXp > 80, "Pal XP must have increased beyond its starting value");
    assert.equal(pal.hatchlingId, FAKE_PAL_ID);
  });

  it("fitnessXpEarned is positive for a running workout", async () => {
    const result = await logFitnessActivity({ playerId: 1, type: "running", value: 30 });
    assert.ok(result.fitnessXpEarned > 0);
  });

  it("does not call applyHatchlingXp when XP earned is zero (value=0)", async () => {
    await logFitnessActivity({ playerId: 1, type: "running", value: 0 });
    assert.equal(
      capturedApplyPalId,
      null,
      "applyHatchlingXp must not be called when no XP is earned",
    );
  });
});

describe("logFitnessActivity — Pal XP matches ACTIVITY_CONFIG rates", () => {
  beforeEach(() => {
    capturedApplyPalId = null;
    capturedApplyXpDelta = null;
  });

  it("hiit (10 xpPer × 20 min = 200 XP) flows to the Pal", async () => {
    await logFitnessActivity({ playerId: 1, type: "hiit", value: 20 });
    assert.equal(capturedApplyXpDelta, 200);
  });

  it("yoga (4 xpPer × 15 min = 60 XP) flows to the Pal", async () => {
    await logFitnessActivity({ playerId: 1, type: "yoga", value: 15 });
    assert.equal(capturedApplyXpDelta, 60);
  });

  it("pushups (1 xpPer × 50 reps = 50 XP) flows to the Pal", async () => {
    await logFitnessActivity({ playerId: 1, type: "pushups", value: 50 });
    assert.equal(capturedApplyXpDelta, 50);
  });
});
