import { useEffect, useRef, useState } from "react";
import { toDateKey } from "./domain/date";
import { grantEventEggs } from "./domain/eventEggs";
import {
  initialHatchUpData,
  type CollectedHatchling,
  type CosmeticRewardId,
  type DailyAward,
  type DailyXp,
  type EggElement,
  type EconomyItemId,
  type HatchUpData,
} from "./domain/models";
import { migrateHatchUpData } from "./domain/migration";
import {
  addStepsToEggs,
  grantMilestoneEggs,
  getNewStepsForSync,
  isEggReady,
  hatchEgg as hatchReadyEgg,
} from "./domain/hatchery";
import {
  advanceOnboardingSyncExplanation,
  applyOnboardingHatch,
  applyOnboardingIdentity,
  applyOnboardingStarterEgg,
  completeOnboarding,
  createSkippedOnboardingData,
  readyOnboardingEgg,
} from "./domain/onboardingTutorial";
import {
  addXpToActiveHatchling,
  getHatchlingPowerScore,
  getTrainingStatus,
  renameHatchling,
  trainHatchling,
} from "./domain/hatchlings";
import { upsertDailyAward } from "./domain/history";
import { updateStreak } from "./domain/streak";
import { getWeeklyRewardChest } from "./domain/rewardChests";
import {
  applyEconomyReward,
  createWeeklyChestReward,
  ECONOMY_BALANCE,
  getEconomyItem,
  spendInventoryItem,
} from "./domain/economy";
import {
  getMonsterStage,
  getMonsterStages,
  type MonsterStage,
} from "./domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "./domain/progressionConfig";
import { calculateDailyXp, getXpGains, mergeDailyXp } from "./domain/xp";
import {
  getQuestRewardKey,
  getDailyQuests,
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
  ENABLE_CLOUD_SYNC,
  ENABLE_TEST_LAB,
} from "./config/features";
import {
  clearHatchUpData,
  loadHatchUpData,
  saveHatchUpData,
} from "./storage/appStorage";
import { getQaFixtureById, type QaFixtureId } from "./qa/fixtures";

export interface LatestSyncGains {
  accountXp: number;
  bondGained: number;
  chestProgress: number;
  coins: number;
  distanceMeters: number;
  eggSteps: number;
  eggsAwarded: number;
  itemRewards: EconomyItemId[];
  cosmeticRewards: CosmeticRewardId[];
  palXp: number;
  questsCompleted: number;
  stepsSynced: number;
  streakProgressed: boolean;
  xp: DailyXp;
}

export interface TrainingFeedback {
  bondGained: number;
  chestProgressGained: number;
  id: string;
  palName: string;
  powerGained: number;
  sessionsRemaining: number;
  xpGained: number;
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
  bondGained: 0,
  chestProgress: 0,
  coins: 0,
  distanceMeters: 0,
  eggSteps: 0,
  eggsAwarded: 0,
  itemRewards: [],
  cosmeticRewards: [],
  palXp: 0,
  questsCompleted: 0,
  stepsSynced: 0,
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
  const [trainingFeedback, setTrainingFeedback] =
    useState<TrainingFeedback | null>(null);
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

    if (!ENABLE_CLOUD_SYNC || !user?.id) {
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
    await persist(applyOnboardingIdentity(data, monsterName));
  }

  async function saveMonsterSetup(
    monsterName: string,
    starterEggElement: EggElement,
  ) {
    const named = applyOnboardingIdentity(data, monsterName);

    await persist(applyOnboardingStarterEgg(named, starterEggElement));
  }

  async function connectHealth() {
    setError(null);

    try {
      await healthService.requestReadPermissions();
      await persist({
        ...data,
        healthConnected: true,
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
    });
    return true;
  }

  async function saveOnboardingIdentity(username: string) {
    await persist(applyOnboardingIdentity(data, username));
  }

  async function saveOnboardingStarterEgg(starterEggElement: EggElement) {
    await persist(applyOnboardingStarterEgg(data, starterEggElement));
  }

  async function continueOnboardingAfterSyncExplanation() {
    await persist(advanceOnboardingSyncExplanation(data));
  }

  async function syncHealth() {
    if (syncInFlight.current) return null;
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
      const withSyncRewards =
        newSteps > 0
          ? applyEconomyReward(
              withMilestoneEggs,
              {
                chestProgress: newSteps,
                label: "Movement sync",
                source: "sync",
              },
              new Date().toISOString(),
            )
          : withMilestoneEggs;
      const next = grantEventEggs(withSyncRewards, health.date);
      const activeHatchlingAfter =
        next.activeHatchlingId && activeHatchlingBefore
          ? next.collection.find((item) => item.id === next.activeHatchlingId)
          : null;
      const questsCompleted = getDailyQuests(dailyAward).filter(isQuestComplete).length;

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
        bondGained: Math.max(
          (activeHatchlingAfter?.bond ?? 0) - (activeHatchlingBefore?.bond ?? 0),
          0,
        ),
        chestProgress: newSteps,
        coins: 0,
        cosmeticRewards: [],
        distanceMeters: health.distanceMeters ?? 0,
        eggSteps: newSteps,
        eggsAwarded: Math.max(
          next.activeEggs.length + next.pendingEggs.length - previousEggRewardCount,
          0,
        ),
        itemRewards: [],
        palXp: Math.max(
          (activeHatchlingAfter?.xp ?? 0) - (activeHatchlingBefore?.xp ?? 0),
          0,
        ),
        questsCompleted,
        stepsSynced: newSteps,
        streakProgressed: next.lastRewardDate === health.date && data.lastRewardDate !== health.date,
        xp: getXpGains(previousDailyXp, xp),
      });
      return next;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Health sync failed.",
      );
      void trackEvent(data, "health_sync_failed");
      return null;
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  }

  async function syncOnboardingMovement() {
    const synced = await syncHealth();
    const tutorialSource = synced ?? data;

    const readyStarter = readyOnboardingEgg(tutorialSource);
    await persist(readyStarter);
    if (!synced) {
      setError(null);
      setLatestSyncGains((previous) => ({
        ...previous,
        eggSteps: readyStarter.activeEgg.stepsRequired,
      }));
    }
    return true;
  }

  async function hatchEgg(eggId: string) {
    const hatchedAt = new Date().toISOString();
    const next =
      data.onboardingStep === "hatchPal"
        ? applyOnboardingHatch(data, eggId, hatchedAt)
        : hatchReadyEgg(data, eggId, hatchedAt);
    const rewarded =
      next !== data
        ? applyEconomyReward(
            next,
            {
              coins: ECONOMY_BALANCE.hatch.coins,
              label: "Pal hatched",
              source: "hatch",
            },
            hatchedAt,
          )
        : next;
    await persist(rewarded);
    void trackEvent(next, "egg_hatched", {
      eggId,
      eggsHatched: rewarded.eggsHatched,
    });
    if (rewarded !== data) {
      setLatestHatchling(rewarded.collection[0]);
      setLatestSyncGains({
        ...emptySyncGains,
        coins: ECONOMY_BALANCE.hatch.coins,
      });
    }
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
    const hatchedCount = Math.max(next.eggsHatched - data.eggsHatched, 0);

    if (hatchedCount > 0) {
      next = applyEconomyReward(next, {
        coins: ECONOMY_BALANCE.hatch.coins * hatchedCount,
        label: "Pals hatched",
        source: "hatch",
      });
    }

    await persist(next);
    if (next !== data) {
      setLatestHatchling(next.collection[0]);
      setLatestSyncGains({
        ...emptySyncGains,
        coins: ECONOMY_BALANCE.hatch.coins * hatchedCount,
      });
    }
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

  async function applyQaFixture(fixtureId: QaFixtureId) {
    const today = toDateKey(new Date());
    const fixture = getQaFixtureById(fixtureId, today);
    if (!fixture) return;

    await persist(fixture.data, { syncCloud: false });
    setLatestSync(fixture.data.dailyAward);
    setLatestEvolution(null);
    setLatestSyncGains(emptySyncGains);
    setLatestHatchling(null);
    setLeaderboardSyncLabel(
      fixture.data.leaderboardShareEnabled
        ? "Shared QA fixture"
        : "Private QA fixture",
    );
    setCloudSyncLabel("QA fixture local-only");
    setError(null);
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
      onboardingStep:
        data.onboardingStep === "setActivePal" ? "trainPal" : data.onboardingStep,
    });
  }

  async function renameCollectedHatchling(hatchlingId: string, name: string) {
    await persist(renameHatchling(data, hatchlingId, name));
  }

  async function trainActiveHatchling() {
    if (!data.activeHatchlingId) return;
    const before = data.collection.find(
      (hatchling) => hatchling.id === data.activeHatchlingId,
    );
    const next = trainHatchling(data, data.activeHatchlingId);
    const after = next.collection.find(
      (hatchling) => hatchling.id === data.activeHatchlingId,
    );

    if (
      !before ||
      !after ||
      after.trainingSessions.length <= before.trainingSessions.length
    ) {
      await persist(next);
      return;
    }

    const progressed =
      data.onboardingStep === "trainPal"
        ? { ...next, onboardingStep: "rewardSummary" as const }
        : next;
    const rewarded = applyEconomyReward(
      progressed,
      {
        chestProgress: ECONOMY_BALANCE.training.chestProgress,
        label: "Pal training",
        source: "training",
      },
      new Date().toISOString(),
    );

    await persist(rewarded);

    setTrainingFeedback({
      bondGained: Math.max(after.bond - before.bond, 0),
      chestProgressGained: ECONOMY_BALANCE.training.chestProgress,
      id: `${after.id}:${
        after.trainingSessions[after.trainingSessions.length - 1] ?? Date.now()
      }`,
      palName: after.name,
      powerGained: Math.max(
        getHatchlingPowerScore(after) - getHatchlingPowerScore(before),
        0,
      ),
      sessionsRemaining: getTrainingStatus(after).remainingToday,
      xpGained: Math.max(after.xp - before.xp, 0),
    });
  }

  async function completeFirstRunOnboarding() {
    await persist(completeOnboarding(data));
  }

  async function skipFirstRunOnboarding() {
    const next = createSkippedOnboardingData(data);
    await persist(next);
    setLatestHatchling(next.collection[0] ?? null);
  }

  async function claimQuestReward(quest: Quest, today: string) {
    const rewardKey = getQuestRewardKey(quest, today);
    const alreadyClaimed = data.claimedQuestRewards.includes(rewardKey);

    if (quest.cadence === "daily" || !isQuestComplete(quest) || alreadyClaimed) {
      return false;
    }

    const claimedAt = new Date().toISOString();
    const receipt = {
      cadence: quest.cadence,
      claimedAt,
      id: `${rewardKey}:${claimedAt}`,
      label: quest.label,
      questId: quest.id,
      rewardAccountXp: quest.rewardAccountXp,
      rewardBond: quest.rewardBond,
      rewardChestProgress: quest.rewardChestProgress,
      rewardCoins: quest.rewardCoins,
      rewardCosmetics: quest.rewardCosmetics,
      rewardEggSteps: quest.rewardEggSteps,
      rewardItems: quest.rewardItems,
      tier: quest.tier,
    };
    const withClaim = {
      ...data,
      claimedQuestRewards: [...data.claimedQuestRewards, rewardKey],
      questRewardHistory: [receipt, ...data.questRewardHistory].slice(0, 30),
    };
    const next = applyEconomyReward(
      withClaim,
      {
        accountXp: quest.rewardAccountXp,
        bond: quest.rewardBond,
        chestProgress: quest.rewardChestProgress,
        coins: quest.rewardCoins,
        cosmetics: quest.rewardCosmetics,
        eggSteps: quest.rewardEggSteps,
        items: quest.rewardItems,
        label: quest.label,
        source: "quest",
      },
      claimedAt,
    );

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: quest.rewardAccountXp,
      bondGained: quest.rewardBond,
      chestProgress: quest.rewardChestProgress,
      coins: quest.rewardCoins,
      cosmeticRewards: quest.rewardCosmetics,
      eggSteps: quest.rewardEggSteps,
      itemRewards: quest.rewardItems,
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

    const claimedAt = new Date().toISOString();
    const chestReward = createWeeklyChestReward(
      chest.key,
      chest.steps + Date.parse(today),
    );
    const receipt = {
      cadence: "weekly",
      claimedAt,
      id: `${chest.key}:${Date.now()}`,
      label: chest.label,
      questId: chest.key,
      rewardAccountXp: chest.rewardAccountXp,
      rewardCoins: chest.rewardCoins,
      rewardEggSteps: chest.rewardEggSteps,
      tier: 1,
    };
    const withClaim = {
      ...data,
      claimedRewardChests: [...data.claimedRewardChests, chest.key],
      questRewardHistory: [receipt, ...data.questRewardHistory].slice(0, 30),
    };
    const next = applyEconomyReward(withClaim, chestReward, claimedAt);

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: chest.rewardAccountXp,
      coins: chest.rewardCoins,
      cosmeticRewards: chestReward.cosmetics ?? [],
      eggSteps: chest.rewardEggSteps,
      itemRewards: chestReward.items ?? [],
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
    const economyItem = getEconomyItem(itemId);
    if (!economyItem) return false;

    const withPurchase = {
      ...data,
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
    const next = applyEconomyReward(withPurchase, {
      ...economyItem.reward,
      label: economyItem.label,
      source: "shop",
    });

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: economyItem.reward.accountXp ?? 0,
      bondGained: economyItem.reward.bond ?? 0,
      chestProgress: economyItem.reward.chestProgress ?? 0,
      coins: -item.priceCoins,
      cosmeticRewards: economyItem.reward.cosmetics ?? [],
      eggSteps: economyItem.reward.eggSteps ?? 0,
      itemRewards: economyItem.reward.items ?? [],
      palXp: economyItem.reward.palXp ?? 0,
    });
    void trackEvent(next, "shop_item_purchased", {
      itemId: item.id,
      priceCoins: item.priceCoins,
    });
    return true;
  }

  async function useInventoryItem(itemId: ShopItemId) {
    const item = getEconomyItem(itemId);
    if (!item) return false;
    if (!data.inventoryItems.some((entry) => entry.id === itemId && entry.quantity > 0)) {
      return false;
    }
    if ((item.reward.palXp || item.reward.bond) && !data.activeHatchlingId) {
      return false;
    }

    const spent = spendInventoryItem(data, itemId);
    const next = applyEconomyReward(spent, {
      ...item.reward,
      label: item.label,
      source: "shop",
    });

    await persist(next);
    setLatestSyncGains({
      ...emptySyncGains,
      accountXp: item.reward.accountXp ?? 0,
      bondGained: item.reward.bond ?? 0,
      chestProgress: item.reward.chestProgress ?? 0,
      cosmeticRewards: item.reward.cosmetics ?? [],
      eggSteps: item.reward.eggSteps ?? 0,
      itemRewards: item.reward.items ?? [],
      palXp: item.reward.palXp ?? 0,
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
    if (!ENABLE_CLOUD_SYNC || !user?.id) {
      const localOnly = {
        ...data,
        cloudSyncEnabled: false,
        cloudSyncStatus: "localOnly",
      } as HatchUpData;

      await persist(localOnly, { syncCloud: false });
      setCloudSyncLabel("Sign in to enable cloud save");
      return;
    }

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
    if (!ENABLE_CLOUD_SYNC || !user?.id || !nextData.cloudSyncEnabled) {
      setCloudSyncLabel("Local-only save");
      return;
    }

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
    testLabEnabled:
      ENABLE_TEST_LAB &&
      ACTIVE_PROGRESSION_PROFILE.id === "beta" &&
      !IS_PUBLIC_BUILD,
    isSyncing,
    latestHatchling,
    latestEvolution,
    latestSync,
    latestSyncGains,
    trainingFeedback,
    ready,
    connectHealth,
    dismissLatestHatchling: () => setLatestHatchling(null),
    dismissTrainingFeedback: () => setTrainingFeedback(null),
    hatchAllReadyEggs,
    hatchEgg,
    resetApp,
    readyTestEgg,
    reportCrash,
    saveMonsterSetup,
    completeFirstRunOnboarding,
    skipHealthConnect,
    skipFirstRunOnboarding,
    saveOnboardingIdentity,
    saveOnboardingStarterEgg,
    continueOnboardingAfterSyncExplanation,
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
    syncOnboardingMovement,
    buyShopItem,
    useInventoryItem,
    applyQaFixture,
    trainActiveHatchling,
    today: toDateKey(new Date()),
  };
}
