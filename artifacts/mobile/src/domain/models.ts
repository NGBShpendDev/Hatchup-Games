import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
  type ProgressionProfileId,
} from "./progressionConfig";

export type OnboardingStatus = "notStarted" | "monsterCreated" | "complete";

export type OnboardingTutorialStep =
  | "username"
  | "starterEgg"
  | "syncMovement"
  | "hatchPal"
  | "setActivePal"
  | "trainPal"
  | "rewardSummary";

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

export interface QuestRewardReceipt {
  cadence: string;
  claimedAt: string;
  id: string;
  label: string;
  questId: string;
  rewardAccountXp: number;
  rewardBond?: number;
  rewardChestProgress?: number;
  rewardCoins: number;
  rewardCosmetics?: CosmeticRewardId[];
  rewardEggSteps: number;
  rewardItems?: EconomyItemId[];
  tier: number;
}

export interface ShopPurchaseReceipt {
  boughtAt: string;
  id: string;
  itemId: string;
  label: string;
  priceCoins: number;
}

export type EconomyItemId =
  | "pal-snack"
  | "training-token"
  | "egg-booster"
  | "lucky-charm";

export type CosmeticRewardId =
  | "profile-frame-garden-gold"
  | "badge-style-sunlit"
  | "pal-card-background-meadow";

export type CosmeticRewardType =
  | "profileFrame"
  | "badgeStyle"
  | "palCardBackground";

export interface InventoryItemStack {
  id: EconomyItemId;
  quantity: number;
}

export interface CosmeticUnlock {
  id: CosmeticRewardId;
  type: CosmeticRewardType;
  unlockedAt: string;
}

export type EconomyRewardSource =
  | "sync"
  | "quest"
  | "training"
  | "hatch"
  | "weeklyChest"
  | "shop";

export interface EconomyRewardReceipt {
  accountXp: number;
  bond: number;
  chestProgress: number;
  coins: number;
  cosmeticIds: CosmeticRewardId[];
  createdAt: string;
  eggSteps: number;
  id: string;
  itemIds: EconomyItemId[];
  label: string;
  palXp: number;
  source: EconomyRewardSource;
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

export interface HatchlingStats {
  heart: number;
  power: number;
  resilience: number;
  speed: number;
}

export interface HatchlingMemory {
  description: string;
  happenedAt: string;
  id: string;
  label: string;
}

export interface CollectedHatchling {
  bond: number;
  id: string;
  lastInteractionAt: string | null;
  memories: HatchlingMemory[];
  name: string;
  element: EggElement;
  mood: HatchlingMood;
  rarity: EggRarity;
  hatchedAt: string;
  level: number;
  stats: HatchlingStats;
  traitId?: PalTraitId;
  trainingSessions: string[];
  xp: number;
}

export type HatchlingMood = "happy" | "excited" | "sleepy" | "lonely";

export type PalTraitId =
  | "brave"
  | "curious"
  | "energetic"
  | "loyal"
  | "playful"
  | "sleepy";

export interface HatchUpData {
  schemaVersion: number;
  progressionProfile: ProgressionProfileId;
  accountId: string;
  accountXp: number;
  accountMode: AccountMode;
  analyticsEnabled: boolean;
  cloudSyncEnabled: boolean;
  cloudSyncStatus: CloudSyncStatus;
  crashReportingEnabled: boolean;
  lastCloudSyncedAt: string | null;
  privacyConsentVersion: string;
  profileHatchlingId: string | null;
  profileTagline: string;
  profileUsername: string;
  starterEggElement: EggElement | null;
  weeklyGoalSteps: number;
  monsterName: string;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastSyncedDate: string | null;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingTutorialStep | null;
  healthConnected: boolean;
  coins: number;
  chestProgress: number;
  inventoryItems: InventoryItemStack[];
  cosmeticUnlocks: CosmeticUnlock[];
  economyRewardHistory: EconomyRewardReceipt[];
  claimedQuestRewards: string[];
  claimedRewardChests: string[];
  questRewardHistory: QuestRewardReceipt[];
  shopPurchaseHistory: ShopPurchaseReceipt[];
  leaderboardAlias: string;
  leaderboardId: string;
  leaderboardShareEnabled: boolean;
  lastRewardDate: string | null;
  dailyAward: DailyAward | null;
  activityHistory: DailyAward[];
  activeEgg: IncubatorEgg;
  activeEggs: IncubatorEgg[];
  activeHatchlingId: string | null;
  collection: CollectedHatchling[];
  eggsHatched: number;
  eventEggsAwarded: string[];
  milestoneEggsAwarded: string[];
  pendingEggs: IncubatorEgg[];
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
  schemaVersion: 10,
  progressionProfile: ACTIVE_PROGRESSION_PROFILE.id,
  accountId: "local-beta-account",
  accountXp: 0,
  accountMode: "local",
  analyticsEnabled: false,
  cloudSyncEnabled: false,
  cloudSyncStatus: "localOnly",
  crashReportingEnabled: true,
  lastCloudSyncedAt: null,
  privacyConsentVersion: "2026-06-beta",
  profileHatchlingId: null,
  profileTagline: "",
  profileUsername: "",
  starterEggElement: null,
  weeklyGoalSteps: 35000,
  monsterName: "",
  totalXp: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastSyncedDate: null,
  onboardingStatus: "notStarted",
  onboardingStep: "username",
  healthConnected: false,
  coins: 0,
  chestProgress: 0,
  inventoryItems: [],
  cosmeticUnlocks: [],
  economyRewardHistory: [],
  claimedQuestRewards: [],
  claimedRewardChests: [],
  questRewardHistory: [],
  shopPurchaseHistory: [],
  leaderboardAlias: "",
  leaderboardId: "local-beta-player",
  leaderboardShareEnabled: false,
  lastRewardDate: null,
  dailyAward: null,
  activityHistory: [],
  activeEgg: starterEggs[0],
  activeEggs: starterEggs,
  activeHatchlingId: null,
  collection: [],
  eggsHatched: 0,
  eventEggsAwarded: [],
  milestoneEggsAwarded: [],
  pendingEggs: [],
};
