import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { HealthConnection } from "@workspace/db";
import { encryptToken, decryptToken } from "./googleFitSync.ts";
import { logger } from "../lib/logger.ts";
import { logFitnessActivity } from "./fitnessLog.ts";

async function refreshGarminToken(connection: HealthConnection): Promise<string | null> {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret || !connection.refreshToken) return null;

  try {
    const refreshToken = decryptToken(connection.refreshToken);
    const res = await fetch("https://connectapi.garmin.com/oauth-service/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await db.update(healthConnectionsTable)
      .set({
        accessToken: encryptToken(data.access_token),
        refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : connection.refreshToken,
        tokenExpiresAt: expiresAt,
      })
      .where(eq(healthConnectionsTable.id, connection.id));
    return data.access_token;
  } catch (err) {
    logger.error({ err }, "Garmin token refresh failed");
    return null;
  }
}

async function getValidGarminToken(connection: HealthConnection): Promise<string | null> {
  if (!connection.accessToken) return null;
  const isExpired = connection.tokenExpiresAt && connection.tokenExpiresAt < new Date(Date.now() + 60_000);
  if (isExpired) return await refreshGarminToken(connection);
  return decryptToken(connection.accessToken);
}

// Garmin sport type IDs → internal activity types
const GARMIN_SPORT_MAP: Record<number, string> = {
  1:  "running",
  2:  "cycling",
  3:  "hiking",
  4:  "walking",
  5:  "swimming",
  9:  "yoga",
  10: "strength_training",
  11: "hiit",
  17: "walking",
  19: "running",
  25: "cycling",
  71: "weightlifting",
};

function mapGarminSport(sportType: number, subSportType?: number): string | null {
  if (subSportType === 20) return "hiit";
  if (subSportType === 19) return "yoga";
  if (subSportType === 18) return "weightlifting";
  return GARMIN_SPORT_MAP[sportType] ?? null;
}

export async function syncGarmin(
  playerId: number,
  connection: HealthConnection,
): Promise<{ activitiesImported: number; xpEarned: number; lastSyncedAt: string }> {
  const accessToken = await getValidGarminToken(connection);
  if (!accessToken) throw new Error("Could not obtain valid Garmin access token");

  const since = connection.lastSyncedAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);

  let activitiesImported = 0;
  let xpEarned = 0;

  // ── Daily summaries (steps + active minutes) ───────────────────────────────
  const dailyRes = await fetch(
    `https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=${sinceUnix}&uploadEndTimeInSeconds=${nowUnix}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (dailyRes.ok) {
    const dailies = await dailyRes.json() as Array<{
      summaryId: string;
      calendarDate: string;
      totalSteps: number;
      activeTimeInSeconds: number;
      activeKilocalories: number;
    }>;
    for (const day of dailies ?? []) {
      // Steps
      if (day.totalSteps > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "steps",
          value: day.totalSteps,
          externalId: `garmin_steps_${day.summaryId}`,
          note: `Garmin: ${day.totalSteps.toLocaleString()} steps on ${day.calendarDate}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
      // Active minutes
      const activeMins = Math.round(day.activeTimeInSeconds / 60);
      if (activeMins > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "active_minutes",
          value: activeMins,
          externalId: `garmin_active_${day.summaryId}`,
          note: `Garmin: ${activeMins} active min on ${day.calendarDate}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
      // Calories
      if (day.activeKilocalories > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "calories",
          value: day.activeKilocalories,
          externalId: `garmin_calories_${day.summaryId}`,
          note: `Garmin: ${day.activeKilocalories} active kcal on ${day.calendarDate}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
    }
  } else {
    logger.warn({ status: dailyRes.status }, "Garmin daily summaries fetch failed");
  }

  // ── Activity sessions ──────────────────────────────────────────────────────
  const activitiesRes = await fetch(
    `https://apis.garmin.com/wellness-api/rest/activities?uploadStartTimeInSeconds=${sinceUnix}&uploadEndTimeInSeconds=${nowUnix}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (activitiesRes.ok) {
    const activities = await activitiesRes.json() as Array<{
      summaryId: string;
      activityType: number;
      sportType?: number;
      subSportType?: number;
      activityName?: string;
      durationInSeconds: number;
      distanceInMeters?: number;
    }>;
    for (const act of activities ?? []) {
      const sportType = act.sportType ?? act.activityType;
      const activityType = mapGarminSport(sportType, act.subSportType);
      if (!activityType) continue;

      const durationMin = Math.round(act.durationInSeconds / 60);
      if (durationMin < 1) continue;

      const distanceMiles = act.distanceInMeters ? act.distanceInMeters / 1609.344 : undefined;
      const result = await logFitnessActivity({
        playerId,
        type: activityType,
        value: durationMin,
        externalId: `garmin_activity_${act.summaryId}`,
        note: `Garmin: ${act.activityName ?? activityType} (${durationMin} min)`,
        isPassiveSync: true,
        distanceMiles: distanceMiles ?? null,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: activitiesRes.status }, "Garmin activities fetch failed");
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  const sleepRes = await fetch(
    `https://apis.garmin.com/wellness-api/rest/sleeps?uploadStartTimeInSeconds=${sinceUnix}&uploadEndTimeInSeconds=${nowUnix}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (sleepRes.ok) {
    const sleeps = await sleepRes.json() as Array<{
      summaryId: string;
      calendarDate: string;
      durationInSeconds: number;
    }>;
    for (const s of sleeps ?? []) {
      const hours = Math.round((s.durationInSeconds / 3600) * 10) / 10;
      if (hours < 0.5) continue;
      const result = await logFitnessActivity({
        playerId,
        type: "sleep",
        value: hours,
        externalId: `garmin_sleep_${s.summaryId}`,
        note: `Garmin: ${hours}h sleep on ${s.calendarDate}`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: sleepRes.status }, "Garmin sleep fetch failed");
  }

  const lastSyncedAt = new Date();
  await db.update(healthConnectionsTable)
    .set({ lastSyncedAt })
    .where(eq(healthConnectionsTable.id, connection.id));

  return { activitiesImported, xpEarned, lastSyncedAt: lastSyncedAt.toISOString() };
}
