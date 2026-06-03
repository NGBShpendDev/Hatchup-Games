import { getLeaderboardEntries, getUserLeaderboardStats } from "../leaderboard";
import { initialHatchUpData, type HatchUpData } from "../models";

describe("leaderboard", () => {
  const data: HatchUpData = {
    ...initialHatchUpData,
    leaderboardAlias: "Tester",
    totalXp: 500,
    activityHistory: [
      {
        date: "2026-06-02",
        health: {
          activeCalories: 120,
          date: "2026-06-02",
          source: "mock",
          steps: 10000,
          workouts: 1,
        },
        xp: {
          activeCalories: 12,
          firstSync: 15,
          quests: 20,
          steps: 80,
          total: 157,
          workouts: 30,
        },
      },
    ],
  };

  it("summarizes weekly movement and xp", () => {
    expect(getUserLeaderboardStats(data, "2026-06-02")).toMatchObject({
      distanceMiles: 4.7,
      steps: 10000,
      totalXp: 500,
    });
  });

  it("uses direct health distance when available", () => {
    expect(
      getUserLeaderboardStats(
        {
          ...data,
          activityHistory: [
            {
              ...data.activityHistory[0],
              health: {
                ...data.activityHistory[0].health,
                distanceMeters: 8047,
              },
            },
          ],
        },
        "2026-06-02",
      ).distanceMiles,
    ).toBe(5);
  });

  it("adds the user only when sharing is enabled", () => {
    expect(
      getLeaderboardEntries(data, "2026-06-02", "xp").some((entry) => entry.isUser),
    ).toBe(false);

    expect(
      getLeaderboardEntries(
        { ...data, leaderboardShareEnabled: true },
        "2026-06-02",
        "xp",
      ).some((entry) => entry.isUser),
    ).toBe(true);
  });
});
