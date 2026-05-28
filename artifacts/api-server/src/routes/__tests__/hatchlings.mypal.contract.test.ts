// Contract tests for My Pal stat update hooks in /hatchlings routes.
//
// Covers three concerns pinned by task-666:
//   1. PATCH /hatchlings/:id with `lastWorkoutAt` bumps loyaltyScore (+3) and
//      motivationScore (+10) and the response validates against the generated
//      UpdateHatchlingResponse Zod schema.
//   2. The `computePowerScore` helper — exercised through the `powerScore` field
//      returned in the PATCH response for various rarity/level/battleWins combos.
//   3. The `computeStepsToEvolution` helper — exercised through `stepsToEvolution`
//      for stage 1 and stage 2 hatchlings with known XP values.
//
// All database access, Clerk, and subscription guards are stubbed so tests run
// in-process without a real Postgres connection.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ───────────────────────────────────────────────────────────

interface HatchlingRow {
  id: number;
  playerId: number;
  name: string;
  species: string;
  evolutionStage: number;
  evolutionType: string | null;
  category: string;
  rarity: string;
  personality: string;
  mood: string;
  moodState: string;
  level: number;
  xp: number;
  happiness: number;
  hunger: number;
  energy: number;
  fitnessType: string;
  realm: string;
  friendshipLevel: number;
  battleWins: number;
  loyaltyScore: number;
  motivationScore: number;
  abilityName: string | null;
  abilityDesc: string | null;
  imageUrl: string | null;
  isShiny: boolean;
  isFusion: boolean;
  color: string | null;
  eggId: number | null;
  genetics: Record<string, number> | null;
  lastWorkoutAt: Date | null;
  lastDecayAt: Date | null;
  nutritionBuffExpiresAt: Date | null;
  createdAt: Date;
}

interface PlayerRow {
  id: number;
  clerkId: string;
  username: string;
  displayName: string;
  activeHatchlingId: number | null;
  subscriptionTier: string;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  top10LastCheckedAt: Date | null;
  top10ContextLabel: string | null;
}

const state = {
  hatchling: null as HatchlingRow | null,
  player: null as PlayerRow | null,
  lastHatchlingPatch: null as Record<string, unknown> | null,
  playerId: 1,
};

function makeHatchling(overrides: Partial<HatchlingRow> = {}): HatchlingRow {
  return {
    id: 42,
    playerId: 1,
    name: "Sparky",
    species: "Mystery Pal",
    evolutionStage: 1,
    evolutionType: null,
    category: "cardio",
    rarity: "Common",
    personality: "Calm",
    mood: "happy",
    moodState: "happy",
    level: 5,
    xp: 200,
    happiness: 80,
    hunger: 60,
    energy: 70,
    fitnessType: "cardio",
    realm: "cardio",
    friendshipLevel: 20,
    battleWins: 0,
    loyaltyScore: 40,
    motivationScore: 50,
    abilityName: null,
    abilityDesc: null,
    imageUrl: null,
    isShiny: false,
    isFusion: false,
    color: null,
    eggId: null,
    genetics: null,
    lastWorkoutAt: null,
    lastDecayAt: new Date(),
    nutritionBuffExpiresAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makePlayer(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 1,
    clerkId: "u_1",
    username: "dragonmaster",
    displayName: "DragonMaster",
    activeHatchlingId: null,
    subscriptionTier: "free",
    trialEndsAt: null,
    paidUntil: null,
    top10LastCheckedAt: null,
    top10ContextLabel: null,
    ...overrides,
  };
}

function resetState() {
  state.hatchling = makeHatchling();
  state.player = makePlayer();
  state.lastHatchlingPatch = null;
  state.playerId = 1;
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "u_1" }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (req: { playerId?: number }, _res: unknown, next: () => void) => {
      req.playerId = state.playerId;
      next();
    },
    requirePlayerOwnership: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceHatchlingCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
    inArray: () => ({}),
    gte: () => ({}),
  },
});

// Fake DB: captures the patch applied by PATCH /hatchlings/:id so tests can
// assert the loyalty/motivation increments without a real database.
const fakeDb = {
  query: new Proxy({} as Record<string, unknown>, {
    get: (_t, name: string) => {
      if (name === "hatchlingsTable") {
        return {
          findFirst: async () => state.hatchling ?? undefined,
          findMany: async () => (state.hatchling ? [state.hatchling] : []),
        };
      }
      if (name === "playersTable") {
        return { findFirst: async () => state.player ?? undefined };
      }
      return { findFirst: async () => undefined, findMany: async () => [] };
    },
  }),
  insert: (_table: unknown) => ({
    values: (vals: Record<string, unknown>) => ({
      returning: async () => [
        {
          id: 99,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastWorkoutAt: null,
          ...vals,
        },
      ],
    }),
  }),
  update: (_table: unknown) => ({
    set: (vals: Record<string, unknown>) => {
      state.lastHatchlingPatch = vals;
      return {
        where: (_w: unknown) => ({
          returning: async () => {
            // Return the hatchling with the patch applied so the route
            // serialises the correct loyalty/motivation in the response.
            const merged = { ...state.hatchling!, ...vals };
            return [merged];
          },
        }),
      };
    },
  }),
  delete: (_table: unknown) => ({
    where: (_w: unknown) => Promise.resolve(),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    hatchlingsTable: { id: {}, playerId: {}, lastWorkoutAt: {}, lastDecayAt: {}, createdAt: {} },
    evolutionTypesTable: { id: {}, unlockedCount: {} },
    playersTable: { id: {}, activeHatchlingId: {}, clerkId: {} },
  },
});

// ── Server setup ──────────────────────────────────────────────────────────────

const express = (await import("express")).default;
const hatchlingsRouter = (await import("../hatchlings.ts")).default;
const {
  UpdateHatchlingResponse,
} = await import("@workspace/api-zod");

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(hatchlingsRouter);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function patchJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

// ── Tests: loyalty & motivation increments ────────────────────────────────────

describe("My Pal stat hooks — PATCH /hatchlings/:id", () => {
  it("increments loyaltyScore by 3 and motivationScore by 10 when lastWorkoutAt is sent", async () => {
    state.hatchling = makeHatchling({ loyaltyScore: 40, motivationScore: 50 });

    const { res, body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.equal(res.status, 200);

    // Validate the full response shape against the generated Zod schema.
    const parsed = UpdateHatchlingResponse.parse(body);

    assert.equal(parsed.loyaltyScore, 43, "loyaltyScore should be +3 after workout");
    assert.equal(parsed.motivationScore, 60, "motivationScore should be +10 after workout");
    assert.equal(parsed.moodState, "celebrating", "moodState should switch to celebrating");
    assert.equal(parsed.friendshipLevel, 25, "friendshipLevel should be +5 after workout");
  });

  it("caps loyaltyScore at 100", async () => {
    state.hatchling = makeHatchling({ loyaltyScore: 99, motivationScore: 50 });

    const { res, body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.equal(res.status, 200);
    const parsed = UpdateHatchlingResponse.parse(body);
    assert.equal(parsed.loyaltyScore, 100, "loyaltyScore should not exceed 100");
  });

  it("caps motivationScore at 100", async () => {
    state.hatchling = makeHatchling({ loyaltyScore: 40, motivationScore: 95 });

    const { res, body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.equal(res.status, 200);
    const parsed = UpdateHatchlingResponse.parse(body);
    assert.equal(parsed.motivationScore, 100, "motivationScore should not exceed 100");
  });

  it("does NOT change loyalty or motivation when lastWorkoutAt is omitted", async () => {
    state.hatchling = makeHatchling({ loyaltyScore: 40, motivationScore: 50, name: "OldName" });

    const { res, body } = await patchJson("/hatchlings/42", {
      name: "NewName",
    });

    assert.equal(res.status, 200);
    const parsed = UpdateHatchlingResponse.parse(body);
    assert.equal(parsed.name, "NewName");
    // loyalty and motivation should stay unchanged
    assert.equal(parsed.loyaltyScore, 40, "loyaltyScore unchanged when no workout logged");
    assert.equal(parsed.motivationScore, 50, "motivationScore unchanged when no workout logged");
  });

  it("returns 404 when hatchling does not exist", async () => {
    state.hatchling = null;
    const { res } = await patchJson("/hatchlings/42", { name: "Ghost" });
    assert.equal(res.status, 404);
  });

  it("returns 403 when hatchling belongs to a different player", async () => {
    state.hatchling = makeHatchling({ playerId: 99 });
    const { res } = await patchJson("/hatchlings/42", { name: "Intruder" });
    assert.equal(res.status, 403);
  });
});

// ── Tests: computePowerScore helper ──────────────────────────────────────────
// We exercise the helper through the `powerScore` field in the PATCH response.
// Formula: round(level × 10 × rarityMult + battleWins × 5)

describe("computePowerScore — via powerScore in PATCH response", () => {
  async function getPowerScore(level: number, rarity: string, battleWins: number): Promise<number> {
    state.hatchling = makeHatchling({ level, rarity, battleWins });
    const { body } = await patchJson("/hatchlings/42", { name: "Test" });
    return (body as { powerScore: number }).powerScore;
  }

  it("Common rarity: mult=1 → level 5, 0 wins → 50", async () => {
    assert.equal(await getPowerScore(5, "Common", 0), 50);
  });

  it("Rare rarity: mult=1.5 → level 4, 0 wins → 60", async () => {
    assert.equal(await getPowerScore(4, "Rare", 0), 60);
  });

  it("Epic rarity: mult=2 → level 3, 2 wins → 70", async () => {
    assert.equal(await getPowerScore(3, "Epic", 2), 70);
  });

  it("Legendary rarity: mult=3 → level 2, 4 wins → 80", async () => {
    assert.equal(await getPowerScore(2, "Legendary", 4), 80);
  });

  it("Mythic rarity: mult=4 → level 1, 0 wins → 40", async () => {
    assert.equal(await getPowerScore(1, "Mythic", 0), 40);
  });

  it("Ancient rarity: mult=5 → level 1, 0 wins → 50", async () => {
    assert.equal(await getPowerScore(1, "Ancient", 0), 50);
  });

  it("Celestial rarity: mult=6 → level 1, 0 wins → 60", async () => {
    assert.equal(await getPowerScore(1, "Celestial", 0), 60);
  });

  it("battleWins contribute 5 pts each regardless of rarity", async () => {
    const score = await getPowerScore(1, "Common", 10);
    assert.equal(score, 10 * 1 + 10 * 5);
  });

  it("Unknown rarity: defaults to mult=1", async () => {
    const score = await getPowerScore(2, "Ultrarare", 0);
    assert.equal(score, 2 * 10 * 1);
  });
});

// ── Tests: computeStepsToEvolution helper ────────────────────────────────────
// We exercise the helper through `stepsToEvolution` in the PATCH response.
// Stage 1→2: threshold 500 XP.  Stage 2→3: threshold 1500 XP.
// Steps = max(0, (threshold - xp) × 10)

describe("computeStepsToEvolution — via stepsToEvolution in PATCH response", () => {
  async function getStepsToEvolution(xp: number, evolutionStage: number): Promise<number> {
    state.hatchling = makeHatchling({ xp, evolutionStage });
    const { body } = await patchJson("/hatchlings/42", { name: "Test" });
    return (body as { stepsToEvolution: number }).stepsToEvolution;
  }

  it("stage 1, 0 XP → 5000 steps (500 × 10)", async () => {
    assert.equal(await getStepsToEvolution(0, 1), 5000);
  });

  it("stage 1, 200 XP → 3000 steps remaining", async () => {
    assert.equal(await getStepsToEvolution(200, 1), 3000);
  });

  it("stage 1, 500 XP → 0 steps (threshold met)", async () => {
    assert.equal(await getStepsToEvolution(500, 1), 0);
  });

  it("stage 1, 700 XP → 0 steps (already past threshold)", async () => {
    assert.equal(await getStepsToEvolution(700, 1), 0);
  });

  it("stage 2, 500 XP → 10000 steps remaining (1500 - 500 = 1000, ×10)", async () => {
    assert.equal(await getStepsToEvolution(500, 2), 10000);
  });

  it("stage 2, 1500 XP → 0 steps (threshold met)", async () => {
    assert.equal(await getStepsToEvolution(1500, 2), 0);
  });

  it("stage 3 → 0 steps (no further evolution)", async () => {
    assert.equal(await getStepsToEvolution(9999, 3), 0);
  });
});
