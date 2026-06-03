import {
  getDailyQuests,
  getMonthlyQuests,
  getQuestProgress,
  getWeeklyQuests,
  isQuestComplete,
} from "../quests";
import { initialHatchUpData } from "../models";

describe("daily quests", () => {
  it("derives progress from the latest daily award", () => {
    const quests = getDailyQuests({
      date: "2026-06-01",
      health: {
        date: "2026-06-01",
        steps: 1500,
        activeCalories: 100,
        workouts: 1,
        source: "mock",
      },
      xp: {
        steps: 15,
        activeCalories: 10,
        workouts: 30,
        quests: 100,
        firstSync: 15,
        total: 170,
      },
    });

    expect(quests).toHaveLength(5);
    expect(getQuestProgress(quests[0])).toBe(0.5);
    expect(isQuestComplete(quests[2])).toBe(true);
    expect(quests[2].rewardXp).toBe(20);
  });

  it("builds longer-term quest sections from local progress", () => {
    const data = {
      ...initialHatchUpData,
      activityHistory: [
        {
          date: "2026-06-01",
          health: {
            activeCalories: 100,
            date: "2026-06-01",
            source: "mock" as const,
            steps: 1500,
            workouts: 1,
          },
          xp: {
            activeCalories: 10,
            firstSync: 15,
            quests: 100,
            steps: 15,
            total: 170,
            workouts: 30,
          },
        },
      ],
      collection: [
        {
          bond: 5,
          element: "leaf" as const,
          hatchedAt: "2026-06-01T12:00:00.000Z",
          id: "hatchling-1",
          lastInteractionAt: "2026-06-01T12:00:00.000Z",
          level: 1,
          mood: "happy" as const,
          name: "Sprig",
          rarity: "common" as const,
          stats: { heart: 9, power: 6, resilience: 8, speed: 5 },
          xp: 0,
        },
      ],
    };

    expect(getWeeklyQuests(data, "2026-06-01")).toHaveLength(3);
    expect(getMonthlyQuests(data, "2026-06-01")[1]).toMatchObject({
      id: "monthlyCollection",
      current: 1,
    });
  });
});
