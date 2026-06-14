import { getNextBestAction } from "../nextBestAction";
import {
  initialHatchUpData,
  type CollectedHatchling,
  type DailyAward,
} from "../models";

const todayKey = "2026-06-06";
const now = "2026-06-06T12:00:00.000Z";

describe("getNextBestAction", () => {
  it("prioritizes syncing movement when today has not been synced", () => {
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeEggs: [{ ...initialHatchUpData.activeEgg, stepsWalked: 999999 }],
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Sync movement",
      target: "sync",
      title: "Sync movement",
    });
  });

  it("prompts hatching when an egg is ready after sync", () => {
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeEggs: [{ ...initialHatchUpData.activeEgg, stepsWalked: 999999 }],
        dailyAward: lowAward,
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Hatch Egg",
      target: "hatchery",
      title: "Hatch Egg",
    });
  });

  it("prompts training when the active Pal can train", () => {
    const pal = getPal({ trainingSessions: [] });
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeHatchlingId: pal.id,
        collection: [pal],
        dailyAward: lowAward,
        profileHatchlingId: pal.id,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Train Pal",
      target: "collection",
      title: "Train Pal",
    });
  });

  it("prompts profile completion after core daily actions are done", () => {
    const pal = getPal({
      trainingSessions: [
        "2026-06-06T08:00:00.000Z",
        "2026-06-06T09:00:00.000Z",
        "2026-06-06T10:00:00.000Z",
      ],
    });
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeHatchlingId: pal.id,
        collection: [pal],
        dailyAward: award,
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Complete profile",
      target: "profile",
      title: "Complete profile",
    });
  });

  it("falls back to tomorrow when sync, hatch, training, and profile are complete", () => {
    const pal = getPal({
      trainingSessions: [
        "2026-06-06T08:00:00.000Z",
        "2026-06-06T09:00:00.000Z",
        "2026-06-06T10:00:00.000Z",
      ],
    });
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeHatchlingId: pal.id,
        collection: [pal],
        currentStreak: 3,
        dailyAward: award,
        profileHatchlingId: pal.id,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      target: "tomorrow",
      title: "Come back tomorrow",
    });
  });

  it("prompts a close daily quest before profile completion", () => {
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        dailyAward: closeQuestAward,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Sync movement",
      target: "dailyQuest",
      title: "Finish today's quest",
    });
    expect(action.progressLabel).toBe("93% done");
  });

  it("prompts weekly chest progress before profile completion", () => {
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activityHistory: [weeklyAward],
        dailyAward: lowAward,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Sync movement",
      target: "weeklyChest",
      title: "Push weekly chest",
    });
    expect(action.progressLabel).toBe("86% filled");
  });

  it("prompts claiming a ready weekly chest", () => {
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activityHistory: [readyWeeklyAward],
        dailyAward: lowAward,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Claim chest",
      target: "claimWeeklyChest",
      title: "Claim weekly chest",
    });
  });

  it("does not fall back to tomorrow when a ready legacy active egg exists", () => {
    const pal = getPal({
      trainingSessions: [
        "2026-06-06T08:00:00.000Z",
        "2026-06-06T09:00:00.000Z",
        "2026-06-06T10:00:00.000Z",
      ],
    });
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeEgg: {
          ...initialHatchUpData.activeEgg,
          stepsWalked: initialHatchUpData.activeEgg.stepsRequired,
        },
        activeEggs: [],
        activeHatchlingId: pal.id,
        collection: [pal],
        currentStreak: 3,
        dailyAward: award,
        profileHatchlingId: pal.id,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Hatch Egg",
      target: "hatchery",
      title: "Hatch Egg",
    });
  });

  it("does not fall back to tomorrow while training remains", () => {
    const pal = getPal({
      trainingSessions: ["2026-06-06T08:00:00.000Z"],
    });
    const action = getNextBestAction(
      {
        ...initialHatchUpData,
        activeHatchlingId: pal.id,
        collection: [pal],
        currentStreak: 3,
        dailyAward: award,
        profileHatchlingId: pal.id,
        profileUsername: "SprigFan",
      },
      { now, todayKey },
    );

    expect(action).toMatchObject({
      ctaLabel: "Train Pal",
      target: "collection",
      title: "Train Pal",
    });
  });
});

const award: DailyAward = {
  date: todayKey,
  health: {
    activeCalories: 150,
    date: todayKey,
    distanceMeters: 3200,
    source: "mock",
    steps: 4200,
    workouts: 1,
  },
  xp: {
    activeCalories: 15,
    firstSync: 15,
    quests: 0,
    steps: 42,
    total: 102,
    workouts: 30,
  },
};

const lowAward: DailyAward = {
  date: todayKey,
  health: {
    activeCalories: 25,
    date: todayKey,
    distanceMeters: 300,
    source: "mock",
    steps: 500,
    workouts: 0,
  },
  xp: {
    activeCalories: 2,
    firstSync: 15,
    quests: 0,
    steps: 5,
    total: 22,
    workouts: 0,
  },
};

const closeQuestAward: DailyAward = {
  ...lowAward,
  health: {
    ...lowAward.health,
    distanceMeters: 2200,
    steps: 2800,
  },
};

const weeklyAward: DailyAward = {
  ...lowAward,
  date: "2026-06-03",
  health: {
    ...lowAward.health,
    date: "2026-06-03",
    steps: 30000,
  },
};

const readyWeeklyAward: DailyAward = {
  ...weeklyAward,
  health: {
    ...weeklyAward.health,
    steps: 35000,
  },
};

function getPal(
  overrides: Partial<CollectedHatchling> = {},
): CollectedHatchling {
  return {
    bond: 50,
    element: "leaf",
    hatchedAt: "2026-06-05T12:00:00.000Z",
    id: "pal-1",
    lastInteractionAt: "2026-06-06T07:00:00.000Z",
    level: 2,
    memories: [],
    mood: "happy",
    name: "Sprig",
    rarity: "common",
    stats: {
      heart: 5,
      power: 5,
      resilience: 5,
      speed: 5,
    },
    trainingSessions: [],
    xp: 100,
    ...overrides,
  };
}
