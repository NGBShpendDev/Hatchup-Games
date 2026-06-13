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
        dailyAward: award,
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
