import { getCurrentFirstWeekMission, getRetentionPlan } from "../retention";
import { initialHatchUpData } from "../models";

describe("retention plan", () => {
  it("tracks weekly goal progress", () => {
    const plan = getRetentionPlan(
      {
        ...initialHatchUpData,
        weeklyGoalSteps: 10000,
        activityHistory: [
          {
            date: "2026-06-02",
            health: {
              activeCalories: 100,
              date: "2026-06-02",
              source: "mock",
              steps: 2500,
              workouts: 1,
            },
            xp: {
              activeCalories: 10,
              firstSync: 15,
              quests: 0,
              steps: 25,
              total: 50,
              workouts: 0,
            },
          },
        ],
      },
      "2026-06-02",
    );

    expect(plan).toMatchObject({
      progress: 0.25,
      stepsRemaining: 7500,
      weeklySteps: 2500,
    });
  });

  it("guides new players to sync movement first", () => {
    const mission = getCurrentFirstWeekMission(initialHatchUpData, "2026-06-02");

    expect(mission).toMatchObject({
      day: 1,
      target: "sync",
    });
  });

  it("moves the first-week arc to training after the first hatch", () => {
    const mission = getCurrentFirstWeekMission(
      {
        ...initialHatchUpData,
        activeHatchlingId: "hatchling-1",
        collection: [
          {
            bond: 5,
            element: "leaf",
            hatchedAt: "2026-06-02T12:00:00.000Z",
            id: "hatchling-1",
            lastInteractionAt: "2026-06-02T12:00:00.000Z",
            level: 1,
            memories: [],
            mood: "happy",
            name: "Sprig",
            rarity: "common",
            stats: { heart: 9, power: 6, resilience: 8, speed: 5 },
            trainingSessions: [],
            xp: 0,
          },
        ],
        eggsHatched: 1,
        lastSyncedDate: "2026-06-02",
      },
      "2026-06-02",
    );

    expect(mission).toMatchObject({
      day: 3,
      target: "collection",
    });
  });
});
