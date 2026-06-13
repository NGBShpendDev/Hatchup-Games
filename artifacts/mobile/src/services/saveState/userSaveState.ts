import { DATA_SCHEMA_VERSION, migrateHatchUpData } from "../../domain/migration";
import { getBadges } from "../../domain/badges";
import type {
  CollectedHatchling,
  CosmeticUnlock,
  DailyAward,
  EconomyRewardReceipt,
  HatchUpData,
  InventoryItemStack,
  IncubatorEgg,
  OnboardingStatus,
  OnboardingTutorialStep,
  QuestRewardReceipt,
  ShopPurchaseReceipt,
} from "../../domain/models";

export const USER_SAVE_STATE_VERSION = 1;

export interface UserSaveState {
  appData: HatchUpData;
  collection: {
    completionPercent: number;
    eggsHatched: number;
    ownedCount: number;
    pendingEggs: IncubatorEgg[];
  };
  createdAt: string;
  eggs: {
    activeEgg: IncubatorEgg;
    activeEggs: IncubatorEgg[];
    incubatorSlots: IncubatorEgg[];
    pendingEggs: IncubatorEgg[];
  };
  economy: {
    chestProgress: number;
    cosmetics: CosmeticUnlock[];
    inventoryItems: InventoryItemStack[];
    rewardHistory: EconomyRewardReceipt[];
  };
  leaderboard: {
    alias: string;
    id: string;
    shareEnabled: boolean;
  };
  movement: {
    history: DailyAward[];
    lastSyncedDate: string | null;
  };
  onboarding: {
    completed: boolean;
    status: OnboardingStatus;
    step: OnboardingTutorialStep | null;
  };
  pals: {
    activePalId: string | null;
    ownedPals: CollectedHatchling[];
    profilePalId: string | null;
  };
  progress: {
    daily: DailyAward | null;
    journeyXp: number;
    weeklyGoalSteps: number;
  };
  profile: {
    accountId: string;
    note: string;
    privacyConsentVersion: string;
    username: string;
  };
  quests: {
    claimedRewardChests: string[];
    claimedRewards: string[];
    rewardHistory: QuestRewardReceipt[];
    shopPurchaseHistory: ShopPurchaseReceipt[];
  };
  saveVersion: number;
  savedAt: string;
  streaks: {
    current: number;
    lastRewardDate: string | null;
    longest: number;
  };
  badges: {
    total: number;
    unlocked: string[];
  };
  settings: {
    accountMode: HatchUpData["accountMode"];
    analyticsEnabled: boolean;
    cloudSyncEnabled: boolean;
    cloudSyncStatus: HatchUpData["cloudSyncStatus"];
    crashReportingEnabled: boolean;
    healthConnected: boolean;
    lastCloudSyncedAt: string | null;
  };
}

export function createUserSaveState(
  data: HatchUpData,
  savedAt = new Date().toISOString(),
): UserSaveState {
  const migrated = migrateHatchUpData(data);
  const badges = getBadges(migrated, savedAt.slice(0, 10));

  return {
    appData: migrated,
    badges: {
      total: badges.length,
      unlocked: badges.filter((badge) => badge.unlocked).map((badge) => badge.id),
    },
    collection: {
      completionPercent: getCollectionCompletionPercent(migrated),
      eggsHatched: migrated.eggsHatched,
      ownedCount: migrated.collection.length,
      pendingEggs: migrated.pendingEggs,
    },
    createdAt: getCreatedAt(migrated, savedAt),
    eggs: {
      activeEgg: migrated.activeEgg,
      activeEggs: migrated.activeEggs,
      incubatorSlots: migrated.activeEggs,
      pendingEggs: migrated.pendingEggs,
    },
    economy: {
      chestProgress: migrated.chestProgress,
      cosmetics: migrated.cosmeticUnlocks,
      inventoryItems: migrated.inventoryItems,
      rewardHistory: migrated.economyRewardHistory,
    },
    leaderboard: {
      alias: migrated.leaderboardAlias,
      id: migrated.leaderboardId,
      shareEnabled: migrated.leaderboardShareEnabled,
    },
    movement: {
      history: migrated.activityHistory,
      lastSyncedDate: migrated.lastSyncedDate,
    },
    onboarding: {
      completed: migrated.onboardingStatus === "complete",
      status: migrated.onboardingStatus,
      step: migrated.onboardingStep,
    },
    pals: {
      activePalId: migrated.activeHatchlingId,
      ownedPals: migrated.collection,
      profilePalId: migrated.profileHatchlingId,
    },
    profile: {
      accountId: migrated.accountId,
      note: migrated.profileTagline,
      privacyConsentVersion: migrated.privacyConsentVersion,
      username: migrated.profileUsername || migrated.monsterName,
    },
    progress: {
      daily: migrated.dailyAward,
      journeyXp: migrated.totalXp,
      weeklyGoalSteps: migrated.weeklyGoalSteps,
    },
    quests: {
      claimedRewardChests: migrated.claimedRewardChests,
      claimedRewards: migrated.claimedQuestRewards,
      rewardHistory: migrated.questRewardHistory,
      shopPurchaseHistory: migrated.shopPurchaseHistory,
    },
    saveVersion: USER_SAVE_STATE_VERSION,
    savedAt,
    settings: {
      accountMode: migrated.accountMode,
      analyticsEnabled: migrated.analyticsEnabled,
      cloudSyncEnabled: migrated.cloudSyncEnabled,
      cloudSyncStatus: migrated.cloudSyncStatus,
      crashReportingEnabled: migrated.crashReportingEnabled,
      healthConnected: migrated.healthConnected,
      lastCloudSyncedAt: migrated.lastCloudSyncedAt,
    },
    streaks: {
      current: migrated.currentStreak,
      lastRewardDate: migrated.lastRewardDate,
      longest: migrated.longestStreak,
    },
  };
}

export function hydrateHatchUpDataFromSaveState(
  raw: unknown,
): HatchUpData {
  return migrateHatchUpData(extractHatchUpData(raw));
}

export function migrateUserSaveState(raw: unknown): UserSaveState {
  return createUserSaveState(hydrateHatchUpDataFromSaveState(raw));
}

export function extractHatchUpData(raw: unknown): Partial<HatchUpData> | null {
  if (!isRecord(raw)) return null;

  if (isRecord(raw.appData)) {
    return raw.appData as Partial<HatchUpData>;
  }

  if (typeof raw.schemaVersion === "number") {
    return raw as Partial<HatchUpData>;
  }

  return composeDataFromStructuredSave(raw);
}

export function serializeUserSaveState(data: HatchUpData) {
  return JSON.stringify(createUserSaveState(data));
}

function composeDataFromStructuredSave(
  raw: Record<string, unknown>,
): Partial<HatchUpData> | null {
  const profile = isRecord(raw.profile) ? raw.profile : {};
  const pals = isRecord(raw.pals) ? raw.pals : {};
  const eggs = isRecord(raw.eggs) ? raw.eggs : {};
  const quests = isRecord(raw.quests) ? raw.quests : {};
  const economy = isRecord(raw.economy) ? raw.economy : {};
  const progress = isRecord(raw.progress) ? raw.progress : {};
  const movement = isRecord(raw.movement) ? raw.movement : {};
  const streaks = isRecord(raw.streaks) ? raw.streaks : {};
  const leaderboard = isRecord(raw.leaderboard) ? raw.leaderboard : {};
  const onboarding = isRecord(raw.onboarding) ? raw.onboarding : {};
  const settings = isRecord(raw.settings) ? raw.settings : {};

  return {
    accountId: getString(profile.accountId),
    accountMode: getString(settings.accountMode) as HatchUpData["accountMode"],
    activeEgg: eggs.activeEgg as IncubatorEgg | undefined,
    activeEggs: eggs.activeEggs as IncubatorEgg[] | undefined,
    activeHatchlingId: getNullableString(pals.activePalId),
    activityHistory: movement.history as DailyAward[] | undefined,
    analyticsEnabled: getBoolean(settings.analyticsEnabled),
    chestProgress: getNumber(economy.chestProgress),
    claimedQuestRewards: quests.claimedRewards as string[] | undefined,
    claimedRewardChests: quests.claimedRewardChests as string[] | undefined,
    cloudSyncEnabled: getBoolean(settings.cloudSyncEnabled),
    cloudSyncStatus: getString(
      settings.cloudSyncStatus,
    ) as HatchUpData["cloudSyncStatus"],
    collection: pals.ownedPals as CollectedHatchling[] | undefined,
    cosmeticUnlocks: economy.cosmetics as CosmeticUnlock[] | undefined,
    crashReportingEnabled: getBoolean(settings.crashReportingEnabled),
    currentStreak: getNumber(streaks.current),
    dailyAward: progress.daily as DailyAward | null | undefined,
    economyRewardHistory:
      economy.rewardHistory as EconomyRewardReceipt[] | undefined,
    healthConnected: getBoolean(settings.healthConnected),
    inventoryItems: economy.inventoryItems as InventoryItemStack[] | undefined,
    lastCloudSyncedAt: getNullableString(settings.lastCloudSyncedAt),
    lastRewardDate: getNullableString(streaks.lastRewardDate),
    lastSyncedDate: getNullableString(movement.lastSyncedDate),
    leaderboardAlias: getString(leaderboard.alias),
    leaderboardId: getString(leaderboard.id),
    leaderboardShareEnabled: getBoolean(leaderboard.shareEnabled),
    longestStreak: getNumber(streaks.longest),
    monsterName: getString(profile.username),
    onboardingStatus: getString(onboarding.status) as OnboardingStatus,
    onboardingStep: onboarding.step as OnboardingTutorialStep | null | undefined,
    pendingEggs: eggs.pendingEggs as IncubatorEgg[] | undefined,
    privacyConsentVersion: getString(profile.privacyConsentVersion),
    profileHatchlingId: getNullableString(pals.profilePalId),
    profileTagline: getString(profile.note),
    profileUsername: getString(profile.username),
    questRewardHistory: quests.rewardHistory as QuestRewardReceipt[] | undefined,
    schemaVersion: DATA_SCHEMA_VERSION,
    shopPurchaseHistory: quests.shopPurchaseHistory as ShopPurchaseReceipt[] | undefined,
    totalXp: getNumber(progress.journeyXp),
    weeklyGoalSteps: getNumber(progress.weeklyGoalSteps),
  };
}

function getCollectionCompletionPercent(data: HatchUpData) {
  const discovered = new Set(
    data.collection.map((pal) => `${pal.element}:${pal.rarity}`),
  ).size;
  return Math.min(discovered / 16, 1);
}

function getCreatedAt(data: HatchUpData, fallback: string) {
  return data.collection[data.collection.length - 1]?.hatchedAt ?? fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined;
function getString(value: unknown, fallback: string): string;
function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
