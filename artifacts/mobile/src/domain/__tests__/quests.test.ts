import { getDailyQuests, getQuestProgress, isQuestComplete } from "../quests";

describe("daily quests", () => {
  it("derives progress from the latest daily award", () => {
    const quests = getDailyQuests({
      date: "2026-06-01",
      health: {
        date: "2026-06-01",
        steps: 4250,
        activeCalories: 260,
        workouts: 1,
        source: "mock",
      },
      xp: { steps: 17, activeCalories: 10, workouts: 20, total: 47 },
    });

    expect(getQuestProgress(quests[0])).toBe(0.425);
    expect(isQuestComplete(quests[2])).toBe(true);
  });
});
