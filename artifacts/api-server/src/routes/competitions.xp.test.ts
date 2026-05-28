import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// competitions.ts imports Express, drizzle, and auth middleware at the module
// level. Mock them all before dynamically importing the module so the side
// effects (Router() calls, DB connection) don't blow up in the test process.

await mock.module("@workspace/db", {
  namedExports: {
    db: { query: {}, insert: () => ({}), update: () => ({}) },
    competitionsTable: {},
    gameModesTable: {},
    hatchlingsTable: {},
    playersTable: {},
  },
});

await mock.module("express", {
  namedExports: {
    Router: () => ({ get: () => {}, post: () => {} }),
  },
});

await mock.module("../middlewares/auth.ts", {
  namedExports: {
    requireAuth: () => {},
    attachPlayer: () => {},
    requirePlayerOwnership: () => {},
  },
});

await mock.module("../services/hatchlingXp.ts", {
  namedExports: {
    applyHatchlingXp: async () => null,
    getActivePalId: async () => null,
  },
});

await mock.module("../services/activePartner.ts", {
  namedExports: { resolveActivePartner: async () => null },
});

await mock.module("@workspace/api-zod", {
  namedExports: {
    ListCompetitionsQueryParams: { safeParse: () => ({ success: false }) },
    CreateCompetitionBody: { safeParse: () => ({ success: false }) },
    GetCompetitionParams: { safeParse: () => ({ success: false }) },
    SubmitCompetitionResultParams: { safeParse: () => ({ success: false }) },
    SubmitCompetitionResultBody: { safeParse: () => ({ success: false }) },
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

const { computeCompetitionXp } = await import("./competitions.ts");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeCompetitionXp — rank bonuses", () => {
  it("rank 1 earns a 200-point bonus", () => {
    assert.equal(computeCompetitionXp(0, 1), 200);
  });

  it("rank 2 earns a 100-point bonus", () => {
    assert.equal(computeCompetitionXp(0, 2), 100);
  });

  it("rank 3 earns a 50-point consolation bonus", () => {
    assert.equal(computeCompetitionXp(0, 3), 50);
  });

  it("rank 10 also earns the 50-point consolation bonus", () => {
    assert.equal(computeCompetitionXp(0, 10), 50);
  });
});

describe("computeCompetitionXp — score multiplier", () => {
  it("awards 2 XP per score point", () => {
    assert.equal(computeCompetitionXp(100, 3), 200 + 50);
    assert.equal(computeCompetitionXp(50, 3), 100 + 50);
  });

  it("score multiplier stacks on top of the rank bonus", () => {
    assert.equal(computeCompetitionXp(200, 1), 400 + 200);
    assert.equal(computeCompetitionXp(200, 2), 400 + 100);
  });

  it("zero score still awards the rank bonus", () => {
    assert.equal(computeCompetitionXp(0, 1), 200);
    assert.equal(computeCompetitionXp(0, 2), 100);
    assert.equal(computeCompetitionXp(0, 5), 50);
  });
});

describe("computeCompetitionXp — always positive for valid inputs", () => {
  const cases: Array<[number, number]> = [
    [0, 1], [0, 2], [0, 3], [100, 1], [100, 2], [100, 3],
    [1000, 1], [1, 99],
  ];
  for (const [score, rank] of cases) {
    it(`score=${score}, rank=${rank} yields positive XP`, () => {
      assert.ok(computeCompetitionXp(score, rank) > 0);
    });
  }
});

describe("computeCompetitionXp — XP grows linearly with score", () => {
  it("doubling the score doubles the score-derived XP component", () => {
    const xp1 = computeCompetitionXp(100, 3) - 50;
    const xp2 = computeCompetitionXp(200, 3) - 50;
    assert.equal(xp2, xp1 * 2);
  });
});
