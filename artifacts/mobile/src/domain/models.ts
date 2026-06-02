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
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: OnboardingStatus;
  healthConnected: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
  activeEgg: IncubatorEgg;
  collection: CollectedHatchling[];
  eggsHatched: number;
}

export const initialHatchUpData: HatchUpData = {
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  healthConnected: false,
  lastRewardDate: null,
  dailyAward: null,
  activeEgg: {
    id: "egg-1",
    element: "leaf",
    rarity: "common",
    stepsRequired: 5000,
    stepsWalked: 0,
  },
  collection: [],
  eggsHatched: 0,
};
