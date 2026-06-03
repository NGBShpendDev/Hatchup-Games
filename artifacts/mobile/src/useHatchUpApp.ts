import { useEffect, useRef, useState } from "react";
import { toDateKey } from "./domain/date";
import {
  initialHatchUpData,
  type CollectedHatchling,
  type DailyAward,
  type HatchUpData,
} from "./domain/models";
import { migrateHatchUpData } from "./domain/migration";
import {
  addStepsToEggs,
  getNewStepsForSync,
  isEggReady,
  hatchEgg as hatchReadyEgg,
} from "./domain/hatchery";
import { upsertDailyAward } from "./domain/history";
import { updateStreak } from "./domain/streak";
import {
  getMonsterStage,
  getMonsterStages,
  type MonsterStage,
} from "./domain/progression";
import { ACTIVE_PROGRESSION_PROFILE } from "./domain/progressionConfig";
import { calculateDailyXp, getXpGains, mergeDailyXp } from "./domain/xp";
import { syncCloudSave } from "./services/account/accountService";
import { healthService } from "./services/health";
import { syncLeaderboardEntry } from "./services/leaderboard/leaderboardService";
import {
  reportCrash as reportObservedCrash,
  trackEvent,
} from "./services/observability/observabilityService";
import {
  clearHatchUpData,
  loadHatchUpData,
  saveHatchUpData,
} from "./storage/appStorage";

export function useHatchUpApp() {
  const [data, setData] = useState<HatchUpData>(initialHatchUpData);
  const [ready, setReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestSync, setLatestSync] = useState<DailyAward | null>(null);
  const [latestEvolution, setLatestEvolution] = useState<MonsterStage | null>(
    null,
  );
  const [latestSyncGains, setLatestSyncGains] = useState({
    eggSteps: 0,
    xp: getXpGains(null, {
      steps: 0,
      activeCalories: 0,
      workouts: 0,
      quests: 0,
      firstSync: 0,
      total: 0,
    }),
  });
  const [latestHatchling, setLatestHatchling] =
    useState<CollectedHatchling | null>(null);
  const [leaderboardSyncLabel, setLeaderboardSyncLabel] =
    useState("Local beta rankings");
  const [cloudSyncLabel, setCloudSyncLabel] = useState("Local-only save");
  const syncInFlight = useRef(false);

  useEffect(() => {
    loadHatchUpData()
      .then(setData)
      .finally(() => setReady(true));
  }, []);

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
      const next = {
        ...data,
        ...streak,
        activeEgg: activeEggs[0],
        activeEggs,
        activityHistory: upsertDailyAward(data.activityHistory, dailyAward),
        totalXp: data.totalXp + newXp,
        lastSyncedDate: new Date().toISOString(),
        dailyAward,
      };

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
        eggSteps: newSteps,
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
    setLatestSyncGains({
      eggSteps: 0,
      xp: getXpGains(null, {
        steps: 0,
        activeCalories: 0,
        workouts: 0,
        quests: 0,
        firstSync: 0,
        total: 0,
      }),
    });
    setLatestHatchling(null);
    setLeaderboardSyncLabel("Local beta rankings");
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

  async function syncLeaderboard(nextData: HatchUpData) {
    try {
      const result = await syncLeaderboardEntry(nextData, toDateKey(new Date()));
      setLeaderboardSyncLabel(
        result.mode === "remote"
          ? `Synced ${new Date(result.syncedAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`
          : "Local beta rankings",
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
      const result = await syncCloudSave(nextData);
      const synced = {
        ...nextData,
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
    testLabEnabled: ACTIVE_PROGRESSION_PROFILE.id === "beta",
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
    saveMonsterName,
    saveLeaderboardAlias,
    setAnalyticsEnabled,
    setCloudSyncEnabled,
    setCrashReportingEnabled,
    setLeaderboardSharing,
    setTestStage,
    syncHealth,
    today: toDateKey(new Date()),
  };
}
