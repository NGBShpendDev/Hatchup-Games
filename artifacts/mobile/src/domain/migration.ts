import {
  initialHatchUpData,
  type DailyAward,
  type DailyXp,
  type HatchUpData,
  type IncubatorEgg,
} from "./models";
import { createEgg, MAX_ACTIVE_EGGS } from "./hatchery";
import { normalizeHatchling } from "./hatchlings";
import {
  ACTIVE_PROGRESSION_PROFILE,
  getEggStepsRequired,
} from "./progressionConfig";

export const DATA_SCHEMA_VERSION = 8;

function normalizeXp(xp: Partial<DailyXp> | undefined): DailyXp {
  return {
    steps: xp?.steps ?? 0,
    activeCalories: xp?.activeCalories ?? 0,
    workouts: xp?.workouts ?? 0,
    quests: xp?.quests ?? 0,
    firstSync: xp?.firstSync ?? 0,
    total: xp?.total ?? 0,
  };
}

function normalizeAward(award: DailyAward): DailyAward {
  return {
    ...award,
    xp: normalizeXp(award.xp),
  };
}

function normalizeEgg(egg: IncubatorEgg | undefined): IncubatorEgg {
  const next = { ...initialHatchUpData.activeEgg, ...egg };
  const stepsRequired = getEggStepsRequired(next.rarity);

  return {
    ...next,
    stepsRequired,
    stepsWalked: Math.min(Math.max(next.stepsWalked, 0), stepsRequired),
  };
}

function normalizeEggs(stored: Partial<HatchUpData>): IncubatorEgg[] {
  const isLegacySingleEggSave =
    (stored.schemaVersion ?? 1) < 3 && stored.activeEgg !== undefined;
  const existingEggs = isLegacySingleEggSave
    ? [stored.activeEgg!]
    : stored.activeEggs && stored.activeEggs.length > 0
      ? stored.activeEggs
      : stored.activeEgg
        ? [stored.activeEgg]
        : initialHatchUpData.activeEggs;
  const normalized = existingEggs.slice(0, MAX_ACTIVE_EGGS).map(normalizeEgg);

  while (normalized.length < MAX_ACTIVE_EGGS) {
    normalized.push(createEgg((stored.eggsHatched ?? 0) + normalized.length + 1));
  }

  return normalized;
}

export function migrateHatchUpData(
  stored: Partial<HatchUpData> | null | undefined,
): HatchUpData {
  if (!stored) {
    return {
      ...initialHatchUpData,
      accountId: createLocalId("account"),
      leaderboardId: createLeaderboardId(),
    };
  }
  const activeEggs = normalizeEggs(stored);

  return {
    ...initialHatchUpData,
    ...stored,
    schemaVersion: DATA_SCHEMA_VERSION,
    progressionProfile: ACTIVE_PROGRESSION_PROFILE.id,
    accountId: stored.accountId ?? createLocalId("account"),
    accountMode: stored.accountMode ?? "local",
    analyticsEnabled: stored.analyticsEnabled ?? false,
    cloudSyncEnabled: stored.cloudSyncEnabled ?? false,
    cloudSyncStatus: stored.cloudSyncStatus ?? "localOnly",
    crashReportingEnabled: stored.crashReportingEnabled ?? true,
    lastCloudSyncedAt: stored.lastCloudSyncedAt ?? null,
    privacyConsentVersion:
      stored.privacyConsentVersion ?? initialHatchUpData.privacyConsentVersion,
    profileHatchlingId: stored.profileHatchlingId ?? null,
    profileTagline: stored.profileTagline ?? "",
    profileUsername:
      stored.profileUsername ??
      stored.leaderboardAlias ??
      stored.monsterName ??
      "",
    starterEggElement: stored.starterEggElement ?? null,
    weeklyGoalSteps: stored.weeklyGoalSteps ?? initialHatchUpData.weeklyGoalSteps,
    leaderboardAlias: stored.leaderboardAlias ?? "",
    leaderboardId: stored.leaderboardId ?? createLeaderboardId(),
    leaderboardShareEnabled: stored.leaderboardShareEnabled ?? false,
    activeEgg: activeEggs[0],
    activeEggs,
    activeHatchlingId:
      stored.activeHatchlingId ?? stored.collection?.[0]?.id ?? null,
    dailyAward: stored.dailyAward ? normalizeAward(stored.dailyAward) : null,
    activityHistory: (stored.activityHistory ?? []).map(normalizeAward),
    collection: (stored.collection ?? []).map((hatchling, index) =>
      normalizeHatchling(hatchling, index + 1),
    ),
    eventEggsAwarded: stored.eventEggsAwarded ?? [],
    milestoneEggsAwarded: stored.milestoneEggsAwarded ?? [],
    pendingEggs: (stored.pendingEggs ?? []).map(normalizeEgg),
  };
}

function createLeaderboardId() {
  return createLocalId("leaderboard");
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
