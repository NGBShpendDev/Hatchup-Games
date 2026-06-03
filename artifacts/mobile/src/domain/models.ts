import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
  type ProgressionProfileId,
} from "./progressionConfig";

export type OnboardingStatus = "notStarted" | "monsterCreated" | "complete";

export type HealthSource = "mock" | "appleHealth" | "healthConnect";

export type AccountMode = "local" | "remote";

export type CloudSyncStatus = "localOnly" | "synced" | "pending" | "failed";

export interface DailyHealthSummary {
  date: string;
  steps: number;
  distanceMeters?: number;
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
  accountId: string;
  accountMode: AccountMode;
  analyticsEnabled: boolean;
  cloudSyncEnabled: boolean;
  cloudSyncStatus: CloudSyncStatus;
  crashReportingEnabled: boolean;
  lastCloudSyncedAt: string | null;
  privacyConsentVersion: string;
  weeklyGoalSteps: number;
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: OnboardingStatus;
  healthConnected: boolean;
  leaderboardAlias: string;
  leaderboardId: string;
  leaderboardShareEnabled: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
  activityHistory: DailyAward[];
  activeEgg: IncubatorEgg;
  activeEggs: IncubatorEgg[];
  collection: CollectedHatchling[];
  eggsHatched: number;
}

const starterEggs: IncubatorEgg[] = [
  {
    id: "egg-1",
    element: "leaf",
    rarity: "common",
    stepsRequired: getEggStepsRequired("common"),
    stepsWalked: 0,
  },
  {
    id: "egg-2",
    element: "ember",
    rarity: "common",
    stepsRequired: getEggStepsRequired("common"),
    stepsWalked: 0,
  },
  {
    id: "egg-3",
    element: "tide",
    rarity: "uncommon",
    stepsRequired: getEggStepsRequired("uncommon"),
    stepsWalked: 0,
  },
];

export const initialHatchUpData: HatchUpData = {
  schemaVersion: 4,
  progressionProfile: ACTIVE_PROGRESSION_PROFILE.id,
  accountId: "local-beta-account",
  accountMode: "local",
  analyticsEnabled: false,
  cloudSyncEnabled: false,
  cloudSyncStatus: "localOnly",
  crashReportingEnabled: true,
  lastCloudSyncedAt: null,
  privacyConsentVersion: "2026-06-beta",
  weeklyGoalSteps: 35000,
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  healthConnected: false,
  leaderboardAlias: "",
  leaderboardId: "local-beta-player",
  leaderboardShareEnabled: false,
  lastRewardDate: null,
  dailyAward: null,
  activityHistory: [],
  activeEgg: starterEggs[0],
  activeEggs: starterEggs,
  collection: [],
  eggsHatched: 0,
};
