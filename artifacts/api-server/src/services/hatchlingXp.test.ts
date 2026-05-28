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

const { applyHatchlingXp, XP_PER_LEVEL } = await import("./hatchlingXp.ts");

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
