import { useEffect, useRef, useState } from "react";
import { toDateKey } from "./domain/date";
import { grantEventEggs } from "./domain/eventEggs";
import {
  initialHatchUpData,
  type CollectedHatchling,
  type DailyAward,
  type DailyXp,
  type EggElement,
  type HatchUpData,
} from "./domain/models";
import { migrateHatchUpData } from "./domain/migration";
import {
  addStepsToEggs,
  createStarterEgg,
  grantMilestoneEggs,
  getNewStepsForSync,
  isEggReady,
  hatchEgg as hatchReadyEgg,
} from "./domain/hatchery";
import {
  addXpToActiveHatchling,
  renameHatchling,
  trainHatchling,
} from "./domain/hatchlings";
import { upsertDailyAward } from "./domain/history";
import { updateStreak } from "./domain/streak";
import { getWeeklyRewardChest } from "./domain/rewardChests";
import {
  getMonsterStage,
  getMonsterStages,
  type MonsterStage,
} from "./domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "./domain/progressionConfig";
import { calculateDailyXp, getXpGains, mergeDailyXp } from "./domain/xp";
import {
  getQuestRewardKey,
  isQuestComplete,
  type Quest,
} from "./domain/quests";
import {
  canBuyShopItem,
  getShopItem,
  type ShopItemId,
} from "./domain/shop";
import {
  loadCloudSave,
  mergeLocalAndCloudSave,
  saveCloudSave,
  syncCloudSave,
} from "./services/account/accountService";
import { healthService } from "./services/health";
import { useAuth } from "./services/auth/AuthProvider";
import { syncLeaderboardEntry } from "./services/leaderboard/leaderboardService";
import {
  reportCrash as reportObservedCrash,
  trackEvent,
} from "./services/observability/observabilityService";
import { IS_PUBLIC_BUILD } from "./config/runtime";
import {
  clearHatchUpData,
  loadHatchUpData,
  saveHatchUpData,
} from "./storage/appStorage";

export interface LatestSyncGains {
  accountXp: number;
  coins: number;
  eggSteps: number;
  eggsAwarded: number;
  palXp: number;
  streakProgressed: boolean;
  xp: DailyXp;
}

const emptyDailyXp: DailyXp = {
  steps: 0,
  activeCalories: 0,
  workouts: 0,
  quests: 0,
  firstSync: 0,
  total: 0,
};

const emptySyncGains: LatestSyncGains = {
  accountXp: 0,
  coins: 0,
  eggSteps: 0,
  eggsAwarded: 0,
  palXp: 0,
  streakProgressed: false,
  xp: getXpGains(null, emptyDailyXp),
};

export function useHatchUpApp() {
  const { user } = useAuth();
  const [data, setData] = useState<HatchUpData>(initialHatchUpData);
  const [ready, setReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSync, setLatestSync] = useState<DailyAward | null>(null);
  const [latestEvolution, setLatestEvolution] = useState<MonsterStage | null>(
    null,
  );
  const [latestSyncGains, setLatestSyncGains] =
    useState<LatestSyncGains>(emptySyncGains);
  const [latestHatchling, setLatestHatchling] =
    useState<CollectedHatchling | null>(null);
  const [leaderboardSyncLabel, setLeaderboardSyncLabel] =
    useState("Local challenge board");
  const [cloudSyncLabel, setCloudSyncLabel] = useState("Local-only save");
  const cloudBootstrapUserRef = useRef<string | null>(null);
  const syncInFlight = useRef(false);

  useEffect(() => {
    loadHatchUpData()
      .then(setData)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (!user?.id) {
      cloudBootstrapUserRef.current = null;
      setCloudSyncLabel("Local-only save");
      return;
    }

    const userId = user.id;
    if (cloudBootstrapUserRef.current === userId) return;

    let cancelled = false;
    cloudBootstrapUserRef.current = userId;

    async function bootstrapCloudSave() {
      const remoteLocalData = migrateHatchUpData({
        ...data,
        accountId: userId,
        accountMode: "remote",
        cloudSyncEnabled: true,
        cloudSyncStatus: "pending",
      });

      setCloudSyncLabel("Cloud sync pending");
      setData(remoteLocalData);
      await saveHatchUpData(remoteLocalData);

      try {
        const cloudSave = await loadCloudSave(userId);
        const merged = cloudSave
          ? mergeLocalAndCloudSave(remoteLocalData, cloudSave.data)
          : remoteLocalData;
        const pendingSave = {
          ...merged,
          accountId: userId,
          accountMode: "remote",
          cloudSyncEnabled: true,
          cloudSyncStatus: "pending",
        } as HatchUpData;

        if (cancelled) return;
        setData(pendingSave);
        await saveHatchUpData(pendingSave);

        const saved = await saveCloudSave(userId, pendingSave);
        const synced = {
          ...saved.data,
          cloudSyncStatus: "synced",
          lastCloudSyncedAt: saved.syncedAt,
        } as HatchUpData;

        if (cancelled) return;
        setData(synced);
        await saveHatchUpData(synced);
        setCloudSyncLabel(
          `Cloud synced ${new Date(saved.syncedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}`,
        );
      } catch {
        const failed = {
          ...remoteLocalData,
          cloudSyncStatus: "failed",
        } as HatchUpData;

        if (cancelled) return;
        setData(failed);
        await saveHatchUpData(failed);
        setCloudSyncLabel("Cloud sync failed; local save kept");
      }
    }

    void bootstrapCloudSave();

    return () => {
      cancelled = true;
    };
  }, [ready, user?.id]);

  async function persist(next: HatchUpData, options = { syncCloud: true }) {
    setData(next);
    await saveHatchUpData(next);
    if (options.syncCloud) void syncCloud(next);
  }

  async function saveMonsterName(monsterName: string) {
    await persist({
      ...data,
      monsterName: monsterName.trim(),
      onboardingStatus: "monsterCreated",
    });
  }

  async function saveMonsterSetup(
    monsterName: string,
    starterEggElement: EggElement,
  ) {
    const starterEgg = createStarterEgg(starterEggElement);
    const activeEggs = [starterEgg];

    await persist({
      ...data,
      activeEgg: activeEggs[0],
      activeEggs,
      monsterName: monsterName.trim(),
      onboardingStatus: "monsterCreated",
      starterEggElement,
    });
  }

  async function connectHealth() {
    setError(null);

    try {
      await healthService.requestReadPermissions();
      await persist({
        ...data,
        healthConnected: true,
        onboardingStatus: "complete",
      });
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Health connection failed.",
      );
      return false;
    }
  }

  async function skipHealthConnect() {
    setError(null);
    await persist({
      ...data,
      onboardingStatus: "complete",
    });
    return true;
  }

  async function syncHealth() {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setIsSyncing(true);
    setError(null);

    try {
      const health = await healthService.getTodaySummary();
      const previousDailyXp =
        data.dailyAward?.date === health.date ? data.dailyAward.xp : null;
      const calculatedXp = calculateDailyXp(health, {
        firstSyncOfDay: previousDailyXp === null,
      });
      const xp = mergeDailyXp(previousDailyXp, calculatedXp);
      const previousXp =
        data.dailyAward?.date === health.date ? data.dailyAward.xp.total : 0;
      const newXp = Math.max(xp.total - previousXp, 0);
      const previousStage = getMonsterStage(data.totalXp);
      const nextStage = getMonsterStage(data.totalXp + newXp);
      const streak = updateStreak(data, health.date, newXp);
      const newSteps = getNewStepsForSync(
        data.dailyAward,
        health.date,
        health.steps,
      );
      const dailyAward = { date: health.date, health, xp };
      const activeEggs = addStepsToEggs(data.activeEggs, newSteps);
      const previousEggRewardCount =
        activeEggs.length + data.pendingEggs.length;
      const previousTotalXp = data.totalXp;
      const activeHatchlingBefore = data.activeHatchlingId
        ? data.collection.find((item) => item.id === data.activeHatchlingId)
        : null;
      const synced = {
        ...data,
        ...streak,
        activeEgg: activeEggs[0],
        activeEggs,
        activityHistory: upsertDailyAward(data.activityHistory, dailyAward),
        totalXp: previousTotalXp + newXp,
        lastSyncedDate: new Date().toISOString(),
        dailyAward,
      };
      const trained = addXpToActiveHatchling(synced, newXp);
      const withMilestoneEggs = grantMilestoneEggs(
        trained,
        previousTotalXp,
        previousTotalXp + newXp,
      );
      const next = grantEventEggs(withMilestoneEggs, health.date);
      const activeHatchlingAfter =
        next.activeHatchlingId && activeHatchlingBefore
          ? next.collection.find((item) => item.id === next.activeHatchlingId)
          : null;

      await persist(next);
      void syncLeaderboard(next);
      void trackEvent(next, "health_sync_succeeded", {
        eggSteps: newSteps,
        xp: newXp,
      });
      setLatestSync(dailyAward);
      setLatestEvolution(
        previousStage.id === nextStage.id ? null : nextStage.id,
      );
      setLatestSyncGains({
        accountXp: 0,
        coins: 0,
        eggSteps: newSteps,
        eggsAwarded: Math.max(
          next.activeEggs.length + next.pendingEggs.length - previousEggRewardCount,
          0,
        ),
        palXp: Math.max(
          (activeHatchlingAfter?.xp ?? 0) - (activeHatchlingBefore?.xp ?? 0),
          0,
        ),
        streakProgressed: next.lastRewardDate === health.date && data.lastRewardDate !== health.date,
        xp: getXpGains(previousDailyXp, xp),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Health sync failed.",
      );
      void trackEvent(data, "health_sync_failed");
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  }

  async function hatchEgg(eggId: string) {
    const next = hatchReadyEgg(data, eggId, new Date().toISOString());
    await persist(next);
    void trackEvent(next, "egg_hatched", {
      eggId,
      eggsHatched: next.eggsHatched,
    });
    if (next !== data) setLatestHatchling(next.collection[0]);
  }

  async function hatchAllReadyEggs() {
    let next = data;
    const readyEggIds = data.activeEggs
      .filter(isEggReady)
      .map((egg) => egg.id);

    readyEggIds.forEach((eggId, index) => {
      next = hatchReadyEgg(
        next,
        eggId,
        new Date(Date.now() + index).toISOString(),
      );
    });

    await persist(next);
    if (next !== data) setLatestHatchling(next.collection[0]);
  }

  async function resetApp() {
    await clearHatchUpData();
    setData(migrateHatchUpData(null));
    setLatestSync(null);
    setLatestEvolution(null);
    setLatestSyncGains(emptySyncGains);
    setLatestHatchling(null);
    setLeaderboardSyncLabel("Local challenge board");
    setCloudSyncLabel("Local-only save");
    setError(null);
  }

  async function setTestStage(stageId: MonsterStage) {
    const stage = getMonsterStages().find((item) => item.id === stageId);
    if (!stage) return;

    await persist({
      ...data,
      totalXp: stage.xp,
    });
    setLatestEvolution(null);
  }

  async function readyTestEgg() {
    const activeEggs = data.activeEggs.map((egg) => ({
      ...egg,
      stepsWalked: egg.stepsRequired,
    }));

    await persist({
      ...data,
      activeEgg: activeEggs[0],
      activeEggs,
    });
  }

  async function setLeaderboardSharing(enabled: boolean) {
    const next = {
      ...data,
      leaderboardAlias: data.leaderboardAlias || data.monsterName || "HatchUp Tester",
      leaderboardShareEnabled: enabled,
    };

    await persist(next);
    await syncLeaderboard(next);
    void trackEvent(next, "leaderboard_sharing_changed", { enabled });
  }

  async function saveLeaderboardAlias(alias: string) {
    await persist({
      ...data,
      leaderboardAlias: alias.trim().slice(0, 24),
    });
  }

  async function saveProfile({
    profileHatchlingId,
    profileTagline,
    profileUsername,
  }: {
    profileHatchlingId: string | null;
    profileTagline: string;
    profileUsername: string;
  }) {
    const username = profileUsername.trim().slice(0, 24);
    await persist({
      ...data,
      leaderboardAlias: data.leaderboardAlias || username,
      profileHatchlingId,
      profileTagline: profileTagline.trim().slice(0, 80),
      profileUsername: username,
    });
  }

  async function setActiveHatchling(hatchlingId: string) {
    if (!data.collection.some((hatchling) => hatchling.id === hatchlingId)) {
      return;
    }

    await persist({
      ...data,
      activeHatchlingId: hatchlingId,
    });
  }

  async function renameCollectedHatchling(hatchlingId: string, name: string) {
    await persist(renameHatchling(data, hatchlingId, name));
  }

  async function trainActiveHatchling() {
    if (!data.activeHatchlingId) return;
    await persist(trainHatchling(data, data.activeHatchlingId));
  }

  async function claimQuestReward(quest: Quest, today: string) {
    const rewardKey = getQuestRewardKey(quest, today);
    const alreadyClaimed = data.claimedQuestRewards.includes(rewardKey);

    if (quest.cadence === "daily" || !isQuestComplete(quest) || alreadyClaimed) {
      return false;
    }

    const activeEggs =
      quest.rewardEggSteps > 0
        ? addStepsToEggs(data.activeEggs, quest.rewardEggSteps)
        : data.activeEggs;
    const claimedAt = new Date().toISOString();
    const receipt = {
      cadence: quest.cadence,
      claimedAt,
      id: `${rewardKey}:${claimedAt}`,
      label: quest.label,
      questId: quest.id,
      rewardAccountXp: quest.rewardAccountXp,
      rewardCoins: quest.rewardCoins,
      rewardEggSteps: quest.rewardEggSteps,
      tier: quest.tier,
    };
    const next = {
      ...data,
      accountXp: data.accountXp + quest.rewardAccountXp,
      activeEgg: activeEggs[0],
      activeEggs,
      claimedQuestRewards: [...data.claimedQuestRewards, rewardKey],
      coins: data.coins + quest.rewardCoins,
      questRewardHistory: [receipt, ...data.questRewardHistory].slice(0, 30),
    };

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: quest.rewardAccountXp,
      coins: quest.rewardCoins,
      eggSteps: quest.rewardEggSteps,
    });
    void trackEvent(next, "quest_reward_claimed", {
      cadence: quest.cadence,
      questId: quest.id,
      tier: quest.tier,
    });
    return true;
  }

  async function claimWeeklyChest(today: string) {
    const chest = getWeeklyRewardChest(data, today);
    if (!chest.canClaim) return false;

    const activeEggs = addStepsToEggs(data.activeEggs, chest.rewardEggSteps);
    const receipt = {
      cadence: "weekly",
      claimedAt: new Date().toISOString(),
      id: `${chest.key}:${Date.now()}`,
      label: chest.label,
      questId: chest.key,
      rewardAccountXp: chest.rewardAccountXp,
      rewardCoins: chest.rewardCoins,
      rewardEggSteps: chest.rewardEggSteps,
      tier: 1,
    };
    const next = {
      ...data,
      accountXp: data.accountXp + chest.rewardAccountXp,
      activeEgg: activeEggs[0],
      activeEggs,
      claimedRewardChests: [...data.claimedRewardChests, chest.key],
      coins: data.coins + chest.rewardCoins,
      questRewardHistory: [receipt, ...data.questRewardHistory].slice(0, 30),
    };

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: chest.rewardAccountXp,
      coins: chest.rewardCoins,
      eggSteps: chest.rewardEggSteps,
    });
    void trackEvent(next, "weekly_chest_claimed", {
      key: chest.key,
      steps: chest.steps,
    });
    return true;
  }

  async function buyShopItem(itemId: ShopItemId) {
    const item = getShopItem(itemId);
    if (!item || !canBuyShopItem(data, item)) return false;

    const activeEggs =
      item.rewardEggSteps > 0
        ? addStepsToEggs(data.activeEggs, item.rewardEggSteps)
        : data.activeEggs;
    const withAccountRewards = {
      ...data,
      accountXp: data.accountXp + item.rewardAccountXp,
      activeEgg: activeEggs[0],
      activeEggs,
      coins: data.coins - item.priceCoins,
      shopPurchaseHistory: [
        {
          boughtAt: new Date().toISOString(),
          id: `${item.id}:${Date.now()}`,
          itemId: item.id,
          label: item.label,
          priceCoins: item.priceCoins,
        },
        ...data.shopPurchaseHistory,
      ].slice(0, 30),
    };
    const next =
      item.rewardPalXp > 0
        ? addXpToActiveHatchling(withAccountRewards, item.rewardPalXp)
        : withAccountRewards;

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: item.rewardAccountXp,
      coins: -item.priceCoins,
      eggSteps: item.rewardEggSteps,
      palXp: item.rewardPalXp,
    });
    void trackEvent(next, "shop_item_purchased", {
      itemId: item.id,
      priceCoins: item.priceCoins,
    });
    return true;
  }

  async function syncLeaderboard(nextData: HatchUpData) {
    try {
      const result = await syncLeaderboardEntry(nextData, toDateKey(new Date()));
      setLeaderboardSyncLabel(
        result.mode === "remote"
          ? `Synced ${new Date(result.syncedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : "Local challenge board",
      );
    } catch {
      setLeaderboardSyncLabel("Leaderboard sync pending");
    }
  }

  async function setCloudSyncEnabled(enabled: boolean) {
    const next = {
      ...data,
      cloudSyncEnabled: enabled,
      cloudSyncStatus: enabled ? "pending" : "localOnly",
    } as HatchUpData;

    await persist(next, { syncCloud: false });
    await syncCloud(next);
  }

  async function setAnalyticsEnabled(enabled: boolean) {
    await persist({
      ...data,
      analyticsEnabled: enabled,
    });
  }

  async function setCrashReportingEnabled(enabled: boolean) {
    await persist({
      ...data,
      crashReportingEnabled: enabled,
    });
  }

  async function syncCloud(nextData: HatchUpData) {
    try {
      const result = await syncCloudSave(nextData, user?.id);
      const synced = {
        ...result.data,
        accountMode: result.accountMode,
        cloudSyncStatus: result.status,
        lastCloudSyncedAt: result.syncedAt ?? nextData.lastCloudSyncedAt,
      };

      setData(synced);
      await saveHatchUpData(synced);
      setCloudSyncLabel(
        result.status === "synced" && result.syncedAt
          ? `Cloud synced ${new Date(result.syncedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : result.status === "pending"
            ? "Cloud sync pending"
            : "Local-only save",
      );
    } catch {
      const failed = {
        ...nextData,
        cloudSyncStatus: "failed",
      } as HatchUpData;

      setData(failed);
      await saveHatchUpData(failed);
      setCloudSyncLabel("Cloud sync failed");
      void trackEvent(nextData, "cloud_sync_failed");
    }
  }

  function reportCrash(error: Error) {
    void reportObservedCrash(error, data);
  }

  return {
    data,
    error,
    healthMode: healthService.modeLabel,
    cloudSyncLabel,
    leaderboardSyncLabel,
    progressionProfile: ACTIVE_PROGRESSION_PROFILE,
    testLabEnabled: ACTIVE_PROGRESSION_PROFILE.id === "beta" && !IS_PUBLIC_BUILD,
    isSyncing,
    latestHatchling,
    latestEvolution,
    latestSync,
    latestSyncGains,
    ready,
    connectHealth,
    dismissLatestHatchling: () => setLatestHatchling(null),
    hatchAllReadyEggs,
    hatchEgg,
    resetApp,
    readyTestEgg,
    reportCrash,
    saveMonsterSetup,
    skipHealthConnect,
    saveMonsterName,
    saveLeaderboardAlias,
    saveProfile,
    renameCollectedHatchling,
    claimQuestReward,
    claimWeeklyChest,
    setActiveHatchling,
    setAnalyticsEnabled,
    setCloudSyncEnabled,
    setCrashReportingEnabled,
    setLeaderboardSharing,
    setTestStage,
    syncHealth,
    buyShopItem,
    trainActiveHatchling,
    today: toDateKey(new Date()),
  };
}
