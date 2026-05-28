import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withinTolerance,
  allMacrosWithinTolerance,
  decideDailyMacroReward,
  todayUtcDateString,
  yesterdayUtcDateString,
  MACRO_TOLERANCE,
  type MacroTarget,
  type MacroTotals,
} from "./dailyMacroReward.ts";

const TARGET: MacroTarget = { calories: 2000, protein: 150, carbs: 200, fat: 70 };

// A fixed "now" so date math is deterministic regardless of when tests run.
const NOW = new Date("2026-03-15T12:00:00Z");
const TODAY = "2026-03-15";
const YESTERDAY = "2026-03-14";
const TWO_DAYS_AGO = "2026-03-13";

describe("withinTolerance", () => {
  it("accepts exact match", () => {
    assert.equal(withinTolerance(100, 100), true);
  });
  it("accepts +10% boundary", () => {
    assert.equal(withinTolerance(110, 100), true);
  });
  it("accepts -10% boundary", () => {
    assert.equal(withinTolerance(90, 100), true);
  });
  it("rejects 11% over", () => {
    assert.equal(withinTolerance(111, 100), false);
  });
  it("rejects 11% under", () => {
    assert.equal(withinTolerance(89, 100), false);
  });
  it("rejects when target is zero or negative", () => {
    assert.equal(withinTolerance(0, 0), false);
    assert.equal(withinTolerance(10, -5), false);
  });
});

describe("allMacrosWithinTolerance", () => {
  it("true when all four macros are within tolerance", () => {
    const totals: MacroTotals = { calories: 1950, protein: 155, carbs: 195, fat: 72 };
    assert.equal(allMacrosWithinTolerance(totals, TARGET), true);
  });
  it("false when one macro is out of tolerance", () => {
    const totals: MacroTotals = { calories: 1950, protein: 155, carbs: 195, fat: 100 }; // fat way over
    assert.equal(allMacrosWithinTolerance(totals, TARGET), false);
  });
});

describe("decideDailyMacroReward", () => {
  const hitTotals: MacroTotals = { calories: 2000, protein: 150, carbs: 200, fat: 70 };
  const missTotals: MacroTotals = { calories: 2000, protein: 150, carbs: 200, fat: 120 };

  it("all four macros within tolerance → reward fires, streak starts at 1", () => {
    const d = decideDailyMacroReward({
      prev: null,
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "reward");
    if (d.kind !== "reward") return;
    assert.equal(d.today, TODAY);
    assert.equal(d.newCurrent, 1);
    assert.equal(d.newLongest, 1);
  });

  it("one macro out of tolerance → no reward", () => {
    const d = decideDailyMacroReward({
      prev: null,
      totals: missTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "no_hit");
  });

  it("second meal post same day → no double reward (idempotent on rewardedOnDate)", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 3,
        longestStreak: 5,
        lastHitDate: TODAY,
        rewardedOnDate: TODAY,
      },
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "already_rewarded");
  });

  it("previous day was a hit → streak +1, longest tracks max", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 4,
        longestStreak: 4,
        lastHitDate: YESTERDAY,
        rewardedOnDate: YESTERDAY,
      },
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "reward");
    if (d.kind !== "reward") return;
    assert.equal(d.newCurrent, 5);
    assert.equal(d.newLongest, 5);
  });

  it("longestStreak is preserved when current is lower than longest", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 2,
        longestStreak: 10,
        lastHitDate: YESTERDAY,
        rewardedOnDate: YESTERDAY,
      },
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "reward");
    if (d.kind !== "reward") return;
    assert.equal(d.newCurrent, 3);
    assert.equal(d.newLongest, 10);
  });

  it("gap day (last hit was 2 days ago) → streak resets to 1", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 7,
        longestStreak: 7,
        lastHitDate: TWO_DAYS_AGO,
        rewardedOnDate: TWO_DAYS_AGO,
      },
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "reward");
    if (d.kind !== "reward") return;
    assert.equal(d.newCurrent, 1);
    assert.equal(d.newLongest, 7); // longest preserved
  });

  it("never-rewarded player with hit today starts streak at 1", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 0,
        longestStreak: 0,
        lastHitDate: null,
        rewardedOnDate: null,
      },
      totals: hitTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "reward");
    if (d.kind !== "reward") return;
    assert.equal(d.newCurrent, 1);
  });

  it("idempotency check runs before tolerance check (no_hit doesn't override already_rewarded)", () => {
    const d = decideDailyMacroReward({
      prev: {
        currentStreak: 1,
        longestStreak: 1,
        lastHitDate: TODAY,
        rewardedOnDate: TODAY,
      },
      totals: missTotals,
      target: TARGET,
      now: NOW,
    });
    assert.equal(d.kind, "already_rewarded");
  });
});

describe("date helpers", () => {
  it("todayUtcDateString returns YYYY-MM-DD in UTC", () => {
    assert.equal(todayUtcDateString(NOW), TODAY);
  });
  it("yesterdayUtcDateString returns previous UTC day", () => {
    assert.equal(yesterdayUtcDateString(NOW), YESTERDAY);
  });
  it("MACRO_TOLERANCE is 10%", () => {
    assert.equal(MACRO_TOLERANCE, 0.10);
  });
});
