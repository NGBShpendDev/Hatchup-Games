import { calculateDailyXp, getXpGains, mergeDailyXp } from "../xp";

describe("calculateDailyXp", () => {
  it("awards XP for steps, calories, and workouts", () => {
    expect(
      calculateDailyXp(
        {
          date: "2026-06-01",
          steps: 4250,
          activeCalories: 260,
          workouts: 1,
          source: "mock",
        },
        { firstSyncOfDay: true },
      ),
    ).toEqual({
      steps: 42,
      activeCalories: 26,
      workouts: 30,
      quests: 60,
      firstSync: 15,
      total: 173,
    });
  });

  it("applies category caps and the overall daily cap", () => {
    expect(
      calculateDailyXp(
        {
          date: "2026-06-01",
          steps: 50000,
          activeCalories: 5000,
          workouts: 10,
          source: "mock",
        },
        { firstSyncOfDay: true },
      ),
    ).toEqual({
      steps: 80,
      activeCalories: 40,
      workouts: 60,
      quests: 60,
      firstSync: 15,
      total: 240,
    });
  });

  it("keeps previously awarded XP when a provider corrects metrics downward", () => {
    expect(
      mergeDailyXp(
        {
          steps: 42,
          activeCalories: 26,
          workouts: 30,
          quests: 60,
          firstSync: 15,
          total: 173,
        },
        {
          steps: 35,
          activeCalories: 20,
          workouts: 30,
          quests: 60,
          firstSync: 0,
          total: 145,
        },
      ),
    ).toEqual({
      steps: 42,
      activeCalories: 26,
      workouts: 30,
      quests: 60,
      firstSync: 15,
      total: 173,
    });
  });

  it("reports only newly earned bonus XP after another sync", () => {
    expect(
      getXpGains(
        {
          steps: 30,
          activeCalories: 20,
          workouts: 30,
          quests: 40,
          firstSync: 15,
          total: 135,
        },
        {
          steps: 42,
          activeCalories: 26,
          workouts: 30,
          quests: 60,
          firstSync: 15,
          total: 173,
        },
      ),
    ).toEqual({
      steps: 12,
      activeCalories: 6,
      workouts: 0,
      quests: 20,
      firstSync: 0,
      total: 38,
    });
  });
});
