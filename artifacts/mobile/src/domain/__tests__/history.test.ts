import { getActivitySummary, upsertDailyAward } from "../history";
import type { DailyAward } from "../models";

function makeAward(date: string, steps: number, xp: number): DailyAward {
  return {
    date,
    health: {
      date,
      steps,
      activeCalories: 250,
      workouts: 1,
      source: "mock",
    },
    xp: { steps: xp, activeCalories: 0, workouts: 0, total: xp },
  };
}

describe("activity history", () => {
  it("replaces the same day instead of duplicating it", () => {
    const first = makeAward("2026-06-01", 3000, 12);
    const updated = makeAward("2026-06-01", 5000, 20);

    expect(upsertDailyAward([first], updated)).toEqual([updated]);
  });

  it("summarizes a seven-day local activity window", () => {
    const summary = getActivitySummary(
      [
        makeAward("2026-05-29", 4000, 16),
        makeAward("2026-06-01", 5000, 20),
      ],
      "2026-06-01",
    );

    expect(summary.days).toHaveLength(7);
    expect(summary.days[0].date).toBe("2026-05-26");
    expect(summary.days[6].date).toBe("2026-06-01");
    expect(summary.activeDays).toBe(2);
    expect(summary.steps).toBe(9000);
    expect(summary.xp).toBe(36);
  });
});
