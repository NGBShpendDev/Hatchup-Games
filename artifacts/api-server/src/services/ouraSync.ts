import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { HealthConnection } from "@workspace/db";
import { encryptToken, decryptToken } from "./googleFitSync.ts";
import { logger } from "../lib/logger.ts";
import { logFitnessActivity } from "./fitnessLog.ts";

async function refreshOuraToken(connection: HealthConnection): Promise<string | null> {
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret || !connection.refreshToken) return null;

  try {
    const refreshToken = decryptToken(connection.refreshToken);
    const res = await fetch("https://api.ouraring.com/oauth/token", {
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
    const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
    await db.update(healthConnectionsTable)
      .set({
        accessToken: encryptToken(data.access_token),
        refreshToken: data.refresh_token ? encryptToken(data.refresh_token) : connection.refreshToken,
        tokenExpiresAt: expiresAt,
      })
      .where(eq(healthConnectionsTable.id, connection.id));
    return data.access_token;
  } catch (err) {
    logger.error({ err }, "Oura token refresh failed");
    return null;
  }
}

async function getValidOuraToken(connection: HealthConnection): Promise<string | null> {
  if (!connection.accessToken) return null;
  const isExpired = connection.tokenExpiresAt && connection.tokenExpiresAt < new Date(Date.now() + 60_000);
  if (isExpired) return await refreshOuraToken(connection);
  return decryptToken(connection.accessToken);
}

export async function syncOura(
  playerId: number,
  connection: HealthConnection,
): Promise<{ activitiesImported: number; xpEarned: number; lastSyncedAt: string }> {
  const accessToken = await getValidOuraToken(connection);
  if (!accessToken) throw new Error("Could not obtain valid Oura access token");

  const since = connection.lastSyncedAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const startDate = since.toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  let activitiesImported = 0;
  let xpEarned = 0;

  // ── Daily activity (steps + active calories) ───────────────────────────────
  const activityRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${startDate}&end_date=${endDate}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (activityRes.ok) {
    const actData = await activityRes.json() as {
      data: Array<{
        id: string;
        day: string;
        steps: number;
        active_calories: number;
        high_activity_time: number;
        medium_activity_time: number;
      }>;
    };
    for (const day of actData.data ?? []) {
      // Steps
      if (day.steps > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "steps",
          value: day.steps,
          externalId: `oura_steps_${day.id}`,
          note: `Oura Ring: ${day.steps.toLocaleString()} steps on ${day.day}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
      // Active minutes (high + medium intensity)
      const activeSec = (day.high_activity_time ?? 0) + (day.medium_activity_time ?? 0);
      const activeMins = Math.round(activeSec / 60);
      if (activeMins > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "active_minutes",
          value: activeMins,
          externalId: `oura_active_${day.id}`,
          note: `Oura Ring: ${activeMins} active min on ${day.day}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
      // Calories
      if (day.active_calories > 0) {
        const result = await logFitnessActivity({
          playerId,
          type: "calories",
          value: day.active_calories,
          externalId: `oura_calories_${day.id}`,
          note: `Oura Ring: ${day.active_calories} active kcal on ${day.day}`,
          isPassiveSync: true,
        });
        if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
      }
    }
  } else {
    logger.warn({ status: activityRes.status }, "Oura daily activity fetch failed");
  }

  // ── Sleep ──────────────────────────────────────────────────────────────────
  const sleepRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${startDate}&end_date=${endDate}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (sleepRes.ok) {
    const sleepData = await sleepRes.json() as {
      data: Array<{
        id: string;
        day: string;
        total_sleep_duration: number;
      }>;
    };
    for (const s of sleepData.data ?? []) {
      const hours = Math.round((s.total_sleep_duration / 3600) * 10) / 10;
      if (hours < 0.5) continue;
      const result = await logFitnessActivity({
        playerId,
        type: "sleep",
        value: hours,
        externalId: `oura_sleep_${s.id}`,
        note: `Oura Ring: ${hours}h sleep on ${s.day}`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: sleepRes.status }, "Oura sleep fetch failed");
  }

  // ── Workouts ───────────────────────────────────────────────────────────────
  const workoutRes = await fetch(
    `https://api.ouraring.com/v2/usercollection/workout?start_date=${startDate}&end_date=${endDate}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (workoutRes.ok) {
    const workoutData = await workoutRes.json() as {
      data: Array<{
        id: string;
        day: string;
        activity: string;
        duration: number;
        distance?: number;
      }>;
    };
    const OURA_ACTIVITY_MAP: Record<string, string> = {
      running: "running",
      walking: "walking",
      cycling: "cycling",
      swimming: "swimming",
      yoga: "yoga",
      strength_training: "weightlifting",
      high_intensity_interval_training: "hiit",
      meditation: "meditation",
      hiking: "walking",
      pilates: "yoga",
    };
    for (const w of workoutData.data ?? []) {
      const activityType = OURA_ACTIVITY_MAP[w.activity] ?? null;
      if (!activityType) continue;
      const durationMin = Math.round(w.duration / 60);
      if (durationMin < 1) continue;
      const distanceMiles = w.distance ? w.distance / 1609.344 : null;
      const result = await logFitnessActivity({
        playerId,
        type: activityType,
        value: durationMin,
        externalId: `oura_workout_${w.id}`,
        note: `Oura Ring: ${w.activity} (${durationMin} min)`,
        isPassiveSync: true,
        distanceMiles,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
    }
  } else {
    logger.warn({ status: workoutRes.status }, "Oura workouts fetch failed");
  }

  const lastSyncedAt = new Date();
  await db.update(healthConnectionsTable)
    .set({ lastSyncedAt })
    .where(eq(healthConnectionsTable.id, connection.id));

  return { activitiesImported, xpEarned, lastSyncedAt: lastSyncedAt.toISOString() };
}
