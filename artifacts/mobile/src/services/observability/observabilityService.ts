import type { HatchUpData } from "../../domain/models";

type ObservabilityEvent =
  | "app_crash"
  | "cloud_sync_failed"
  | "egg_hatched"
  | "health_sync_failed"
  | "health_sync_succeeded"
  | "hatch_shared"
  | "collection_shared"
  | "leaderboard_sharing_changed"
  | "quest_reward_claimed"
  | "shop_item_purchased"
  | "trainer_card_shared"
  | "weekly_chest_claimed";

export async function trackEvent(
  data: HatchUpData,
  event: ObservabilityEvent,
  properties: Record<string, unknown> = {},
) {
  if (!data.analyticsEnabled) return;

  const apiUrl = process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  if (!apiUrl) return;

  try {
    await fetch(`${apiUrl.replace(/\/$/, "")}/events`, {
      body: JSON.stringify({
        accountId: data.accountId,
        event,
        occurredAt: new Date().toISOString(),
        properties: sanitizeEventProperties(properties),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // Analytics must never interrupt gameplay.
  }
}

export async function reportCrash(error: Error, data?: HatchUpData) {
  if (!data) return;
  if (data && !data.crashReportingEnabled) return;

  const apiUrl = process.env.EXPO_PUBLIC_CRASH_REPORT_URL;
  if (!apiUrl) return;

  try {
    await fetch(apiUrl, {
      body: JSON.stringify({
        accountId: data?.accountId ?? null,
        message: error.message,
        name: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  } catch {
    // Crash reporting should not create a second crash path.
  }
}

function sanitizeEventProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      isHealthDerivedKey(key) ? bucketValue(value) : value,
    ]),
  );
}

function isHealthDerivedKey(key: string) {
  const lowerKey = key.toLowerCase();
  return (
    lowerKey.includes("step") ||
    lowerKey.includes("distance") ||
    lowerKey.includes("calorie") ||
    lowerKey.includes("workout") ||
    lowerKey.includes("health")
  );
}

function bucketValue(value: unknown) {
  if (typeof value !== "number") return "redacted";
  if (value <= 0) return "none";
  if (value < 100) return "low";
  if (value < 1000) return "medium";
  return "high";
}
