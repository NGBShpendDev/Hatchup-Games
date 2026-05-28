// Tests for `awardBattleHatchlingXp` — the exported helper that flows battle
// rewards into each fighter's Hatchling row so level-ups can cross evolution
// thresholds (5 and 15).  The function is the testable seam extracted from
// `finalizeBattle`; proving it here means any regression in the battle→XP
// wiring fails loudly without needing a full WebSocket battle session.

import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Spy state — reset in beforeEach
// ---------------------------------------------------------------------------
const capturedXpCalls: Array<{ palId: number; xpDelta: number }> = [];

// ---------------------------------------------------------------------------
// Mock all heavy module-level dependencies BEFORE any dynamic imports
// ---------------------------------------------------------------------------

await mock.module("@workspace/db", {
  namedExports: {
    db: {
      query: { playersTable: { findFirst: async () => null }, battlesTable: { findMany: async () => [] }, hatchlingsTable: { findFirst: async () => null }, notificationsTable: {}, rematchInvitesTable: {} },
      update: () => ({ set: () => ({ where: async () => undefined }) }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    },
    battlesTable: { id: null },
    hatchlingsTable: { id: null },
    notificationsTable: { id: null },
    playersTable: { id: null },
    rematchInvitesTable: { id: null },
  },
});

await mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    lt: () => ({}),
    or: () => ({}),
    desc: () => ({}),
  },
});

// Spy on applyHatchlingXp — capture each call, return a plausible result
await mock.module("./hatchlingXp.ts", {
  namedExports: {
    applyHatchlingXp: async (palId: number, xpDelta: number) => {
      capturedXpCalls.push({ palId, xpDelta });
      const newXp = 50 + xpDelta;
      return {
        hatchlingId: palId,
        prevLevel: 1,
        newLevel: 1 + Math.floor(newXp / 100),
        newXp,
        xpDelta,
      };
    },
    getActivePalId: async () => null,
  },
});

await mock.module("./artifactLoadoutService.ts", {
  namedExports: {
    loadActiveLoadoutModifiers: async () => ({ hpBonus: 0, speedBonus: 0, energyBonus: 0, powerScore: 0, equippedArtifacts: [] }),
    awardArtifactBattleXp: async () => [],
  },
});

await mock.module("./subscriptionGuards.ts", {
  namedExports: {
    checkAndConsumeBattleCap: async () => ({ ok: true }),
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceBattleDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

await mock.module("../lib/logger.ts", {
  namedExports: {
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  },
});

await mock.module("@workspace/api-zod", {
  namedExports: {
    BattleWsClientMessageSchema: { safeParse: () => ({ success: false }) },
    BattleWsServerMessageSchema: { safeParse: () => ({ success: true }) },
    BattleWsServerMessage: {},
  },
});

// battleService is pure (no DB) — import it real so computeRewards is accurate
const { computeRewards } = await import("./battleService.ts");
const { awardBattleHatchlingXp } = await import("./matchmakingQueue.ts");

// ---------------------------------------------------------------------------
// Minimal fake BattleState shape
// ---------------------------------------------------------------------------
function makeBattleState(winner: 0 | 1 | 2, turnNumber = 5, fighter2IsBot = false) {
  return {
    mode: "casual" as const,
    phase: "ended" as const,
    winner,
    turnNumber,
    currentSlot: 1 as const,
    turns: [],
    fighter1: {
      playerId: 1,
      hatchlingId: 10,
      hatchlingLevel: 3,
      realm: "cardio",
      playerUsername: "Alice",
      playerDisplayName: "Alice",
      hatchlingName: "Spark",
      maxHp: 115,
      currentHp: 60,
      maxEnergy: 80,
      currentEnergy: 20,
      speed: 15,
      isBot: false,
      equippedArtifacts: [],
    },
    fighter2: {
      playerId: 2,
      hatchlingId: 20,
      hatchlingLevel: 2,
      realm: "strength",
      playerUsername: fighter2IsBot ? null : "Bob",
      playerDisplayName: fighter2IsBot ? null : "Bob",
      hatchlingName: "Blaze",
      maxHp: 110,
      currentHp: 20,
      maxEnergy: 75,
      currentEnergy: 10,
      speed: 12,
      isBot: fighter2IsBot,
      equippedArtifacts: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("awardBattleHatchlingXp — winner gets higher XP than loser", () => {
  beforeEach(() => { capturedXpCalls.length = 0; });

  it("winner earns 200 base + 5×turnNumber XP", async () => {
    const state = makeBattleState(1, 5);
    const result = await awardBattleHatchlingXp(state as any);
    const expected = computeRewards(state as any, 1).xp; // 200 + 25 = 225
    assert.equal(result.fighter1Xp, expected);
  });

  it("loser earns 60 base + 3×turnNumber XP", async () => {
    const state = makeBattleState(1, 5);
    const result = await awardBattleHatchlingXp(state as any);
    const expected = computeRewards(state as any, 2).xp; // 60 + 15 = 75
    assert.equal(result.fighter2Xp, expected);
  });

  it("winner XP is always greater than loser XP", async () => {
    for (const turns of [1, 5, 10, 20]) {
      capturedXpCalls.length = 0;
      const state = makeBattleState(1, turns);
      const result = await awardBattleHatchlingXp(state as any);
      assert.ok(result.fighter1Xp > result.fighter2Xp!, `turn=${turns}: winner must out-earn loser`);
    }
  });
});

describe("awardBattleHatchlingXp — applyHatchlingXp is called for both fighters", () => {
  beforeEach(() => { capturedXpCalls.length = 0; });

  it("calls applyHatchlingXp for fighter1 with the correct hatchling ID and positive XP", async () => {
    const state = makeBattleState(1, 5);
    await awardBattleHatchlingXp(state as any);
    const f1Call = capturedXpCalls.find(c => c.palId === 10);
    assert.ok(f1Call, "applyHatchlingXp must be called for fighter1's hatchling");
    assert.ok(f1Call!.xpDelta > 0, "fighter1 XP delta must be positive");
    assert.equal(f1Call!.xpDelta, 225); // 200 + 5*5
  });

  it("calls applyHatchlingXp for fighter2 with the correct hatchling ID and positive XP", async () => {
    const state = makeBattleState(1, 5);
    await awardBattleHatchlingXp(state as any);
    const f2Call = capturedXpCalls.find(c => c.palId === 20);
    assert.ok(f2Call, "applyHatchlingXp must be called for fighter2's hatchling");
    assert.ok(f2Call!.xpDelta > 0, "fighter2 XP delta must be positive (consolation XP)");
    assert.equal(f2Call!.xpDelta, 75); // 60 + 5*3
  });

  it("both hatchlings receive XP regardless of which fighter wins", async () => {
    const state = makeBattleState(2, 8); // fighter2 wins
    await awardBattleHatchlingXp(state as any);
    assert.equal(capturedXpCalls.length, 2, "both fighters must receive XP");
    assert.ok(capturedXpCalls.every(c => c.xpDelta > 0), "all XP deltas must be positive");
  });

  it("returns fighter2Xp=null and skips fighter2 call when fighter2 is a bot", async () => {
    const state = makeBattleState(1, 5, true);
    capturedXpCalls.length = 0;
    const result = await awardBattleHatchlingXp(state as any);
    assert.equal(result.fighter2Xp, null, "bot opponents must not receive Pal XP");
    const botCall = capturedXpCalls.find(c => c.palId === 20);
    assert.equal(botCall, undefined, "applyHatchlingXp must not be called for bot fighter2");
  });
});

describe("awardBattleHatchlingXp — XP triggers potential level-ups", () => {
  beforeEach(() => { capturedXpCalls.length = 0; });

  it("winner's XP delta alone is enough to cross the first level threshold (100 XP)", async () => {
    const state = makeBattleState(1, 1); // minimum turns
    const result = await awardBattleHatchlingXp(state as any);
    // 200 + 1*5 = 205 XP for the winner
    assert.ok(result.fighter1Xp >= 100, "winner XP must always exceed the 100-XP level threshold");
  });

  it("loser's consolation XP is meaningful (≥ 60 even with 0 turns played)", async () => {
    const state = makeBattleState(1, 0);
    const result = await awardBattleHatchlingXp(state as any);
    // 60 + 0*3 = 60
    assert.ok(result.fighter2Xp !== null && result.fighter2Xp >= 60);
  });
});
