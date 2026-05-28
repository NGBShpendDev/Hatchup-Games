// Unit tests for the My Pal stat bump in `services/fitnessLog.ts`.
//
// When a player logs a workout or strength activity, the active partner
// hatchling's loyaltyScore and motivationScore must increase:
//   - loyaltyScore   += 2  (capped at 100)
//   - motivationScore += 8  (capped at 100)
//
// All database access and collaborating services are mocked so the tests run
// in-process without a real Postgres connection or network calls.

import { describe, it, before, mock } from "node:test";
import assert from "node:assert/strict";

// ── In-memory state ───────────────────────────────────────────────────────────

interface HatchlingRow {
  id: number;
  playerId: number;
  happiness: number;
  energy: number;
  friendshipLevel: number;
  loyaltyScore: number;
  motivationScore: number;
  moodState: string;
  lastWorkoutAt: Date | null;
}

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  fitnessXp: number;
  totalSteps: number;
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  waterCups: number;
  lastActiveDate: string | null;
  passiveXpSinceLastVisit: number;
  activeHatchlingId: number | null;
  totalReps: number;
  lifetimePushups: number;
  lifetimeSquats: number;
  lifetimeBurpees: number;
  lifetimePullups: number;
  lifetimePlanks: number;
  lifetimeSitups: number;
}

const state = {
  partner: null as HatchlingRow | null,
  player: null as PlayerRow | null,
  // Captures the patch object from the partner hatchling update call
  lastPartnerPatch: null as Record<string, unknown> | null,
};

function makePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 1,
    clerkId: "u_1",
    username: "dragonmaster",
    fitnessXp: 100,
    totalSteps: 5000,
    totalWorkouts: 10,
    currentStreak: 3,
    longestStreak: 7,
    waterCups: 4,
    lastActiveDate: null,
    passiveXpSinceLastVisit: 0,
    activeHatchlingId: null,
    totalReps: 0,
    lifetimePushups: 0,
    lifetimeSquats: 0,
    lifetimeBurpees: 0,
    lifetimePullups: 0,
    lifetimePlanks: 0,
    lifetimeSitups: 0,
    ...overrides,
  };
}

function makePartner(overrides: Partial<HatchlingRow> = {}): HatchlingRow {
  return {
    id: 42,
    playerId: 1,
    happiness: 70,
    energy: 80,
    friendshipLevel: 30,
    loyaltyScore: 50,
    motivationScore: 60,
    moodState: "happy",
    lastWorkoutAt: null,
    ...overrides,
  };
}

function resetState() {
  state.partner = makePartner();
  state.player = makePlayer();
  state.lastPartnerPatch = null;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    gte: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

// resolveActivePartner returns state.partner (or null when partner is null).
mock.module("../../services/activePartner.ts", {
  namedExports: {
    resolveActivePartner: async (_playerId: number) => state.partner ?? null,
  },
});

mock.module("../../services/badgeService.ts", {
  namedExports: {
    checkAndAwardBadges: async () => [],
  },
});

mock.module("../../services/artifactService.ts", {
  namedExports: {
    awardFitnessBarXp: async () => undefined,
    checkAndAwardArtifacts: async () => [],
  },
});

mock.module("../../services/hatchlingXp.ts", {
  namedExports: {
    applyHatchlingXp: async () => null,
    getActivePalId: async () => null,
  },
});

mock.module("../../lib/logger.ts", {
  namedExports: {
    logger: {
      info: () => {},
      error: () => {},
      warn: () => {},
      debug: () => {},
    },
  },
});

// Fake DB: records the patch applied to the hatchlings table so we can assert
// loyalty/motivation increments without actually writing to Postgres.
const fakeDb = {
  query: new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      if (name === "playersTable") {
        return { findFirst: async () => state.player ?? undefined };
      }
      if (name === "fitnessActivitiesTable") {
        return {
          findFirst: async () => undefined,
          findMany: async () => [],
        };
      }
      return { findFirst: async () => undefined, findMany: async () => [] };
    },
  }),
  insert: (_table: unknown) => ({
    values: (vals: Record<string, unknown>) => ({
      returning: async () => [
        {
          id: 1,
          createdAt: new Date(),
          ...vals,
        },
      ],
      onConflictDoUpdate: (_opts: unknown) => ({
        returning: async () => [{ id: 1, ...vals }],
      }),
    }),
  }),
  update: (table: unknown) => ({
    set: (vals: Record<string, unknown>) => {
      // We only want to capture the hatchlings update, not the player update.
      // Both calls go through this same chain; we distinguish by checking
      // whether the vals object looks like a hatchling patch (has moodState).
      if ("moodState" in vals || "loyaltyScore" in vals || "motivationScore" in vals) {
        state.lastPartnerPatch = vals;
      }
      void table;
      return {
        where: (_w: unknown) => ({
          returning: async () => {
            if ("fitnessXp" in vals) {
              // Player update — return updated player row
              return [{ ...state.player!, ...vals }];
            }
            return [{ ...state.partner!, ...vals }];
          },
        }),
      };
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    fitnessActivitiesTable: { id: {}, playerId: {}, externalId: {}, type: {}, createdAt: {} },
    fitnessQuestsTable: { id: {}, playerId: {}, type: {}, isCompleted: {}, targetValue: {}, currentValue: {} },
    playersTable: { id: {}, fitnessXp: {}, totalSteps: {}, totalWorkouts: {}, currentStreak: {} },
    hatchlingsTable: { id: {}, playerId: {}, loyaltyScore: {}, motivationScore: {} },
    eggsTable: { id: {}, playerId: {}, isHatched: {}, stepsProgress: {}, stepsRequired: {} },
    personalRecordsTable: {
      playerId: {},
      activityType: {},
      metric: {},
      value: {},
    },
  },
});

// ── Import the service under test ─────────────────────────────────────────────
// Must happen after all mock.module() calls.
const { logFitnessActivity } = await import("../../services/fitnessLog.ts");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fitnessLog — My Pal stat bump", () => {
  before(() => {
    resetState();
  });

  it("workout activity (running) bumps partner loyaltyScore +2 and motivationScore +8", async () => {
    state.partner = makePartner({ loyaltyScore: 50, motivationScore: 60 });
    state.player = makePlayer();

    await logFitnessActivity({ playerId: 1, type: "running", value: 30 });

    assert.ok(state.lastPartnerPatch, "partner hatchling update should have been called");
    assert.equal(
      state.lastPartnerPatch.loyaltyScore,
      52,
      "loyaltyScore should be 50 + 2 after running",
    );
    assert.equal(
      state.lastPartnerPatch.motivationScore,
      68,
      "motivationScore should be 60 + 8 after running",
    );
    assert.equal(
      state.lastPartnerPatch.moodState,
      "celebrating",
      "moodState should be celebrating",
    );
  });

  it("strength activity (pushups) bumps partner loyaltyScore +2 and motivationScore +8", async () => {
    state.partner = makePartner({ loyaltyScore: 30, motivationScore: 40 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "pushups", value: 20 });

    assert.ok(state.lastPartnerPatch, "partner hatchling update should have been called");
    assert.equal(state.lastPartnerPatch.loyaltyScore, 32, "loyaltyScore +2 for pushups");
    assert.equal(state.lastPartnerPatch.motivationScore, 48, "motivationScore +8 for pushups");
  });

  it("caps loyaltyScore at 100", async () => {
    state.partner = makePartner({ loyaltyScore: 99, motivationScore: 50 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "running", value: 20 });

    assert.ok(state.lastPartnerPatch);
    assert.equal(state.lastPartnerPatch.loyaltyScore, 100, "loyaltyScore capped at 100");
  });

  it("caps motivationScore at 100", async () => {
    state.partner = makePartner({ loyaltyScore: 50, motivationScore: 95 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "running", value: 20 });

    assert.ok(state.lastPartnerPatch);
    assert.equal(state.lastPartnerPatch.motivationScore, 100, "motivationScore capped at 100");
  });

  it("passive activity (steps) does NOT bump partner loyalty or motivation", async () => {
    state.partner = makePartner({ loyaltyScore: 50, motivationScore: 60 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "steps", value: 3000 });

    // steps is not a workout and not a strength activity — partner should not be touched
    const patch = state.lastPartnerPatch;
    const partnerWasUpdated =
      patch !== null && ("loyaltyScore" in patch || "motivationScore" in patch);
    assert.equal(
      partnerWasUpdated,
      false,
      "steps should not update partner loyalty/motivation",
    );
  });

  it("hydration does NOT bump partner loyalty or motivation", async () => {
    state.partner = makePartner({ loyaltyScore: 50, motivationScore: 60 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "hydration", value: 8 });

    const patch = state.lastPartnerPatch;
    const partnerWasUpdated =
      patch !== null && ("loyaltyScore" in patch || "motivationScore" in patch);
    assert.equal(
      partnerWasUpdated,
      false,
      "hydration should not update partner loyalty/motivation",
    );
  });

  it("when no active partner exists, stat bump is silently skipped", async () => {
    state.partner = null;
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    // Should complete without throwing
    const result = await logFitnessActivity({ playerId: 1, type: "running", value: 30 });

    assert.equal(result.isNew, true, "activity should still be recorded");
    assert.equal(state.lastPartnerPatch, null, "no partner patch when partner is null");
  });

  it("weightlifting (workout, non-strength-set) bumps loyalty and motivation", async () => {
    state.partner = makePartner({ loyaltyScore: 10, motivationScore: 20 });
    state.player = makePlayer();
    state.lastPartnerPatch = null;

    await logFitnessActivity({ playerId: 1, type: "weightlifting", value: 45 });

    assert.ok(state.lastPartnerPatch);
    assert.equal(state.lastPartnerPatch.loyaltyScore, 12, "loyaltyScore +2 for weightlifting");
    assert.equal(state.lastPartnerPatch.motivationScore, 28, "motivationScore +8 for weightlifting");
  });
});
