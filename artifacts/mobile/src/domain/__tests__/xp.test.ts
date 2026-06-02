import { calculateDailyXp, mergeDailyXp } from "../xp";

describe("calculateDailyXp", () => {
  it("awards XP for steps, calories, and workouts", () => {
    expect(
      calculateDailyXp({
        date: "2026-06-01",
        steps: 4250,
        activeCalories: 260,
        workouts: 1,
        source: "mock",
      }),
    ).toEqual({ steps: 17, activeCalories: 10, workouts: 20, total: 47 });
  });

  it("applies category caps and the overall daily cap", () => {
    expect(
      calculateDailyXp({
        date: "2026-06-01",
        steps: 50000,
        activeCalories: 5000,
        workouts: 10,
        source: "mock",
      }),
    ).toEqual({ steps: 40, activeCalories: 20, workouts: 40, total: 100 });
  });

  it("keeps previously awarded XP when a provider corrects metrics downward", () => {
    expect(
      mergeDailyXp(
        { steps: 17, activeCalories: 10, workouts: 20, total: 47 },
        { steps: 14, activeCalories: 8, workouts: 20, total: 42 },
      ),
    ).toEqual({ steps: 17, activeCalories: 10, workouts: 20, total: 47 });
  });
});
