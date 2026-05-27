import { db } from "@workspace/db";
import {
  fitnessActivitiesTable,
  healthConnectionsTable,
  playersTable,
  eggsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import type { HealthConnection } from "@workspace/db";
import * as crypto from "crypto";
import { logger } from "../lib/logger";

const ACTIVITY_CONFIG: Record<string, { unit: string; xpPer: number; realm: string; stepsEquiv: number }> = {
  steps:         { unit: "steps",   xpPer: 0.05, realm: "cardio",   stepsEquiv: 1 },
  running:       { unit: "minutes", xpPer: 8,    realm: "cardio",   stepsEquiv: 150 },
  walking:       { unit: "minutes", xpPer: 4,    realm: "cardio",   stepsEquiv: 100 },
  cycling:       { unit: "minutes", xpPer: 6,    realm: "cardio",   stepsEquiv: 80 },
  weightlifting: { unit: "minutes", xpPer: 7,    realm: "strength", stepsEquiv: 60 },
  hiit:          { unit: "minutes", xpPer: 10,   realm: "beast",    stepsEquiv: 200 },
  yoga:          { unit: "minutes", xpPer: 4,    realm: "balance",  stepsEquiv: 40 },
  swimming:      { unit: "minutes", xpPer: 7,    realm: "beast",    stepsEquiv: 120 },
  sleep:         { unit: "hours",   xpPer: 15,   realm: "balance",  stepsEquiv: 200 },
};

const GOOGLE_FIT_ACTIVITY_MAP: Record<number, string> = {
  7:   "running",
  8:   "running",
  9:   "cycling",
  37:  "hiit",
  48:  "walking",
  82:  "swimming",
  97:  "weightlifting",
  101: "walking",
  106: "yoga",
  119: "hiit",
};

export function encryptToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-hatchup-secret";
  const key = crypto.scryptSync(secret, "hatchup-health-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  try {
    const secret = process.env.SESSION_SECRET ?? "dev-hatchup-secret";
    const key = crypto.scryptSync(secret, "hatchup-health-salt", 32);
    const buf = Buffer.from(encrypted, "base64");
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const encryptedData = buf.subarray(32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function refreshAccessToken(connection: HealthConnection): Promise<string | null> {
  if (!connection.refreshToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const refreshToken = decryptToken(connection.refreshToken);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    const newToken = data.access_token;
    const expiresAt = new Date(Date.now() + data.expires_in * 1000);
    await db.update(healthConnectionsTable)
      .set({ accessToken: encryptToken(newToken), tokenExpiresAt: expiresAt })
      .where(eq(healthConnectionsTable.id, connection.id));
    return newToken;
  } catch (err) {
    logger.error({ err }, "Token refresh failed");
    return null;
  }
}

async function getValidAccessToken(connection: HealthConnection): Promise<string | null> {
  if (!connection.accessToken) return null;
  const isExpired = connection.tokenExpiresAt && connection.tokenExpiresAt < new Date(Date.now() + 60_000);
  if (isExpired) return await refreshAccessToken(connection);
  return decryptToken(connection.accessToken);
}

async function logActivityForPlayer(
  playerId: number,
  type: string,
  value: number,
  externalId: string,
  note: string,
): Promise<number> {
  const existing = await db.query.fitnessActivitiesTable.findFirst({
    where: and(
      eq(fitnessActivitiesTable.playerId, playerId),
      eq(fitnessActivitiesTable.externalId, externalId),
    ),
  });
  if (existing) return 0;

  const config = ACTIVITY_CONFIG[type] ?? { unit: "reps", xpPer: 1, realm: "strength", stepsEquiv: 0 };
  const fitnessXpEarned = Math.round(value * config.xpPer);
  const stepsEquiv = Math.round(value * config.stepsEquiv);

  await db.insert(fitnessActivitiesTable).values({
    playerId,
    type,
    value,
    unit: config.unit,
    fitnessXpEarned,
    realm: config.realm,
    note,
    externalId,
  });

  const isWorkout = type !== "steps" && type !== "hydration" && type !== "sleep";
  await db.update(playersTable)
    .set({
      fitnessXp: sql`fitness_xp + ${fitnessXpEarned}`,
      totalSteps: sql`total_steps + ${stepsEquiv}`,
      totalWorkouts: sql`total_workouts + ${isWorkout ? 1 : 0}`,
      passiveXpSinceLastVisit: sql`passive_xp_since_last_visit + ${fitnessXpEarned}`,
    })
    .where(eq(playersTable.id, playerId));

  if (stepsEquiv > 0) {
    const activeEggs = await db.query.eggsTable.findMany({
      where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.isHatched, false)),
    });
    for (const egg of activeEggs) {
      const newProgress = Math.min(egg.stepsRequired, egg.stepsProgress + stepsEquiv);
      await db.update(eggsTable)
        .set({ stepsProgress: newProgress })
        .where(eq(eggsTable.id, egg.id));
    }
  }

  return fitnessXpEarned;
}

export async function syncGoogleFit(
  playerId: number,
  connection: HealthConnection,
): Promise<{ activitiesImported: number; xpEarned: number; lastSyncedAt: string }> {
  const accessToken = await getValidAccessToken(connection);
  if (!accessToken) {
    throw new Error("Could not obtain valid access token");
  }

  const now = Date.now();
  const since = connection.lastSyncedAt
    ? connection.lastSyncedAt.getTime()
    : now - 7 * 24 * 60 * 60 * 1000;

  let activitiesImported = 0;
  let xpEarned = 0;

  const startTimeMillis = since;
  const endTimeMillis = now;

  const aggregateRes = await fetch(
    "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis,
        endTimeMillis,
      }),
    },
  );

  if (aggregateRes.ok) {
    const aggregateData = await aggregateRes.json() as {
      bucket: Array<{
        startTimeMillis: string;
        dataset: Array<{ point: Array<{ value: Array<{ intVal?: number }> }> }>;
      }>;
    };
    for (const bucket of aggregateData.bucket ?? []) {
      const dataset = bucket.dataset?.[0];
      const point = dataset?.point?.[0];
      const steps = point?.value?.[0]?.intVal ?? 0;
      if (steps > 0) {
        const day = new Date(Number(bucket.startTimeMillis)).toISOString().split("T")[0];
        const externalId = `gfit_steps_${day}`;
        const xp = await logActivityForPlayer(playerId, "steps", steps, externalId, `Google Fit: ${steps} steps on ${day}`);
        if (xp > 0) { activitiesImported++; xpEarned += xp; }
      }
    }
  } else {
    logger.warn({ status: aggregateRes.status }, "Google Fit aggregate request failed");
  }

  const sessionsRes = await fetch(
    `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${new Date(startTimeMillis).toISOString()}&endTime=${new Date(endTimeMillis).toISOString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (sessionsRes.ok) {
    const sessionsData = await sessionsRes.json() as {
      session: Array<{
        id: string;
        activityType: number;
        startTimeMillis: string;
        endTimeMillis: string;
        name?: string;
      }>;
    };
    for (const session of sessionsData.session ?? []) {
      const activityName = GOOGLE_FIT_ACTIVITY_MAP[session.activityType];
      if (!activityName) continue;
      const durationMs = Number(session.endTimeMillis) - Number(session.startTimeMillis);
      const durationMinutes = Math.round(durationMs / 60000);
      if (durationMinutes < 1) continue;
      const externalId = `gfit_session_${session.id}`;
      const label = session.name ?? activityName;
      const xp = await logActivityForPlayer(
        playerId,
        activityName,
        durationMinutes,
        externalId,
        `Google Fit: ${label} (${durationMinutes} min)`,
      );
      if (xp > 0) { activitiesImported++; xpEarned += xp; }
    }
  } else {
    logger.warn({ status: sessionsRes.status }, "Google Fit sessions request failed");
  }

  const lastSyncedAt = new Date();
  await db.update(healthConnectionsTable)
    .set({ lastSyncedAt })
    .where(eq(healthConnectionsTable.id, connection.id));

  return { activitiesImported, xpEarned, lastSyncedAt: lastSyncedAt.toISOString() };
}
