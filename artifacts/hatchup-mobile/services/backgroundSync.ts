/**
 * Background Sync Service
 *
 * Registers an OS-level background fetch task that wakes the app every
 * 15–30 minutes (iOS) / 15 minutes (Android) and pushes step + activity
 * data to the HatchUp backend — even when the app is fully closed.
 *
 * How step counting works without the app open:
 *   iOS  — The M-series motion coprocessor in every iPhone counts steps
 *           24/7 and stores them in HealthKit. The Pedometer API reads
 *           the accumulated total from HealthKit for any time range.
 *   Android — The phone's hardware step counter writes to Google Fit /
 *             Health Connect. Our server already polls Google Fit every
 *             30 min via passiveSyncJob, so no extra mobile task is
 *             required on Android.
 *
 * Registration: call registerBackgroundSync() once on app mount.
 * Task definition MUST be at module level (called before any component
 * renders) — this is a TaskManager requirement.
 */

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Pedometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const TASK_NAME = "hatchup-background-health-sync";
const LAST_SYNC_KEY = "hatchup_bg_last_step_sync";
const DOMAIN_KEY = "hatchup_bg_domain";
const TOKEN_KEY = "hatchup_bg_auth_token";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiBase(): string {
  // Domain is written by the foreground app via persistDomainForBackground()
  return `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
}

async function postHealthSync(
  payload: object,
  token: string | null,
): Promise<boolean> {
  const base = getApiBase();
  try {
    const res = await fetch(`${base}/api/health/apple/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Task definition (module level — required by TaskManager) ─────────────────

TaskManager.defineTask(TASK_NAME, async () => {
  // iOS only — Android step sync is handled server-side via Google Fit.
  if (Platform.OS !== "ios") {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  try {
    // Retrieve auth token stored by the foreground app
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    // Determine the time range to read steps for
    const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // Read at most 48 hours back to avoid huge payloads
    const since = lastSyncStr
      ? new Date(Number(lastSyncStr))
      : new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const start = since < startOfToday ? startOfToday : since;

    // Check Pedometer availability
    const { status } = await Pedometer.requestPermissionsAsync();
    if (status !== "granted") {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Read steps accumulated by the hardware since last sync
    const result = await Pedometer.getStepCountAsync(start, now);
    const steps = result?.steps ?? 0;

    if (steps === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const today = now.toISOString().slice(0, 10);
    const ok = await postHealthSync(
      {
        steps,
        date: today,
        activeMinutes: Math.round(steps / 100), // rough estimate: 100 steps ≈ 1 active min
      },
      token,
    );

    if (ok) {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime()));
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call this once after the user signs in.
 * Registers the background fetch task with the OS at a 15-minute interval.
 * Safe to call multiple times — checks if already registered.
 */
export async function registerBackgroundSync(): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      // User has disabled background refresh for this app in Settings
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes — OS may run less frequently
        stopOnTerminate: false,   // keep running after the app is closed
        startOnBoot: true,        // re-register after device reboot
      });
    }
  } catch {
    // Background fetch not supported (e.g. Expo Go simulator) — safe to ignore
  }
}

/**
 * Stop background sync (e.g. on sign-out).
 */
export async function unregisterBackgroundSync(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
    }
  } catch { /* ignore */ }
}

/**
 * Persist the Clerk auth token so the background task can use it.
 * Call this whenever a fresh token is obtained (Clerk getToken()).
 */
export async function persistAuthTokenForBackground(token: string | null): Promise<void> {
  try {
    if (token) {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(LAST_SYNC_KEY);
    }
  } catch { /* ignore */ }
}

/**
 * Manual foreground sync — reads today's steps and pushes them immediately.
 * Call this when the app comes to the foreground.
 */
export async function syncHealthNow(token: string | null): Promise<{ steps: number; ok: boolean }> {
  if (Platform.OS !== "ios") return { steps: 0, ok: false };
  try {
    const { status } = await Pedometer.requestPermissionsAsync();
    if (status !== "granted") return { steps: 0, ok: false };

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const result = await Pedometer.getStepCountAsync(startOfDay, now);
    const steps = result?.steps ?? 0;

    if (steps === 0) return { steps: 0, ok: true };

    const today = now.toISOString().slice(0, 10);
    const ok = await postHealthSync(
      {
        steps,
        date: today,
        activeMinutes: Math.round(steps / 100),
      },
      token,
    );

    if (ok) {
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(now.getTime()));
    }

    return { steps, ok };
  } catch {
    return { steps: 0, ok: false };
  }
}
