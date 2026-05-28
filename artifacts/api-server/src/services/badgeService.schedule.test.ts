// Unit tests for DAILY_REWARD_SCHEDULE and getDailyReward (badgeService.ts)
//
// These tests import the *real* schedule data and reward-lookup function —
// no stub is used for badgeService itself — so that a regression like
// removing `streak_shield` from day 3 or day 20 of DAILY_REWARD_SCHEDULE
// will immediately be caught here.
//
// @workspace/db and drizzle-orm are mocked with no-ops because badgeService.ts
// imports them at the module level; the pure functions under test never call them.

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// ── Minimal stubs so the module loads without a real DB connection ────────────

mock.module("@workspace/db", {
  namedExports: {
    db: {
      query: { playerBadgesTable: { findFirst: async () => undefined } },
      insert: () => ({ values: async () => {} }),
      update: () => ({ set: () => ({ where: async () => {} }) }),
    },
    playerBadgesTable: {},
    playersTable: {},
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}), join: () => ({}) },
    ),
  },
});

// ── Import real schedule data after mocks are registered ─────────────────────

const { DAILY_REWARD_SCHEDULE, getDailyReward } =
  await import("./badgeService.ts");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DAILY_REWARD_SCHEDULE — streak_shield days", () => {
  it("day 3 has bonus='streak_shield' in the schedule", () => {
    const day3 = DAILY_REWARD_SCHEDULE.find(d => d.day === 3);
    assert.ok(day3, "Day 3 must exist in DAILY_REWARD_SCHEDULE");
    assert.equal(
      day3.bonus,
      "streak_shield",
      "Day 3 should award a streak_shield bonus",
    );
  });

  it("day 20 has bonus='streak_shield' in the schedule", () => {
    const day20 = DAILY_REWARD_SCHEDULE.find(d => d.day === 20);
    assert.ok(day20, "Day 20 must exist in DAILY_REWARD_SCHEDULE");
    assert.equal(
      day20.bonus,
      "streak_shield",
      "Day 20 should award a streak_shield bonus",
    );
  });

  it("exactly two days in the 30-day schedule carry streak_shield", () => {
    const shieldDays = DAILY_REWARD_SCHEDULE.filter(
      d => d.bonus === "streak_shield",
    );
    assert.equal(
      shieldDays.length,
      2,
      `Expected exactly 2 streak_shield days but found ${shieldDays.length}: ` +
        shieldDays.map(d => d.day).join(", "),
    );
  });
});

describe("getDailyReward — streak_shield resolution", () => {
  it("getDailyReward(3) returns bonus='streak_shield'", () => {
    const reward = getDailyReward(3);
    assert.equal(
      reward.bonus,
      "streak_shield",
      "streak day 3 must resolve to streak_shield via getDailyReward",
    );
  });

  it("getDailyReward(20) returns bonus='streak_shield'", () => {
    const reward = getDailyReward(20);
    assert.equal(
      reward.bonus,
      "streak_shield",
      "streak day 20 must resolve to streak_shield via getDailyReward",
    );
  });

  it("getDailyReward(3) after a full 30-day cycle (day 33) also returns streak_shield", () => {
    // The schedule cycles every 30 days: day 33 is equivalent to day 3
    const reward = getDailyReward(33);
    assert.equal(
      reward.bonus,
      "streak_shield",
      "Day 33 (cycle day 3) must also resolve to streak_shield",
    );
  });

  it("getDailyReward(1) does NOT return a streak_shield bonus (non-shield day)", () => {
    const reward = getDailyReward(1);
    assert.notEqual(
      reward.bonus,
      "streak_shield",
      "Day 1 must not award a streak_shield",
    );
  });

  it("getDailyReward(5) does NOT return a streak_shield bonus (rare_egg day)", () => {
    const reward = getDailyReward(5);
    assert.notEqual(
      reward.bonus,
      "streak_shield",
      "Day 5 should be a rare_egg day, not a streak_shield day",
    );
  });
});
