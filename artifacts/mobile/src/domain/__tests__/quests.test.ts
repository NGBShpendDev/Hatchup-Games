import { getDailyQuests, getQuestProgress, isQuestComplete } from "../quests";

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
        quests: 20,
        firstSync: 15,
        total: 90,
      },
    });

    expect(getQuestProgress(quests[0])).toBe(0.5);
    expect(isQuestComplete(quests[2])).toBe(true);
    expect(quests[2].rewardXp).toBe(20);
  });
});
