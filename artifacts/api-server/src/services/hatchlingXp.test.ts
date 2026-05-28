import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Fake DB state — mutated between tests via beforeEach / per-test assignment
// ---------------------------------------------------------------------------
let fakeHatchling: { id: number; xp: number; level: number; playerId: number } | null = null;
let lastSetArgs: { xp: number; level: number } | null = null;

const makeWhereChain = () => Promise.resolve(undefined);

const fakeDb = {
  query: {
    hatchlingsTable: {
      findFirst: async () => fakeHatchling,
    },
    playersTable: {
      findFirst: async () => null,
    },
  },
  update: (_table: unknown) => ({
    set: (data: { xp: number; level: number }) => {
      lastSetArgs = data;
      return { where: makeWhereChain };
    },
  }),
};

await mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    hatchlingsTable: { id: null },
    playersTable: { id: null },
  },
});

const { applyHatchlingXp, XP_PER_LEVEL, shouldTriggerSharePrompt, EVOLUTION_LEVELS } = await import("./hatchlingXp.ts");

describe("XP_PER_LEVEL constant", () => {
  it("is 100", () => {
    assert.equal(XP_PER_LEVEL, 100);
  });
});

describe("applyHatchlingXp — guard cases", () => {
  beforeEach(() => {
    lastSetArgs = null;
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
  });

  it("returns null when xpDelta is zero", async () => {
    const result = await applyHatchlingXp(1, 0);
    assert.equal(result, null);
  });

  it("returns null when xpDelta is negative", async () => {
    const result = await applyHatchlingXp(1, -50);
    assert.equal(result, null);
  });

  it("returns null when hatchling is not found", async () => {
    fakeHatchling = null;
    const result = await applyHatchlingXp(99, 100);
    assert.equal(result, null);
  });
});

describe("applyHatchlingXp — XP accumulation", () => {
  beforeEach(() => {
    lastSetArgs = null;
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
  });

  it("accumulates XP onto the existing total", async () => {
    fakeHatchling = { id: 1, xp: 50, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 30);
    assert.ok(result, "expected a non-null result");
    assert.equal(result!.newXp, 80);
    assert.equal(result!.xpDelta, 30);
  });

  it("writes the accumulated XP to the DB", async () => {
    fakeHatchling = { id: 1, xp: 20, level: 1, playerId: 1 };
    await applyHatchlingXp(1, 45);
    assert.ok(lastSetArgs, "DB set() should have been called");
    assert.equal(lastSetArgs!.xp, 65);
  });

  it("returns the correct hatchlingId and prevLevel", async () => {
    fakeHatchling = { id: 7, xp: 0, level: 3, playerId: 1 };
    const result = await applyHatchlingXp(7, 10);
    assert.ok(result);
    assert.equal(result!.hatchlingId, 7);
    assert.equal(result!.prevLevel, 3);
  });
});

describe("applyHatchlingXp — level-up logic", () => {
  beforeEach(() => {
    lastSetArgs = null;
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
  });

  it("does NOT level up when XP stays below the next threshold", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 99);
    assert.ok(result);
    assert.equal(result!.newLevel, 1);
  });

  it("levels up exactly when XP reaches the threshold (100 XP → level 2)", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 100);
    assert.ok(result);
    assert.equal(result!.newLevel, 2);
    assert.equal(result!.newXp, 100);
  });

  it("levels up multiple times in a single award (0 xp + 350 delta → level 4)", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 350);
    assert.ok(result);
    assert.equal(result!.newXp, 350);
    // 1 + floor(350 / 100) = 1 + 3 = 4
    assert.equal(result!.newLevel, 4);
  });

  it("spans a level boundary mid-award (xp=90 + delta=20 → level 2)", async () => {
    fakeHatchling = { id: 1, xp: 90, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 20);
    assert.ok(result);
    assert.equal(result!.newXp, 110);
    assert.equal(result!.newLevel, 2);
  });

  it("writes the new level to the DB", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    await applyHatchlingXp(1, 250);
    assert.ok(lastSetArgs);
    // 1 + floor(250 / 100) = 3
    assert.equal(lastSetArgs!.level, 3);
  });
});

describe("applyHatchlingXp — evolution threshold crossings (share prompt triggers)", () => {
  beforeEach(() => {
    lastSetArgs = null;
  });

  it("crosses level 5 threshold (level 4 → 5) and newLevel equals 5", async () => {
    // XP formula: newLevel = 1 + floor(newXp / 100)
    // At xp=300, level=4. Adding 100 → newXp=400, newLevel=max(4, 1+4)=5
    fakeHatchling = { id: 1, xp: 300, level: 4, playerId: 1 };
    const result = await applyHatchlingXp(1, 100);
    assert.ok(result);
    assert.equal(result!.prevLevel, 4);
    assert.equal(result!.newLevel, 5, "Pal should reach level 5 (first evolution threshold)");
  });

  it("crosses level 15 threshold (level 14 → 15) and newLevel equals 15", async () => {
    // At xp=1300, level=14. Adding 100 → newXp=1400, newLevel=max(14, 1+14)=15
    fakeHatchling = { id: 1, xp: 1300, level: 14, playerId: 1 };
    const result = await applyHatchlingXp(1, 100);
    assert.ok(result);
    assert.equal(result!.prevLevel, 14);
    assert.equal(result!.newLevel, 15, "Pal should reach level 15 (second evolution threshold)");
  });

  it("can cross level 5 threshold mid-award (e.g. level 3 → 5 skips cleanly)", async () => {
    // xp=200, level=3. Adding 300 → newXp=500, newLevel=max(3,6)=6 (crosses 5)
    fakeHatchling = { id: 1, xp: 200, level: 3, playerId: 1 };
    const result = await applyHatchlingXp(1, 300);
    assert.ok(result);
    assert.equal(result!.prevLevel, 3);
    assert.ok(result!.newLevel >= 5, "newLevel should be at or above the level-5 evolution threshold");
  });

  it("does NOT cross level 5 threshold when staying below level 5 (level 1 + 99 XP)", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    const result = await applyHatchlingXp(1, 99);
    assert.ok(result);
    assert.ok(result!.newLevel < 5, "no evolution threshold should be crossed");
  });
});

describe("shouldTriggerSharePrompt", () => {
  const makeResult = (prevLevel: number, newLevel: number): Parameters<typeof shouldTriggerSharePrompt>[0] => ({
    hatchlingId: 1,
    prevLevel,
    newLevel,
    newXp: newLevel * XP_PER_LEVEL,
    xpDelta: (newLevel - prevLevel) * XP_PER_LEVEL,
  });

  it("returns true when Pal crosses level 5 (4 → 5)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(4, 5)), true);
  });

  it("returns true when Pal crosses level 5 mid-award (3 → 6)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(3, 6)), true);
  });

  it("returns true when Pal crosses level 15 (14 → 15)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(14, 15)), true);
  });

  it("returns true when Pal crosses level 15 mid-award (12 → 16)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(12, 16)), true);
  });

  it("returns false when already at level 5 and gaining more levels (5 → 6)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(5, 6)), false);
  });

  it("returns false when already at level 15 and gaining more levels (15 → 16)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(15, 16)), false);
  });

  it("returns false when staying below level 5 (1 → 4)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(1, 4)), false);
  });

  it("returns false when staying between thresholds (6 → 10)", () => {
    assert.equal(shouldTriggerSharePrompt(makeResult(6, 10)), false);
  });

  it("EVOLUTION_LEVELS contains exactly 5 and 15", () => {
    assert.deepEqual([...EVOLUTION_LEVELS], [5, 15]);
  });
});

describe("applyHatchlingXp — level monotonicity", () => {
  beforeEach(() => {
    lastSetArgs = null;
  });

  it("never decreases level even when hatchling already has a higher level than XP implies", async () => {
    // A hatchling that was manually set to level 10 but only has 50 XP.
    // Adding 10 XP (total 60) would naively compute 1+floor(60/100)=1,
    // but Math.max(10, 1) keeps the level at 10.
    fakeHatchling = { id: 1, xp: 50, level: 10, playerId: 1 };
    const result = await applyHatchlingXp(1, 10);
    assert.ok(result);
    assert.equal(result!.newLevel, 10, "level must not decrease below current level");
    assert.equal(result!.newXp, 60);
  });

  it("level is non-decreasing across sequential XP awards", async () => {
    fakeHatchling = { id: 1, xp: 0, level: 1, playerId: 1 };
    let prevLevel = 1;
    const deltas = [50, 80, 120, 30, 200];
    let cumulativeXp = 0;
    for (const delta of deltas) {
      const result = await applyHatchlingXp(1, delta);
      assert.ok(result);
      assert.ok(
        result!.newLevel >= prevLevel,
        `level dropped from ${prevLevel} to ${result!.newLevel} after +${delta} XP`,
      );
      prevLevel = result!.newLevel;
      cumulativeXp += delta;
      fakeHatchling = { id: 1, xp: cumulativeXp, level: prevLevel, playerId: 1 };
    }
  });
});
