import type { HatchUpData } from "../../domain/models";

type ObservabilityEvent =
  | "app_crash"
  | "cloud_sync_failed"
  | "egg_hatched"
  | "health_sync_failed"
  | "health_sync_succeeded"
  | "leaderboard_sharing_changed";

export async function trackEvent(
  data: HatchUpData,
  event: ObservabilityEvent,
  properties: Record<string, unknown> = {},
) {
  if (!data.analyticsEnabled) return;

  const apiUrl = process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  if (!apiUrl) return;

  await fetch(`${apiUrl.replace(/\/$/, "")}/events`, {
    body: JSON.stringify({
      accountId: data.accountId,
      event,
      occurredAt: new Date().toISOString(),
      properties,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

export async function reportCrash(error: Error, data?: HatchUpData) {
  if (!data) return;
  if (data && !data.crashReportingEnabled) return;

  const apiUrl = process.env.EXPO_PUBLIC_CRASH_REPORT_URL;
  if (!apiUrl) return;

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
}
