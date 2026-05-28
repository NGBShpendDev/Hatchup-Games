// End-to-end contract test for the Pal comeback reaction.
//
// The comeback feature (gold-glow bounce + "+X Motivation 💪 Back on track!" toast)
// fires in my-pal.tsx when the client sees a hatchling transition from
// moodState="sad" to moodState!="sad" while the My Pal component is still mounted.
//
// The transition is triggered by the server: when the client sends
// PATCH /hatchlings/:id with `lastWorkoutAt` set to the current time, the server
// recomputes moodState as "celebrating" (lastWorkoutAt < 2h), regardless of the
// previous motivationScore.  This test pins that server-side behaviour so a
// regression in computeMoodState or the PATCH handler would be caught before it
// reaches the client and silently breaks the comeback overlay.
//
// Coverage:
//   1. GET /hatchlings/:id — sad state: motivationScore < 30 → moodState "sad"
//   2. GET /hatchlings/:id — happy state: motivationScore ≥ 30, no workout → "happy"
//   3. PATCH /hatchlings/:id — comeback trigger: sad hatchling + lastWorkoutAt=now
//      → response moodState switches to "celebrating", loyalty/motivation incremented
//   4. PATCH /hatchlings/:id — celebrating takes priority over still-low motivation
//      (motivationScore was 15, +10 → 25, still < 30, but lastWorkoutAt < 2h wins)
//   5. PATCH /hatchlings/:id — without lastWorkoutAt on a sad hatchling → stays "sad"
//
// All DB, Clerk, and subscription guards are stubbed; tests run in-process.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ────────────────────────────────────────────────────────────

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
  confidenceScore: number;
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
  motivationDecayAt: Date | null;
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
  dailyWorkoutDeadlineHour: number;
  dailyStepGoal: number;
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
    confidenceScore: 50,
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
    motivationDecayAt: null,
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
    activeHatchlingId: 42,
    subscriptionTier: "free",
    trialEndsAt: null,
    paidUntil: null,
    top10LastCheckedAt: null,
    top10ContextLabel: null,
    dailyWorkoutDeadlineHour: 20,
    dailyStepGoal: 8000,
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
    or: () => ({}),
    desc: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
    inArray: () => ({}),
    gte: () => ({}),
    lte: () => ({}),
    lt: () => ({}),
    gt: () => ({}),
    ne: () => ({}),
    isNull: () => ({}),
    isNotNull: () => ({}),
    asc: () => ({}),
    count: () => ({}),
    not: () => ({}),
  },
});

// Chainable select builder — always resolves to an empty array (no battles → streak = 0).
function makeSelectChain(): unknown {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve([]),
    then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  };
  return chain;
}

const fakeDb = {
  select: (_fields?: unknown) => makeSelectChain(),
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
    battlesTable: { id: {}, winnerId: {}, createdAt: {} },
  },
});

// ── Server setup ──────────────────────────────────────────────────────────────

const express = (await import("express")).default;
const hatchlingsRouter = (await import("../hatchlings.ts")).default;
const { UpdateHatchlingResponse, GetHatchlingResponse } = await import("@workspace/api-zod");

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

async function getJson(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  return { res, body: await res.json() };
}

async function patchJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

// ── Suite 1: GET /hatchlings/:id — moodState derivation ──────────────────────
// These cover the conditions the client's sadReactionFiredRef check depends on:
// the server-computed moodState must be "sad" when motivationScore < 30 and
// no recent workout, so the useEffect's sad branch fires and primes the comeback.

describe("Pal comeback — GET /hatchlings/:id moodState derivation", () => {
  it("returns moodState='sad' when motivationScore < 30 and no lastWorkoutAt", async () => {
    state.hatchling = makeHatchling({ motivationScore: 15, lastWorkoutAt: null });

    const { res, body } = await getJson("/hatchlings/42");

    assert.equal(res.status, 200);
    const parsed = GetHatchlingResponse.parse(body);
    assert.equal(
      parsed.moodState,
      "sad",
      "motivationScore=15 (<30) with no workout must yield moodState='sad' — this is the precondition for the comeback",
    );
  });

  it("returns moodState='sad' for any motivationScore below the 30 threshold", async () => {
    for (const score of [0, 1, 15, 29]) {
      state.hatchling = makeHatchling({ motivationScore: score, lastWorkoutAt: null });
      const { body } = await getJson("/hatchlings/42");
      assert.equal(body.moodState, "sad", `motivationScore=${score} should be 'sad'`);
    }
  });

  it("returns moodState NOT 'sad' when motivationScore >= 30 and a workout was logged today", async () => {
    // Use lastWorkoutAt=3h ago so it's "today" (satisfies workedOutToday) but more
    // than 2h ago (not "celebrating").  This isolates the motivation threshold from
    // the time-based daily-deadline check.
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    state.hatchling = makeHatchling({ motivationScore: 30, lastWorkoutAt: threeHoursAgo });

    const { res, body } = await getJson("/hatchlings/42");

    assert.equal(res.status, 200);
    assert.notEqual(
      body.moodState,
      "sad",
      "motivationScore=30 (at threshold, not below it) must not trigger the motivation-based sad state",
    );
  });

  it("returns moodState='celebrating' when lastWorkoutAt is within 2h, even if motivationScore < 30", async () => {
    const recentWorkout = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    state.hatchling = makeHatchling({ motivationScore: 10, lastWorkoutAt: recentWorkout });

    const { res, body } = await getJson("/hatchlings/42");

    assert.equal(res.status, 200);
    assert.equal(
      body.moodState,
      "celebrating",
      "recent workout wins over low motivationScore — this is the post-comeback state",
    );
  });
});

// ── Suite 2: PATCH /hatchlings/:id — comeback trigger ────────────────────────
// The comeback is triggered when:
//   a) The hatchling was in moodState="sad" (motivationScore < 30, no recent workout).
//   b) The client sends PATCH with lastWorkoutAt=now (e.g., after clicking Train).
//   c) The server returns moodState="celebrating" in the response.
// The client's useEffect then sees sadReactionFiredRef===pal.id AND moodState!=="sad"
// and fires the gold-glow overlay + "Back on track!" toast.

describe("Pal comeback — PATCH /hatchlings/:id comeback trigger", () => {
  it("switches moodState to 'celebrating' when a sad hatchling logs a workout", async () => {
    // Start in sad state: motivationScore=15 (<30), no lastWorkoutAt.
    state.hatchling = makeHatchling({ motivationScore: 15, lastWorkoutAt: null });

    const { res, body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.equal(res.status, 200);
    const parsed = UpdateHatchlingResponse.parse(body);

    // The server must return "celebrating" — this is the server-side signal the
    // frontend comeback branch listens for.
    assert.equal(
      parsed.moodState,
      "celebrating",
      "a workout logged on a sad hatchling must flip moodState to 'celebrating' for the comeback to fire",
    );
  });

  it("celebrating takes priority even when +10 motivation still leaves score below 30", async () => {
    // motivationScore=15 + 10 = 25, which is still < 30, but "celebrating" wins
    // because lastWorkoutAt < 2h is checked first in computeMoodState.
    state.hatchling = makeHatchling({ motivationScore: 15, lastWorkoutAt: null });

    const { body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.equal(
      body.moodState,
      "celebrating",
      "recent workout takes priority over still-low motivationScore in comeback state",
    );
    // Motivation incremented toward recovery (+10).
    assert.equal(body.motivationScore, 25, "motivationScore bumped by 10 even if still below 30");
  });

  it("increments loyaltyScore and motivationScore during the comeback workout", async () => {
    state.hatchling = makeHatchling({ motivationScore: 15, loyaltyScore: 30, lastWorkoutAt: null });

    const { body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    const parsed = UpdateHatchlingResponse.parse(body);
    assert.equal(parsed.motivationScore, 25, "motivationScore +10 on comeback workout");
    assert.equal(parsed.loyaltyScore, 33, "loyaltyScore +3 on comeback workout");
    assert.equal(parsed.moodState, "celebrating", "moodState is celebrating after comeback workout");
  });

  it("does NOT flip to celebrating when lastWorkoutAt is omitted (sad state persists)", async () => {
    // Client sends a non-workout PATCH (e.g. name change); sad state should persist
    // so the comeback ref doesn't get prematurely cleared.
    state.hatchling = makeHatchling({ motivationScore: 15, lastWorkoutAt: null });

    const { res, body } = await patchJson("/hatchlings/42", { name: "SparkyRenamed" });

    assert.equal(res.status, 200);
    // moodState computed from still-low motivationScore, no new lastWorkoutAt
    assert.equal(
      body.moodState,
      "sad",
      "without a workout log the sad state must persist — no false comeback trigger",
    );
    // scores unchanged
    assert.equal(body.motivationScore, 15, "motivationScore unchanged without workout");
    assert.equal(body.loyaltyScore, 40, "loyaltyScore unchanged without workout");
  });

  it("validates against the UpdateHatchlingResponse Zod schema", async () => {
    state.hatchling = makeHatchling({ motivationScore: 15, lastWorkoutAt: null });

    const { body } = await patchJson("/hatchlings/42", {
      lastWorkoutAt: new Date().toISOString(),
    });

    assert.doesNotThrow(
      () => UpdateHatchlingResponse.parse(body),
      "comeback PATCH response must validate against the generated Zod schema",
    );
  });
});

// ── Suite 3: edge cases around the sad threshold ──────────────────────────────

describe("Pal comeback — sad/celebrating boundary conditions", () => {
  it("boundary: motivationScore=29 (one below threshold) → sad without workout", async () => {
    state.hatchling = makeHatchling({ motivationScore: 29, lastWorkoutAt: null });
    const { body } = await getJson("/hatchlings/42");
    assert.equal(body.moodState, "sad");
  });

  it("boundary: motivationScore=30 (at threshold) → not motivation-sad (with today's workout)", async () => {
    // Provide a workout from 3h ago so the daily-deadline path does not fire;
    // this isolates the motivationScore threshold boundary.
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    state.hatchling = makeHatchling({ motivationScore: 30, lastWorkoutAt: threeHoursAgo });
    const { body } = await getJson("/hatchlings/42");
    assert.notEqual(body.moodState, "sad", "motivationScore exactly at threshold (30) must not cause sad");
  });

  it("workout 1h59m ago → still celebrating (within 2h window)", async () => {
    const almostTwoHoursAgo = new Date(Date.now() - 119 * 60 * 1000);
    state.hatchling = makeHatchling({ motivationScore: 10, lastWorkoutAt: almostTwoHoursAgo });
    const { body } = await getJson("/hatchlings/42");
    assert.equal(body.moodState, "celebrating");
  });

  it("workout 2h01m ago with low motivation → sad (celebrating window expired)", async () => {
    const justOverTwoHoursAgo = new Date(Date.now() - 121 * 60 * 1000);
    state.hatchling = makeHatchling({
      motivationScore: 10,
      lastWorkoutAt: justOverTwoHoursAgo,
    });
    // The player deadline is 20 (8 pm); we test the motivation-based sad path here
    // by using a very low motivationScore (< 30) which overrides the non-celebrating state.
    const { body } = await getJson("/hatchlings/42");
    assert.equal(body.moodState, "sad", "2h+ old workout + low motivation → sad (comeback window expired)");
  });
});
