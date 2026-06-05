import { DATA_SCHEMA_VERSION, migrateHatchUpData } from "../../domain/migration";
import type {
  CollectedHatchling,
  DailyAward,
  HatchUpData,
  IncubatorEgg,
  OnboardingStatus,
} from "../../domain/models";
import { MAX_ACTIVE_EGGS } from "../../domain/hatchery";
import { getSupabaseClient } from "../auth/supabaseClient";

type UntypedSupabaseClient = ReturnType<typeof getSupabaseClient> & {
  // Replace this local bridge with generated Supabase database types once the
  // production project schema is connected to the app.
  from(table: "hatchup_saves"): any;
};

interface HatchUpSaveRow {
  id: string;
  save_data: unknown;
  schema_version: number;
  updated_at: string;
  user_id: string;
}

export interface CloudSavePayload {
  data: HatchUpData;
  schemaVersion: number;
  syncedAt: string;
}

export interface CloudSaveResult {
  accountMode: "local" | "remote";
  data: HatchUpData;
  syncedAt: string | null;
  status: HatchUpData["cloudSyncStatus"];
}

export async function loadCloudSave(
  userId: string,
): Promise<CloudSavePayload | null> {
  const { data, error } = await getUntypedSupabase()
    .from("hatchup_saves")
    .select("id, save_data, schema_version, updated_at, user_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as HatchUpSaveRow;
  return {
    data: migrateHatchUpData(row.save_data as Partial<HatchUpData>),
    schemaVersion: row.schema_version,
    syncedAt: row.updated_at,
  };
}

export async function saveCloudSave(
  userId: string,
  data: HatchUpData,
): Promise<CloudSavePayload> {
  const existing = await loadCloudSave(userId);
  const syncedAt = new Date().toISOString();
  const merged = {
    ...(existing ? mergeLocalAndCloudSave(data, existing.data) : migrateHatchUpData(data)),
    accountId: userId,
    accountMode: "remote" as const,
    cloudSyncEnabled: true,
    cloudSyncStatus: "synced" as const,
    lastCloudSyncedAt: syncedAt,
    schemaVersion: DATA_SCHEMA_VERSION,
  };

  if (existing) {
    const { error } = await getUntypedSupabase()
      .from("hatchup_saves")
      .update({
        save_data: merged,
        schema_version: merged.schemaVersion,
        updated_at: syncedAt,
      })
      .eq("user_id", userId);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await getUntypedSupabase()
      .from("hatchup_saves")
      .insert({
        save_data: merged,
        schema_version: merged.schemaVersion,
        updated_at: syncedAt,
        user_id: userId,
      });

    if (error) throw new Error(error.message);
  }

  return {
    data: merged,
    schemaVersion: merged.schemaVersion,
    syncedAt,
  };
}

export function mergeLocalAndCloudSave(
  localData: HatchUpData,
  cloudData: HatchUpData,
): HatchUpData {
  const local = migrateHatchUpData(localData);
  const cloud = migrateHatchUpData(cloudData);
  const preferred = getSaveScore(local) >= getSaveScore(cloud) ? local : cloud;
  const activityHistory = mergeAwards(local.activityHistory, cloud.activityHistory);
  const collection = mergeHatchlings(local.collection, cloud.collection);
  const activeEggs = mergeEggs(local.activeEggs, cloud.activeEggs).slice(
    0,
    MAX_ACTIVE_EGGS,
  );
  const pendingEggs = mergeEggs(local.pendingEggs, cloud.pendingEggs);
  const activeHatchlingId = chooseExistingHatchlingId(
    local.activeHatchlingId,
    cloud.activeHatchlingId,
    collection,
  );

  return migrateHatchUpData({
    ...preferred,
    accountXp: Math.max(local.accountXp, cloud.accountXp),
    activeEgg: activeEggs[0] ?? preferred.activeEgg,
    activeEggs,
    activeHatchlingId,
    activityHistory,
    analyticsEnabled: local.analyticsEnabled || cloud.analyticsEnabled,
    claimedQuestRewards: mergeStrings(
      local.claimedQuestRewards,
      cloud.claimedQuestRewards,
    ),
    claimedRewardChests: mergeStrings(
      local.claimedRewardChests,
      cloud.claimedRewardChests,
    ),
    cloudSyncEnabled: true,
    cloudSyncStatus: "pending",
    coins: Math.max(local.coins, cloud.coins),
    collection,
    crashReportingEnabled: local.crashReportingEnabled || cloud.crashReportingEnabled,
    currentStreak: Math.max(local.currentStreak, cloud.currentStreak),
    dailyAward: chooseAward(local.dailyAward, cloud.dailyAward),
    eggsHatched: Math.max(local.eggsHatched, cloud.eggsHatched),
    eventEggsAwarded: mergeStrings(local.eventEggsAwarded, cloud.eventEggsAwarded),
    healthConnected: local.healthConnected || cloud.healthConnected,
    lastCloudSyncedAt: chooseLatestIso(
      local.lastCloudSyncedAt,
      cloud.lastCloudSyncedAt,
    ),
    lastRewardDate: chooseLatestDate(local.lastRewardDate, cloud.lastRewardDate),
    lastSyncedDate: chooseLatestDate(local.lastSyncedDate, cloud.lastSyncedDate),
    leaderboardAlias: chooseText(local.leaderboardAlias, cloud.leaderboardAlias),
    leaderboardId: chooseText(local.leaderboardId, cloud.leaderboardId),
    leaderboardShareEnabled:
      local.leaderboardShareEnabled || cloud.leaderboardShareEnabled,
    longestStreak: Math.max(local.longestStreak, cloud.longestStreak),
    milestoneEggsAwarded: mergeStrings(
      local.milestoneEggsAwarded,
      cloud.milestoneEggsAwarded,
    ),
    monsterName: chooseText(local.monsterName, cloud.monsterName),
    onboardingStatus: chooseOnboardingStatus(
      local.onboardingStatus,
      cloud.onboardingStatus,
    ),
    pendingEggs,
    privacyConsentVersion: chooseText(
      local.privacyConsentVersion,
      cloud.privacyConsentVersion,
    ),
    profileHatchlingId: chooseExistingHatchlingId(
      local.profileHatchlingId,
      cloud.profileHatchlingId,
      collection,
    ),
    profileTagline: chooseText(local.profileTagline, cloud.profileTagline),
    profileUsername: chooseText(local.profileUsername, cloud.profileUsername),
    questRewardHistory: mergeByKey(
      local.questRewardHistory,
      cloud.questRewardHistory,
      (item) => `${item.cadence}:${item.questId}:${item.claimedAt}`,
    ),
    schemaVersion: DATA_SCHEMA_VERSION,
    shopPurchaseHistory: mergeByKey(
      local.shopPurchaseHistory,
      cloud.shopPurchaseHistory,
      (item) => `${item.id}:${item.boughtAt}`,
    ),
    starterEggElement: local.starterEggElement ?? cloud.starterEggElement,
    totalXp: Math.max(local.totalXp, cloud.totalXp),
    weeklyGoalSteps: Math.max(local.weeklyGoalSteps, cloud.weeklyGoalSteps),
  });
}

export async function syncCloudSave(
  data: HatchUpData,
  userId: string | null | undefined,
): Promise<CloudSaveResult> {
  if (!userId || !data.cloudSyncEnabled) {
    return {
      accountMode: data.accountMode,
      data,
      status: "localOnly",
      syncedAt: null,
    };
  }

  const result = await saveCloudSave(userId, data);

  return {
    accountMode: "remote",
    data: result.data,
    status: "synced",
    syncedAt: result.syncedAt,
  };
}

function getUntypedSupabase() {
  return getSupabaseClient() as UntypedSupabaseClient;
}

function getSaveScore(data: HatchUpData) {
  return (
    data.totalXp +
    data.accountXp +
    data.coins +
    data.eggsHatched * 25 +
    data.collection.length * 50 +
    data.activeEggs.reduce((total, egg) => total + egg.stepsWalked, 0)
  );
}

function mergeAwards(left: DailyAward[], right: DailyAward[]) {
  const byDate = new Map<string, DailyAward>();

  [...left, ...right].forEach((award) => {
    const existing = byDate.get(award.date);
    byDate.set(award.date, chooseAward(award, existing) ?? award);
  });

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function chooseAward(
  left: DailyAward | null | undefined,
  right: DailyAward | null | undefined,
) {
  if (!left) return right ?? null;
  if (!right) return left;
  if (left.date !== right.date) {
    return left.date.localeCompare(right.date) >= 0 ? left : right;
  }
  return left.xp.total >= right.xp.total ? left : right;
}

function mergeHatchlings(
  left: CollectedHatchling[],
  right: CollectedHatchling[],
) {
  const byId = new Map<string, CollectedHatchling>();

  [...left, ...right].forEach((hatchling) => {
    const existing = byId.get(hatchling.id);
    byId.set(
      hatchling.id,
      existing && existing.xp + existing.level >= hatchling.xp + hatchling.level
        ? existing
        : hatchling,
    );
  });

  return Array.from(byId.values()).sort((a, b) =>
    b.hatchedAt.localeCompare(a.hatchedAt),
  );
}

function mergeEggs(left: IncubatorEgg[], right: IncubatorEgg[]) {
  const byId = new Map<string, IncubatorEgg>();

  [...left, ...right].forEach((egg) => {
    const existing = byId.get(egg.id);
    byId.set(
      egg.id,
      existing && existing.stepsWalked >= egg.stepsWalked ? existing : egg,
    );
  });

  return Array.from(byId.values()).sort(
    (a, b) => b.stepsWalked / b.stepsRequired - a.stepsWalked / a.stepsRequired,
  );
}

function chooseExistingHatchlingId(
  preferredId: string | null,
  fallbackId: string | null,
  collection: CollectedHatchling[],
) {
  const ids = new Set(collection.map((hatchling) => hatchling.id));
  if (preferredId && ids.has(preferredId)) return preferredId;
  if (fallbackId && ids.has(fallbackId)) return fallbackId;
  return collection[0]?.id ?? null;
}

function chooseText(left: string | null | undefined, right: string | null | undefined) {
  return left && left.trim().length > 0 ? left : right && right.trim().length > 0 ? right : "";
}

function chooseLatestIso(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function chooseLatestDate(left: string | null, right: string | null) {
  return chooseLatestIso(left, right);
}

function chooseOnboardingStatus(
  left: OnboardingStatus,
  right: OnboardingStatus,
) {
  const rank: Record<OnboardingStatus, number> = {
    complete: 3,
    monsterCreated: 2,
    notStarted: 1,
  };

  return rank[left] >= rank[right] ? left : right;
}

function mergeStrings(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right]));
}

function mergeByKey<T>(left: T[], right: T[], getKey: (item: T) => string) {
  const byKey = new Map<string, T>();
  [...left, ...right].forEach((item) => byKey.set(getKey(item), item));
  return Array.from(byKey.values());
}
