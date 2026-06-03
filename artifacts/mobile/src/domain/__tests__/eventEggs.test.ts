import { grantEventEggs } from "../eventEggs";
import { initialHatchUpData } from "../models";

describe("event egg drops", () => {
  it("awards a daily sync egg when there is incubator room", () => {
    const data = {
      ...initialHatchUpData,
      activeEggs: [initialHatchUpData.activeEgg],
      dailyAward: {
        date: "2026-06-02",
        health: {
          activeCalories: 100,
          date: "2026-06-02",
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
      eventEggsAwarded: [],
    };

    const next = grantEventEggs(data, "2026-06-02");

    expect(next.activeEggs).toHaveLength(2);
    expect(next.eventEggsAwarded).toContain("daily-sync-2026-06-02");
  });

  it("does not overfill the incubator", () => {
    const next = grantEventEggs(
      {
        ...initialHatchUpData,
        dailyAward: {
          date: "2026-06-02",
          health: {
            activeCalories: 100,
            date: "2026-06-02",
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
      },
      "2026-06-02",
    );

    expect(next.activeEggs).toHaveLength(3);
  });
});
