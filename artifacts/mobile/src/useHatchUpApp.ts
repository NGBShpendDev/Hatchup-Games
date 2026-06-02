import { useEffect, useRef, useState } from "react";
import { toDateKey } from "./domain/date";
import {
  initialHatchUpData,
  type DailyAward,
  type HatchUpData,
} from "./domain/models";
import { updateStreak } from "./domain/streak";
import { calculateDailyXp, mergeDailyXp } from "./domain/xp";
import { healthService } from "./services/health";
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
  const syncInFlight = useRef(false);

  useEffect(() => {
    loadHatchUpData()
      .then(setData)
      .finally(() => setReady(true));
  }, []);

  async function persist(next: HatchUpData) {
    setData(next);
    await saveHatchUpData(next);
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
      setError(caught instanceof Error ? caught.message : "Health connection failed.");
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
      const calculatedXp = calculateDailyXp(health);
      const previousDailyXp = data.dailyAward?.date === health.date
        ? data.dailyAward.xp
        : null;
      const xp = mergeDailyXp(previousDailyXp, calculatedXp);
      const previousXp = data.dailyAward?.date === health.date
        ? data.dailyAward.xp.total
        : 0;
      const newXp = Math.max(xp.total - previousXp, 0);
      const streak = updateStreak(data, health.date, newXp);
      const dailyAward = { date: health.date, health, xp };
      const next = {
        ...data,
        ...streak,
        totalXp: data.totalXp + newXp,
        lastSyncedDate: new Date().toISOString(),
        dailyAward,
      };

      await persist(next);
      setLatestSync(dailyAward);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Health sync failed.");
    } finally {
      syncInFlight.current = false;
      setIsSyncing(false);
    }
  }

  async function resetApp() {
    await clearHatchUpData();
    setData(initialHatchUpData);
    setLatestSync(null);
    setError(null);
  }

  return {
    data,
    error,
    healthMode: healthService.modeLabel,
    isSyncing,
    latestSync,
    ready,
    connectHealth,
    resetApp,
    saveMonsterName,
    syncHealth,
    today: toDateKey(new Date()),
  };
}
