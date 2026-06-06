import {
  getClaimableQuestCount,
  getDailyQuests,
  getCompletedQuestXp,
  getMonthlyQuests,
  getPalQuests,
  getNextQuestSuggestions,
  getQuestCompletionRatio,
  getQuestProgress,
  getQuestRemainingText,
  getQuestRewardKey,
  getQuestRewardLabel,
  getQuestTierLabel,
  getSeasonalQuests,
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
    expect(isQuestComplete(quests[2])).toBe(false);
    expect(quests[2]).toMatchObject({
      label: "Double session",
      previousTarget: 1,
      rewardXp: 40,
      target: 2,
      tier: 2,
    });
  });

  it("unlocks higher daily quest tiers as thresholds are cleared", () => {
    const quests = getDailyQuests({
      date: "2026-06-01",
      health: {
        date: "2026-06-01",
        steps: 12000,
        activeCalories: 100,
        workouts: 0,
        source: "mock",
      },
      xp: {
        steps: 0,
        activeCalories: 0,
        workouts: 0,
        quests: 0,
        firstSync: 0,
        total: 0,
      },
    });

    expect(quests[0]).toMatchObject({
      label: "Crush 15K steps",
      previousTarget: 10000,
      rewardXp: 60,
      target: 15000,
      tier: 4,
      totalTiers: 5,
    });
    expect(getQuestProgress(quests[0])).toBe(0.4);
  });

  it("sums completed tier rewards for quest XP", () => {
    expect(
      getCompletedQuestXp({
        date: "2026-06-01",
        steps: 12000,
        activeCalories: 500,
        workouts: 2,
        source: "mock",
      }),
    ).toBe(425);
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
          memories: [
            {
              description: "Hatched from a common leaf egg.",
              happenedAt: "2026-06-01T12:00:00.000Z",
              id: "memory-hatch-1",
              label: "First hatch",
            },
          ],
          level: 1,
          mood: "happy" as const,
          name: "Sprig",
          rarity: "common" as const,
          stats: { heart: 9, power: 6, resilience: 8, speed: 5 },
          trainingSessions: [],
          xp: 0,
        },
      ],
    };

    expect(getWeeklyQuests(data, "2026-06-01")).toHaveLength(5);
    expect(getMonthlyQuests(data, "2026-06-01")[1]).toMatchObject({
      id: "monthlyCollection",
      current: 1,
    });
  });

  it("adds claimable rewards and element chains for longer-term quests", () => {
    const data = {
      ...initialHatchUpData,
      accountXp: 0,
      activeHatchlingId: "hatchling-1",
      collection: [
        {
          bond: 55,
          element: "ember" as const,
          hatchedAt: "2026-06-01T12:00:00.000Z",
          id: "hatchling-1",
          lastInteractionAt: "2026-06-01T12:00:00.000Z",
          memories: [],
          level: 3,
          mood: "happy" as const,
          name: "Flicker",
          rarity: "rare" as const,
          stats: { heart: 9, power: 9, resilience: 8, speed: 7 },
          trainingSessions: ["2026-06-01", "2026-06-02", "2026-06-03"],
          xp: 120,
        },
      ],
    };
    const weekly = getWeeklyQuests(data, "2026-06-03");
    const elementQuest = weekly.find((quest) => quest.id === "weeklyElementTraining");

    expect(weekly).toHaveLength(5);
    expect(elementQuest).toMatchObject({
      label: "Ember training camp",
      rewardAccountXp: 190,
      rewardCoins: 130,
      rewardEggSteps: 1400,
    });
    expect(getQuestRewardLabel(elementQuest!)).toContain("Journey XP");
    expect(getQuestRewardKey(elementQuest!, "2026-06-03")).toBe(
      "week-2026-05-31:weeklyElementTraining:tier-3",
    );
  });

  it("builds seasonal and active Pal quest boards", () => {
    const data = {
      ...initialHatchUpData,
      activeHatchlingId: "hatchling-1",
      collection: [
        {
          bond: 55,
          element: "tide" as const,
          hatchedAt: "2026-06-01T12:00:00.000Z",
          id: "hatchling-1",
          lastInteractionAt: "2026-06-01T12:00:00.000Z",
          memories: [],
          level: 5,
          mood: "happy" as const,
          name: "Ripple",
          rarity: "epic" as const,
          stats: { heart: 10, power: 8, resilience: 8, speed: 10 },
          trainingSessions: ["1", "2", "3", "4"],
          xp: 260,
        },
      ],
    };

    expect(getSeasonalQuests(data, "2026-06-03")[1]).toMatchObject({
      id: "seasonalElement",
      label: "Tide duo",
      rewardAccountXp: 260,
    });
    expect(getQuestRewardKey(getSeasonalQuests(data, "2026-06-03")[1], "2026-06-03")).toBe(
      "season-tidesurge-2026:seasonalElement:tier-2",
    );
    expect(getPalQuests(data, "2026-06-03")[0]).toMatchObject({
      id: "pal-hatchling-1-level",
      label: "Ripple reaches Lv 10",
      previousTarget: 5,
      rewardCoins: 220,
    });
  });

  it("summarizes quest boards for UI guidance", () => {
    const data = {
      ...initialHatchUpData,
      weeklyGoalSteps: 3000,
      activityHistory: [
        {
          date: "2026-06-01",
          health: {
            activeCalories: 100,
            date: "2026-06-01",
            source: "mock" as const,
            steps: 70000,
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
    };
    const weekly = getWeeklyQuests(data, "2026-06-03");

    expect(getQuestCompletionRatio(weekly)).toBeGreaterThan(0);
    expect(getClaimableQuestCount(weekly, "2026-06-03", [])).toBeGreaterThan(0);
    expect(getNextQuestSuggestions(weekly, 2)).toHaveLength(2);
    expect(getQuestTierLabel(weekly[0])).toContain("Tier");
    expect(getQuestRemainingText(weekly[1])).toContain("active days left");
  });
});
