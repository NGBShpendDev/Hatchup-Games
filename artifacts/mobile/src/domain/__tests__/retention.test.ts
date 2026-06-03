import { getRetentionPlan } from "../retention";
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
});
