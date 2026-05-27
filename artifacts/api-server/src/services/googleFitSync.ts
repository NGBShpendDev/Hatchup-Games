import { db } from "@workspace/db";
import { healthConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { HealthConnection } from "@workspace/db";
import * as crypto from "crypto";
import { logger } from "../lib/logger";
import { logFitnessActivity } from "./fitnessLog";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production");
    }
    logger.warn("SESSION_SECRET not set — using insecure fallback for dev only");
    return "dev-only-insecure-fallback-never-use-in-prod";
  }
  return secret;
}

export function encryptToken(token: string): string {
  const key = crypto.scryptSync(getSecret(), "hatchup-health-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  try {
    const key = crypto.scryptSync(getSecret(), "hatchup-health-salt", 32);
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

export function createOAuthState(playerId: number): string {
  const secret = getSecret();
  const nonce = crypto.randomBytes(16).toString("hex");
  const ts = Date.now();
  const payload = `${playerId}:${ts}:${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyOAuthState(state: string): { playerId: number } | null {
  try {
    const secret = getSecret();
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return null;
    const [playerIdStr, tsStr] = payload.split(":");
    const ts = Number(tsStr);
    if (isNaN(ts) || Date.now() - ts > 10 * 60 * 1000) return null;
    const playerId = Number(playerIdStr);
    if (!Number.isInteger(playerId) || playerId <= 0) return null;
    return { playerId };
  } catch {
    return null;
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

const GOOGLE_FIT_SESSION_ACTIVITY_MAP: Record<number, string> = {
  7:   "running",
  8:   "running",
  9:   "cycling",
  37:  "hiit",
  48:  "walking",
  71:  "sleep",
  72:  "sleep",
  82:  "swimming",
  97:  "weightlifting",
  101: "walking",
  106: "yoga",
  108: "yoga",
  113: "meditation",
  119: "hiit",
};

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
        aggregateBy: [
          { dataTypeName: "com.google.step_count.delta" },
          { dataTypeName: "com.google.active_minutes" },
          { dataTypeName: "com.google.calories.expended" },
        ],
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
        dataset: Array<{
          dataSourceId: string;
          point: Array<{ value: Array<{ intVal?: number; fpVal?: number }> }>;
        }>;
      }>;
    };

    for (const bucket of aggregateData.bucket ?? []) {
      const day = new Date(Number(bucket.startTimeMillis)).toISOString().split("T")[0];

      for (const dataset of bucket.dataset ?? []) {
        const point = dataset.point?.[0];
        if (!point) continue;

        if (dataset.dataSourceId.includes("step_count")) {
          const steps = point.value?.[0]?.intVal ?? 0;
          if (steps > 0) {
            const externalId = `gfit_steps_${day}`;
            const result = await logFitnessActivity({
              playerId,
              type: "steps",
              value: steps,
              externalId,
              note: `Google Fit: ${steps} steps on ${day}`,
              isPassiveSync: true,
            });
            if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
          }
        } else if (dataset.dataSourceId.includes("active_minutes")) {
          const minutes = point.value?.[0]?.intVal ?? 0;
          if (minutes > 0) {
            const externalId = `gfit_active_min_${day}`;
            const result = await logFitnessActivity({
              playerId,
              type: "active_minutes",
              value: minutes,
              externalId,
              note: `Google Fit: ${minutes} active minutes on ${day}`,
              isPassiveSync: true,
            });
            if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
          }
        } else if (dataset.dataSourceId.includes("calories")) {
          const kcal = Math.round(point.value?.[0]?.fpVal ?? 0);
          if (kcal > 0) {
            const externalId = `gfit_calories_${day}`;
            const result = await logFitnessActivity({
              playerId,
              type: "calories",
              value: kcal,
              externalId,
              note: `Google Fit: ${kcal} kcal burned on ${day}`,
              isPassiveSync: true,
            });
            if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
          }
        }
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
      const activityName = GOOGLE_FIT_SESSION_ACTIVITY_MAP[session.activityType];
      if (!activityName) continue;
      const durationMs = Number(session.endTimeMillis) - Number(session.startTimeMillis);

      let value: number;
      if (activityName === "sleep") {
        value = Math.round(durationMs / 3_600_000 * 10) / 10;
        if (value < 0.5) continue;
      } else {
        value = Math.round(durationMs / 60000);
        if (value < 1) continue;
      }

      const externalId = `gfit_session_${session.id}`;
      const label = session.name ?? activityName;
      const result = await logFitnessActivity({
        playerId,
        type: activityName,
        value,
        externalId,
        note: `Google Fit: ${label} (${value}${activityName === "sleep" ? "h" : " min"})`,
        isPassiveSync: true,
      });
      if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
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
