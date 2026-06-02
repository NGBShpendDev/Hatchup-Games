import { migrateHatchUpData } from "../migration";
import { initialHatchUpData, type DailyXp, type HatchUpData } from "../models";

describe("local data migration", () => {
  it("keeps existing progress while moving an install onto accelerated beta tuning", () => {
    const stored = {
      ...initialHatchUpData,
      totalXp: 321,
      activeEgg: {
        ...initialHatchUpData.activeEgg,
        stepsRequired: 5000,
        stepsWalked: 4250,
      },
      dailyAward: {
        date: "2026-06-01",
        health: {
          date: "2026-06-01",
          steps: 4250,
          activeCalories: 260,
          workouts: 1,
          source: "appleHealth",
        },
        xp: {
          steps: 17,
          activeCalories: 10,
          workouts: 20,
          total: 47,
        } as DailyXp,
      },
    } as HatchUpData;

    const migrated = migrateHatchUpData(stored);

    expect(migrated.totalXp).toBe(321);
    expect(migrated.progressionProfile).toBe("beta");
    expect(migrated.activeEgg).toMatchObject({
      stepsRequired: 1500,
      stepsWalked: 1500,
    });
    expect(migrated.dailyAward?.xp).toEqual({
      steps: 17,
      activeCalories: 10,
      workouts: 20,
      quests: 0,
      firstSync: 0,
      total: 47,
    });
  });
});
