import { getActivityLogItems } from "../activityLog";
import { initialHatchUpData } from "../models";

describe("activity log", () => {
  it("summarizes syncs, hatches, rewards, and ready eggs", () => {
    const data = {
      ...initialHatchUpData,
      activeEggs: [
        {
          ...initialHatchUpData.activeEgg,
          stepsWalked: initialHatchUpData.activeEgg.stepsRequired,
        },
      ],
      activityHistory: [
        {
          date: "2026-06-14",
          health: {
            activeCalories: 25,
            date: "2026-06-14",
            source: "mock" as const,
            steps: 5000,
            workouts: 1,
          },
          xp: {
            activeCalories: 1,
            firstSync: 10,
            quests: 0,
            steps: 20,
            total: 31,
            workouts: 0,
          },
        },
      ],
      collection: [
        {
          bond: 10,
          element: "leaf" as const,
          hatchedAt: "2026-06-14T12:00:00.000Z",
          id: "pal-1",
          lastInteractionAt: null,
          level: 1,
          memories: [],
          mood: "happy" as const,
          name: "Sprig",
          rarity: "common" as const,
          stats: { heart: 10, power: 8, resilience: 9, speed: 7 },
          trainingSessions: [],
          xp: 0,
        },
      ],
      economyRewardHistory: [
        {
          accountXp: 0,
          bond: 0,
          chestProgress: 0,
          coins: 25,
          cosmeticIds: [],
          createdAt: "2026-06-14T13:00:00.000Z",
          eggSteps: 0,
          id: "reward-1",
          itemIds: [],
          label: "Pal hatched",
          palXp: 0,
          source: "hatch" as const,
        },
      ],
      lastSyncedDate: "2026-06-14T13:00:00.000Z",
    };

    const labels = getActivityLogItems(data).map((item) => item.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "Egg ready",
        "Movement synced",
        "Pal hatched",
      ]),
    );
  });
});
