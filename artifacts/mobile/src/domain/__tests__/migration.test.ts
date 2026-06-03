import { migrateHatchUpData } from "../migration";
import { initialHatchUpData, type DailyXp, type HatchUpData } from "../models";

describe("local data migration", () => {
  it("keeps existing progress while moving an install onto accelerated beta tuning", () => {
    const stored = {
      ...initialHatchUpData,
      schemaVersion: 2,
      accountId: undefined,
      leaderboardId: undefined,
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
    } as Partial<HatchUpData>;

    const migrated = migrateHatchUpData(stored);

    expect(migrated.totalXp).toBe(321);
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.progressionProfile).toBe("beta");
    expect(migrated.accountId).toEqual(expect.stringMatching(/^account-/));
    expect(migrated.cloudSyncStatus).toBe("localOnly");
    expect(migrated.analyticsEnabled).toBe(false);
    expect(migrated.crashReportingEnabled).toBe(true);
    expect(migrated.activeEgg).toMatchObject({
      stepsRequired: 1500,
      stepsWalked: 1500,
    });
    expect(migrated.activeEggs).toHaveLength(3);
    expect(migrated.activeEggs[0]).toMatchObject({
      stepsRequired: 1500,
      stepsWalked: 1500,
    });
    expect(migrated.leaderboardId).toEqual(
      expect.stringMatching(/^leaderboard-/),
    );
    expect(migrated.leaderboardShareEnabled).toBe(false);
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
