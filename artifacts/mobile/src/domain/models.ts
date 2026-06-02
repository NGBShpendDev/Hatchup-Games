import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
  type ProgressionProfileId,
} from "./progressionConfig";

export type OnboardingStatus = "notStarted" | "monsterCreated" | "complete";

export type HealthSource = "mock" | "appleHealth" | "healthConnect";

export interface DailyHealthSummary {
  date: string;
  steps: number;
  activeCalories: number;
  workouts: number;
  source: HealthSource;
}

export interface DailyXp {
  steps: number;
  activeCalories: number;
  workouts: number;
  quests: number;
  firstSync: number;
  total: number;
}

export interface DailyAward {
  date: string;
  xp: DailyXp;
  health: DailyHealthSummary;
}

export type EggRarity = "common" | "uncommon" | "rare" | "epic";

export type EggElement = "leaf" | "ember" | "tide" | "storm";

export interface IncubatorEgg {
  id: string;
  element: EggElement;
  rarity: EggRarity;
  stepsRequired: number;
  stepsWalked: number;
}

export interface CollectedHatchling {
  id: string;
  name: string;
  element: EggElement;
  rarity: EggRarity;
  hatchedAt: string;
}

export interface HatchUpData {
  schemaVersion: number;
  progressionProfile: ProgressionProfileId;
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: OnboardingStatus;
  healthConnected: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
  activityHistory: DailyAward[];
  activeEgg: IncubatorEgg;
  collection: CollectedHatchling[];
  eggsHatched: number;
}

export const initialHatchUpData: HatchUpData = {
  schemaVersion: 2,
  progressionProfile: ACTIVE_PROGRESSION_PROFILE.id,
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  healthConnected: false,
  lastRewardDate: null,
  dailyAward: null,
  activityHistory: [],
  activeEgg: {
    id: "egg-1",
    element: "leaf",
    rarity: "common",
    stepsRequired: getEggStepsRequired("common"),
    stepsWalked: 0,
  },
  collection: [],
  eggsHatched: 0,
};
