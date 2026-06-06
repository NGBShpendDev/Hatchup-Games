import { getQaFixtures } from "../../qa/fixtures";
import {
  formatDistanceMiles,
  formatNumber,
  formatPercent,
  formatSteps,
  formatXp,
} from "../../utils/format";
import {
  addStepsToEgg,
  createEgg,
  getEggProgress,
  isEggReady,
} from "../hatchery";
import {
  getLeaderboardEntries,
  getUserLeaderboardStats,
} from "../leaderboard";
import { initialHatchUpData } from "../models";
import { updateStreak } from "../streak";
import { calculateDailyXp } from "../xp";

describe("QA polish coverage", () => {
  it("provides the required QA fixture states", () => {
    const fixtures = getQaFixtures("2026-06-06");

    expect(fixtures.map((fixture) => fixture.id)).toEqual([
      "new-user-no-sync",
      "synced-today-no-pal",
      "egg-ready",
      "first-pal-hatched",
      "active-pal-selected",
      "collection-several-pals",
      "private-leaderboard",
      "shared-leaderboard",
      "health-permission-denied",
      "mock-mode",
    ]);
    expect(
      fixtures.find((fixture) => fixture.id === "egg-ready")?.data.activeEggs.some(isEggReady),
    ).toBe(true);
    expect(
      fixtures.find((fixture) => fixture.id === "collection-several-pals")?.data.collection.length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("calculates XP for movement without exceeding daily cap", () => {
    expect(
      calculateDailyXp(
        {
          activeCalories: 5000,
          date: "2026-06-06",
          source: "mock",
          steps: 50000,
          workouts: 10,
        },
        { firstSyncOfDay: true },
      ).total,
    ).toBe(240);
  });

  it("tracks Egg progress and hatch-ready state", () => {
    const egg = createEgg(12);
    const partial = addStepsToEgg(egg, egg.stepsRequired / 2);
    const ready = addStepsToEgg(egg, egg.stepsRequired);

    expect(getEggProgress(partial)).toBe(0.5);
    expect(isEggReady(partial)).toBe(false);
    expect(isEggReady(ready)).toBe(true);
  });

  it("updates streaks once per reward day", () => {
    const continued = updateStreak(
      { currentStreak: 2, lastRewardDate: "2026-06-05", longestStreak: 2 },
      "2026-06-06",
      10,
    );

    expect(continued).toMatchObject({
      currentStreak: 3,
      lastRewardDate: "2026-06-06",
      longestStreak: 3,
    });
    expect(updateStreak(continued, "2026-06-06", 10)).toEqual(continued);
  });

  it("keeps leaderboard opt-in private until sharing is enabled", () => {
    const syncedData = {
      ...initialHatchUpData,
      activityHistory: [
        {
          date: "2026-06-06",
          health: {
            activeCalories: 120,
            date: "2026-06-06",
            distanceMeters: 5000,
            source: "mock" as const,
            steps: 6200,
            workouts: 1,
          },
          xp: {
            activeCalories: 12,
            firstSync: 15,
            quests: 20,
            steps: 62,
            total: 139,
            workouts: 30,
          },
        },
      ],
      leaderboardAlias: "Tester",
      totalXp: 300,
    };

    expect(
      getLeaderboardEntries(syncedData, "2026-06-06", "steps").some(
        (entry) => entry.isUser,
      ),
    ).toBe(false);
    expect(
      getLeaderboardEntries(
        { ...syncedData, leaderboardShareEnabled: true },
        "2026-06-06",
        "steps",
      ).some((entry) => entry.isUser),
    ).toBe(true);
    expect(getUserLeaderboardStats(syncedData, "2026-06-06")).toMatchObject({
      distanceMiles: 3.1,
      steps: 6200,
    });
  });

  it("formats public numbers consistently", () => {
    expect(formatNumber(10000)).toBe("10,000");
    expect(formatSteps(35000)).toBe("35,000 steps");
    expect(formatDistanceMiles(3.145)).toBe("3.1 mi");
    expect(formatPercent(0.356)).toBe("36%");
    expect(formatXp(1500)).toBe("1,500 XP");
  });
});

describe("feature flags", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses beta-safe defaults for public-facing complexity", () => {
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_APP_VARIANT = "development";
      const features = require("../../config/features") as typeof import("../../config/features");

      expect(features.ENABLE_SHOP).toBe(false);
      expect(features.ENABLE_WEEKLY_CHEST).toBe(true);
      expect(features.ENABLE_ADVANCED_QUESTS).toBe(false);
      expect(features.ENABLE_LEADERBOARD).toBe(true);
      expect(features.ENABLE_PROFILE_BADGES).toBe(true);
      expect(features.ENABLE_CLOUD_SYNC).toBe(true);
    });
  });

  it("keeps TestLab hidden in public builds even if env requests it", () => {
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_APP_VARIANT = "production";
      process.env.EXPO_PUBLIC_ENABLE_TEST_LAB = "true";
      const features = require("../../config/features") as typeof import("../../config/features");

      expect(features.ENABLE_TEST_LAB).toBe(false);
    });
  });
});
