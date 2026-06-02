import type { EggRarity } from "./models";

export type ProgressionProfileId = "beta" | "market";

export interface ProgressionProfile {
  id: ProgressionProfileId;
  label: string;
  xp: {
    stepsPerXp: number;
    stepsMax: number;
    activeCaloriesPerXp: number;
    activeCaloriesMax: number;
    workoutXp: number;
    workoutsMax: number;
    questXp: number;
    firstSyncXp: number;
    dailyMax: number;
  };
  stages: {
    egg: number;
    baby: number;
    teen: number;
    final: number;
  };
  questTargets: {
    steps: number;
    activeCalories: number;
    workouts: number;
  };
  eggStepsByRarity: Record<EggRarity, number>;
}

export const PROGRESSION_PROFILES: Record<
  ProgressionProfileId,
  ProgressionProfile
> = {
  beta: {
    id: "beta",
    label: "Accelerated beta",
    xp: {
      stepsPerXp: 100,
      stepsMax: 80,
      activeCaloriesPerXp: 10,
      activeCaloriesMax: 40,
      workoutXp: 30,
      workoutsMax: 60,
      questXp: 20,
      firstSyncXp: 15,
      dailyMax: 240,
    },
    stages: {
      egg: 0,
      baby: 60,
      teen: 200,
      final: 500,
    },
    questTargets: {
      steps: 3000,
      activeCalories: 150,
      workouts: 1,
    },
    eggStepsByRarity: {
      common: 1500,
      uncommon: 2500,
      rare: 3500,
      epic: 5000,
    },
  },
  market: {
    id: "market",
    label: "Market baseline",
    xp: {
      stepsPerXp: 250,
      stepsMax: 40,
      activeCaloriesPerXp: 25,
      activeCaloriesMax: 20,
      workoutXp: 20,
      workoutsMax: 40,
      questXp: 0,
      firstSyncXp: 0,
      dailyMax: 100,
    },
    stages: {
      egg: 0,
      baby: 200,
      teen: 700,
      final: 1500,
    },
    questTargets: {
      steps: 10000,
      activeCalories: 500,
      workouts: 1,
    },
    eggStepsByRarity: {
      common: 5000,
      uncommon: 7000,
      rare: 9000,
      epic: 12000,
    },
  },
};

const configuredProfile = process.env.EXPO_PUBLIC_PROGRESSION_PROFILE;

export const ACTIVE_PROGRESSION_PROFILE =
  configuredProfile === "market"
    ? PROGRESSION_PROFILES.market
    : PROGRESSION_PROFILES.beta;

export function getEggStepsRequired(
  rarity: EggRarity,
  profile = ACTIVE_PROGRESSION_PROFILE,
) {
  return profile.eggStepsByRarity[rarity];
}
