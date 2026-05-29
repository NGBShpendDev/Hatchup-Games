import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { HealthConnection } from "@workspace/db";
import { encryptToken, decryptToken } from "./googleFitSync.ts";
import { logger } from "../lib/logger.ts";
import { logFitnessActivity } from "./fitnessLog.ts";

async function refreshFitbitToken(connection: HealthConnection): Promise<string | null> {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret || !connection.refreshToken) return null;

  try {
    const refreshToken = decryptToken(connection.refreshToken);
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${creds}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await db.update(healthConnectionsTable)
      .set({
        accessToken: encryptToken(data.access_token),
        refreshToken: encryptToken(data.refresh_token),
        tokenExpiresAt: expiresAt,
      })
      .where(eq(healthConnectionsTable.id, connection.id));
    return data.access_token;
  } catch (err) {
    logger.error({ err }, "Fitbit token refresh failed");
    return null;
  }
}

async function getValidFitbitToken(connection: HealthConnection): Promise<string | null> {
  if (!connection.accessToken) return null;
  const isExpired = connection.tokenExpiresAt && connection.tokenExpiresAt < new Date(Date.now() + 60_000);
  if (isExpired) return await refreshFitbitToken(connection);
  return decryptToken(connection.accessToken);
}

const FITBIT_ACTIVITY_NAME_MAP: Record<string, string> = {
  run: "running",
  jog: "running",
  walk: "walking",
  hike: "walking",
  cycl: "cycling",
  bike: "cycling",
  swim: "swimming",
  yoga: "yoga",
  pilat: "yoga",
  weight: "weightlifting",
  strength: "weightlifting",
  lift: "weightlifting",
  hiit: "hiit",
  interval: "hiit",
  circuit: "hiit",
  meditat: "meditation",
  sleep: "sleep",
};

function mapFitbitActivity(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, val] of Object.entries(FITBIT_ACTIVITY_NAME_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export async function syncFitbit(
  playerId: number,
  connection: HealthConnection,
): Promise<{ activitiesImported: number; xpEarned: number; lastSyncedAt: string }> {
  const accessToken = await getValidFitbitToken(connection);
  if (!accessToken) throw new Error("Could not obtain valid Fitbit access token");

  const since = connection.lastSyncedAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayCount = Math.min(7, Math.ceil((Date.now() - since.getTime()) / 86_400_000) + 1);

  let activitiesImported = 0;
  let xpEarned = 0;

  // ── Steps ──────────────────────────────────────────────────────────────────
  const stepsRes = await fetch(
    `https://api.fitbit.com/1/user/-/activities/steps/date/today/${dayCount}d.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (stepsRes.ok) {
    const stepsData = await stepsRes.json() as { "activities-steps": Array<{ dateTime: string; value: string }> };
    for (const day of stepsData["activities-steps"] ?? []) {
      const steps = Number(day.value);
      if (steps <= 0 || new Date(day.dateTime) < since) continue;
      const result = await logFitnessActivity({
        playerId,
        type: "steps",
        value: steps,
        externalId: `fitbit_steps_${day.dateTime}`,
        note: `Fitbit: ${steps.toLocaleString()} steps on ${day.dateTime}`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: stepsRes.status }, "Fitbit steps fetch failed");
  }

  // ── Active minutes ─────────────────────────────────────────────────────────
  const activeRes = await fetch(
    `https://api.fitbit.com/1/user/-/activities/minutesVeryActive/date/today/${dayCount}d.json`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (activeRes.ok) {
    const activeData = await activeRes.json() as { "activities-minutesVeryActive": Array<{ dateTime: string; value: string }> };
    for (const day of activeData["activities-minutesVeryActive"] ?? []) {
      const mins = Number(day.value);
      if (mins <= 0 || new Date(day.dateTime) < since) continue;
      const result = await logFitnessActivity({
        playerId,
        type: "active_minutes",
        value: mins,
        externalId: `fitbit_active_${day.dateTime}`,
        note: `Fitbit: ${mins} active min on ${day.dateTime}`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: activeRes.status }, "Fitbit active minutes fetch failed");
  }

  // ── Activity log (workout sessions) ────────────────────────────────────────
  const sinceDate = since.toISOString().slice(0, 10);
  const logRes = await fetch(
    `https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${sinceDate}&sort=asc&limit=20&offset=0`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (logRes.ok) {
    const logData = await logRes.json() as {
      activities: Array<{ logId: number; activityName: string; duration: number }>;
    };
    for (const act of logData.activities ?? []) {
      const activityType = mapFitbitActivity(act.activityName);
      if (!activityType) continue;
      const durationMin = Math.round(act.duration / 60_000);
      if (durationMin < 1) continue;
      const result = await logFitnessActivity({
        playerId,
        type: activityType,
        value: durationMin,
        externalId: `fitbit_activity_${act.logId}`,
        note: `Fitbit: ${act.activityName} (${durationMin} min)`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: logRes.status }, "Fitbit activity log fetch failed");
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  const sleepRes = await fetch(
    `https://api.fitbit.com/1.2/user/-/sleep/list.json?afterDate=${sinceDate}&sort=asc&limit=7&offset=0`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (sleepRes.ok) {
    const sleepData = await sleepRes.json() as {
      sleep: Array<{ logId: number; dateOfSleep: string; duration: number; isMainSleep: boolean }>;
    };
    for (const s of sleepData.sleep ?? []) {
      if (!s.isMainSleep) continue;
      const hours = Math.round((s.duration / 3_600_000) * 10) / 10;
      if (hours < 0.5) continue;
      const result = await logFitnessActivity({
        playerId,
        type: "sleep",
        value: hours,
        externalId: `fitbit_sleep_${s.logId}`,
        note: `Fitbit: ${hours}h sleep on ${s.dateOfSleep}`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: sleepRes.status }, "Fitbit sleep fetch failed");
  }

  const lastSyncedAt = new Date();
  await db.update(healthConnectionsTable)
    .set({ lastSyncedAt })
    .where(eq(healthConnectionsTable.id, connection.id));

  return { activitiesImported, xpEarned, lastSyncedAt: lastSyncedAt.toISOString() };
}
