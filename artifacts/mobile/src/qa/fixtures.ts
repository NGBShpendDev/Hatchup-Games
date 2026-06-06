import { addStepsToEggs, createEgg, createStarterEgg } from "../domain/hatchery";
import { createHatchlingFromEgg, getHatchlingLevel } from "../domain/hatchlings";
import {
  initialHatchUpData,
  type CollectedHatchling,
  type DailyAward,
  type EggElement,
  type EggRarity,
  type HatchUpData,
  type IncubatorEgg,
} from "../domain/models";
import { ACTIVE_PROGRESSION_PROFILE } from "../domain/progressionConfig";
import { calculateDailyXp } from "../domain/xp";

export type QaFixtureId =
  | "new-user-no-sync"
  | "synced-today-no-pal"
  | "egg-ready"
  | "first-pal-hatched"
  | "active-pal-selected"
  | "collection-several-pals"
  | "private-leaderboard"
  | "shared-leaderboard"
  | "health-permission-denied"
  | "mock-mode";

export interface QaFixture {
  description: string;
  id: QaFixtureId;
  title: string;
  data: HatchUpData;
}

export function getQaFixtures(today: string): QaFixture[] {
  const base = getBaseData();
  const syncedAward = createAward(today, 4200, 180, 1);
  const syncedEggs = addStepsToEggs(base.activeEggs, 4200);
  const syncedNoPal = {
    ...base,
    accountXp: syncedAward.xp.total,
    activeEgg: syncedEggs[0],
    activeEggs: syncedEggs,
    activityHistory: [syncedAward],
    currentStreak: 1,
    dailyAward: syncedAward,
    lastRewardDate: today,
    lastSyncedDate: `${today}T12:00:00.000Z`,
    longestStreak: 1,
    totalXp: syncedAward.xp.total,
  };
  const readyEggs = base.activeEggs.map((egg, index) =>
    index === 0 ? { ...egg, stepsWalked: egg.stepsRequired } : egg,
  );
  const firstPal = createPal({
    element: "leaf",
    hatchedAt: `${today}T12:05:00.000Z`,
    index: 1,
    rarity: "common",
    xp: 80,
  });
  const activePal = {
    ...firstPal,
    bond: 28,
    level: getHatchlingLevel(260),
    name: "Sprig",
    xp: 260,
  };
  const severalPals = [
    activePal,
    createPal({ element: "ember", index: 2, rarity: "uncommon", xp: 190 }),
    createPal({ element: "tide", index: 3, rarity: "rare", xp: 520 }),
    createPal({ element: "storm", index: 4, rarity: "epic", xp: 860 }),
  ];
  const collectionData: HatchUpData = {
    ...syncedNoPal,
    activeHatchlingId: activePal.id,
    collection: severalPals,
    eggsHatched: severalPals.length,
    profileHatchlingId: activePal.id,
    profileTagline: "Growing a tiny team one walk at a time.",
    profileUsername: "GardenRunner",
  };

  return [
    {
      id: "new-user-no-sync",
      title: "New user, no sync",
      description: "Starter Egg exists, but no movement has been synced.",
      data: base,
    },
    {
      id: "synced-today-no-pal",
      title: "Synced today, no Pal",
      description: "Movement landed as Journey XP and Egg progress before first hatch.",
      data: syncedNoPal,
    },
    {
      id: "egg-ready",
      title: "Egg ready",
      description: "One Egg is ready so Home and Hatchery should point to hatch.",
      data: {
        ...syncedNoPal,
        activeEgg: readyEggs[0],
        activeEggs: readyEggs,
      },
    },
    {
      id: "first-pal-hatched",
      title: "First Pal hatched",
      description: "A first Pal exists, with Collection and profile still sparse.",
      data: {
        ...syncedNoPal,
        activeHatchlingId: firstPal.id,
        collection: [firstPal],
        eggsHatched: 1,
      },
    },
    {
      id: "active-pal-selected",
      title: "Active Pal selected",
      description: "A named active Pal has XP, bond, and a profile slot.",
      data: {
        ...syncedNoPal,
        activeHatchlingId: activePal.id,
        collection: [activePal],
        eggsHatched: 1,
        profileHatchlingId: activePal.id,
      },
    },
    {
      id: "collection-several-pals",
      title: "Collection with several Pals",
      description: "Multiple elements and rarities are discovered for grid QA.",
      data: collectionData,
    },
    {
      id: "private-leaderboard",
      title: "Private leaderboard",
      description: "Ranks are available, but sharing is off.",
      data: {
        ...collectionData,
        leaderboardAlias: "GardenRunner",
        leaderboardShareEnabled: false,
      },
    },
    {
      id: "shared-leaderboard",
      title: "Shared leaderboard",
      description: "Weekly score sharing is enabled with a public name.",
      data: {
        ...collectionData,
        leaderboardAlias: "GardenRunner",
        leaderboardShareEnabled: true,
      },
    },
    {
      id: "health-permission-denied",
      title: "Health permission denied",
      description: "Health is not connected, but local data remains usable.",
      data: {
        ...base,
        healthConnected: false,
        lastSyncedDate: null,
      },
    },
    {
      id: "mock-mode",
      title: "Mock mode",
      description: "Mock health source with a synced day for offline/dev QA.",
      data: {
        ...syncedNoPal,
        healthConnected: true,
        dailyAward: {
          ...syncedAward,
          health: { ...syncedAward.health, source: "mock" },
        },
      },
    },
  ];
}

export function getQaFixtureById(id: QaFixtureId, today: string) {
  return getQaFixtures(today).find((fixture) => fixture.id === id);
}

function getBaseData(): HatchUpData {
  const starterEgg = createStarterEgg("leaf", ACTIVE_PROGRESSION_PROFILE);
  const activeEggs = [
    starterEgg,
    createEgg(101, ACTIVE_PROGRESSION_PROFILE),
    createEgg(202, ACTIVE_PROGRESSION_PROFILE),
  ];

  return {
    ...initialHatchUpData,
    activeEgg: activeEggs[0],
    activeEggs,
    healthConnected: true,
    monsterName: "Sprig",
    onboardingStatus: "complete",
    starterEggElement: "leaf",
  };
}

function createAward(
  date: string,
  steps: number,
  activeCalories: number,
  workouts: number,
): DailyAward {
  const health = {
    activeCalories,
    date,
    distanceMeters: Math.round(steps * 0.76),
    source: "mock" as const,
    steps,
    workouts,
  };

  return {
    date,
    health,
    xp: calculateDailyXp(health, { firstSyncOfDay: true }),
  };
}

function createPal({
  element,
  hatchedAt = "2026-06-01T12:00:00.000Z",
  index,
  rarity,
  xp,
}: {
  element: EggElement;
  hatchedAt?: string;
  index: number;
  rarity: EggRarity;
  xp: number;
}): CollectedHatchling {
  const egg: IncubatorEgg = {
    element,
    id: `fixture-egg-${index}`,
    rarity,
    stepsRequired: 1000,
    stepsWalked: 1000,
  };
  const hatchling = createHatchlingFromEgg({ egg, hatchedAt, index });
  const level = getHatchlingLevel(xp);

  return {
    ...hatchling,
    bond: Math.min(95, 12 + index * 10),
    level,
    stats: {
      heart: hatchling.stats.heart + level,
      power: hatchling.stats.power + level,
      resilience: hatchling.stats.resilience + level,
      speed: hatchling.stats.speed + level,
    },
    xp,
  };
}
