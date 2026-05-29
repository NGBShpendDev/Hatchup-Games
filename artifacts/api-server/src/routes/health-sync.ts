import { Router } from "express";
import { db } from "@workspace/db";
import { healthConnectionsTable, playersTable, fitnessActivitiesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.ts";
import {
  encryptToken,
  syncGoogleFit,
  createOAuthState,
  verifyOAuthState,
} from "../services/googleFitSync.ts";
import { syncFitbit } from "../services/fitbitSync.ts";
import { syncGarmin } from "../services/garminSync.ts";
import { syncOura } from "../services/ouraSync.ts";
import { logFitnessActivity } from "../services/fitnessLog.ts";
import { logger } from "../lib/logger.ts";
import { z } from "zod/v4";

const router = Router();

function getFrontendBase(): string {
  if (process.env.NODE_ENV === "production") {
    return `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`;
  }
  return "";
}

function getCallbackUri(req: any, platform: string): string {
  const host = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;
  return `${host}/api/health/${platform}/callback`;
}

// ─── GET /health/connections ──────────────────────────────────────────────────
router.get("/health/connections", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const connections = await db.query.healthConnectionsTable.findMany({
    where: eq(healthConnectionsTable.playerId, player.id),
  });

  res.json(connections.map(c => ({
    id: c.id,
    platform: c.platform,
    isConnected: !!c.accessToken,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
    consentGivenAt: c.consentGivenAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
  })));
});

// ─── DELETE /health/connections/:platform ────────────────────────────────────
router.delete("/health/connections/:platform", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const platform = String(req.params.platform);
  await db.delete(healthConnectionsTable).where(
    and(
      eq(healthConnectionsTable.playerId, player.id),
      eq(healthConnectionsTable.platform, platform),
    )!,
  );
  res.json({ success: true });
});

// ─── POST /health/sync ────────────────────────────────────────────────────────
// Sync all connected platforms for the current player.
router.post("/health/sync", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const connections = await db.query.healthConnectionsTable.findMany({
    where: eq(healthConnectionsTable.playerId, player.id),
  });

  if (connections.length === 0) {
    res.status(400).json({ error: "No health connections found. Connect a fitness tracker first." });
    return;
  }

  const platformParam = req.query.platform as string | undefined;
  const toSync = platformParam
    ? connections.filter(c => c.platform === platformParam)
    : connections.filter(c => c.accessToken);

  let activitiesImported = 0;
  let xpEarned = 0;
  const errors: string[] = [];

  for (const conn of toSync) {
    try {
      let result: { activitiesImported: number; xpEarned: number } = { activitiesImported: 0, xpEarned: 0 };
      if (conn.platform === "google_fit") result = await syncGoogleFit(player.id, conn);
      else if (conn.platform === "fitbit") result = await syncFitbit(player.id, conn);
      else if (conn.platform === "garmin") result = await syncGarmin(player.id, conn);
      else if (conn.platform === "oura") result = await syncOura(player.id, conn);
      activitiesImported += result.activitiesImported;
      xpEarned += result.xpEarned;
    } catch (err: any) {
      logger.warn({ err, platform: conn.platform }, "Sync failed for platform");
      errors.push(conn.platform);
    }
  }

  res.json({
    activitiesImported,
    xpEarned,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// ─── POST /health/acknowledge-passive-xp ─────────────────────────────────────
router.post("/health/acknowledge-passive-xp", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  await db.update(playersTable)
    .set({ passiveXpSinceLastVisit: 0 })
    .where(eq(playersTable.id, player.id));
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE FIT OAuth
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/health/google/connect", requireAuth, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google Fit not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const state = createOAuthState(player.id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(req, "google"),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.sleep.read",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/health/google/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }
  const playerId = verified.playerId;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.redirect(`${base}/health-settings?error=not_configured`); return; }

  let tokens: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getCallbackUri(req, "google"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) { res.redirect(`${base}/health-settings?error=token_exchange_failed`); return; }
    tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
  } catch {
    res.redirect(`${base}/health-settings?error=network_error`);
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "google_fit")),
  });
  let connectionId: number;
  if (existing) {
    await db.update(healthConnectionsTable)
      .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt })
      .where(eq(healthConnectionsTable.id, existing.id));
    connectionId = existing.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId, platform: "google_fit",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  res.redirect(`${base}/health-settings?connected=google_fit`);
  setImmediate(async () => {
    try {
      const conn = await db.query.healthConnectionsTable.findFirst({ where: eq(healthConnectionsTable.id, connectionId) });
      if (conn) await syncGoogleFit(playerId, conn);
    } catch (err) { logger.error({ err, playerId }, "Google Fit initial backfill failed"); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FITBIT OAuth
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/health/fitbit/connect", requireAuth, async (req, res) => {
  const clientId = process.env.FITBIT_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Fitbit not configured. Add FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET." });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const state = createOAuthState(player.id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(req, "fitbit"),
    response_type: "code",
    scope: "activity heartrate sleep profile",
    state,
  });
  res.redirect(`https://www.fitbit.com/oauth2/authorize?${params.toString()}`);
});

router.get("/health/fitbit/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }
  const playerId = verified.playerId;

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.redirect(`${base}/health-settings?error=not_configured`); return; }

  let tokens: { access_token: string; refresh_token: string; expires_in: number };
  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${creds}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: getCallbackUri(req, "fitbit"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) { res.redirect(`${base}/health-settings?error=token_exchange_failed`); return; }
    tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };
  } catch {
    res.redirect(`${base}/health-settings?error=network_error`);
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "fitbit")),
  });
  let connectionId: number;
  if (existing) {
    await db.update(healthConnectionsTable)
      .set({ accessToken: encryptToken(tokens.access_token), refreshToken: encryptToken(tokens.refresh_token), tokenExpiresAt: expiresAt })
      .where(eq(healthConnectionsTable.id, existing.id));
    connectionId = existing.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId, platform: "fitbit",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: encryptToken(tokens.refresh_token),
      tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  res.redirect(`${base}/health-settings?connected=fitbit`);
  setImmediate(async () => {
    try {
      const conn = await db.query.healthConnectionsTable.findFirst({ where: eq(healthConnectionsTable.id, connectionId) });
      if (conn) await syncFitbit(playerId, conn);
    } catch (err) { logger.error({ err, playerId }, "Fitbit initial backfill failed"); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GARMIN OAuth
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/health/garmin/connect", requireAuth, async (req, res) => {
  const clientId = process.env.GARMIN_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Garmin not configured. Add GARMIN_CLIENT_ID and GARMIN_CLIENT_SECRET." });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const state = createOAuthState(player.id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(req, "garmin"),
    response_type: "code",
    scope: "ACTIVITY_EXPORT HEALTH_EXPORT",
    state,
  });
  res.redirect(`https://connect.garmin.com/oauth2/authorize?${params.toString()}`);
});

router.get("/health/garmin/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }
  const playerId = verified.playerId;

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.redirect(`${base}/health-settings?error=not_configured`); return; }

  let tokens: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    const tokenRes = await fetch("https://connectapi.garmin.com/oauth-service/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getCallbackUri(req, "garmin"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) { res.redirect(`${base}/health-settings?error=token_exchange_failed`); return; }
    tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
  } catch {
    res.redirect(`${base}/health-settings?error=network_error`);
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "garmin")),
  });
  let connectionId: number;
  if (existing) {
    await db.update(healthConnectionsTable)
      .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt })
      .where(eq(healthConnectionsTable.id, existing.id));
    connectionId = existing.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId, platform: "garmin",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  res.redirect(`${base}/health-settings?connected=garmin`);
  setImmediate(async () => {
    try {
      const conn = await db.query.healthConnectionsTable.findFirst({ where: eq(healthConnectionsTable.id, connectionId) });
      if (conn) await syncGarmin(playerId, conn);
    } catch (err) { logger.error({ err, playerId }, "Garmin initial backfill failed"); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// OURA OAuth
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/health/oura/connect", requireAuth, async (req, res) => {
  const clientId = process.env.OURA_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Oura not configured. Add OURA_CLIENT_ID and OURA_CLIENT_SECRET." });
    return;
  }
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const state = createOAuthState(player.id);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUri(req, "oura"),
    response_type: "code",
    scope: "daily heartrate personal workout",
    state,
  });
  res.redirect(`https://cloud.ouraring.com/oauth/authorize?${params.toString()}`);
});

router.get("/health/oura/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }
  const playerId = verified.playerId;

  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;
  if (!clientId || !clientSecret) { res.redirect(`${base}/health-settings?error=not_configured`); return; }

  let tokens: { access_token: string; refresh_token?: string; expires_in?: number };
  try {
    const tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getCallbackUri(req, "oura"),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) { res.redirect(`${base}/health-settings?error=token_exchange_failed`); return; }
    tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  } catch {
    res.redirect(`${base}/health-settings?error=network_error`);
    return;
  }

  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "oura")),
  });
  let connectionId: number;
  if (existing) {
    await db.update(healthConnectionsTable)
      .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt })
      .where(eq(healthConnectionsTable.id, existing.id));
    connectionId = existing.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId, platform: "oura",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  res.redirect(`${base}/health-settings?connected=oura`);
  setImmediate(async () => {
    try {
      const conn = await db.query.healthConnectionsTable.findFirst({ where: eq(healthConnectionsTable.id, connectionId) });
      if (conn) await syncOura(playerId, conn);
    } catch (err) { logger.error({ err, playerId }, "Oura initial backfill failed"); }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPLE HEALTH (mobile push — HealthKit data sent from the iOS app)
// ═══════════════════════════════════════════════════════════════════════════════

const AppleHealthPayloadSchema = z.object({
  steps: z.number().int().min(0).optional(),
  activeMinutes: z.number().int().min(0).optional(),
  caloriesBurned: z.number().min(0).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workouts: z.array(z.object({
    type: z.string(),
    durationMin: z.number().int().min(1),
    calories: z.number().min(0).optional(),
    distanceMiles: z.number().min(0).optional(),
    startedAt: z.string().optional(),
  })).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  sleepDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  heartRateAvg: z.number().min(20).max(300).optional(),
});

const APPLE_HEALTH_ACTIVITY_MAP: Record<string, string> = {
  running: "running",
  "traditional running": "running",
  walking: "walking",
  hiking: "walking",
  cycling: "cycling",
  "indoor cycling": "cycling",
  swimming: "swimming",
  yoga: "yoga",
  "functional strength training": "weightlifting",
  "strength training": "weightlifting",
  "high intensity interval training": "hiit",
  hiit: "hiit",
  pilates: "yoga",
  meditation: "meditation",
  cooldown: "stretching",
  "core training": "weightlifting",
  "cross training": "hiit",
  "rowing": "swimming",
  "elliptical": "active_minutes",
  "stair climbing": "active_minutes",
  "dance": "active_minutes",
};

router.post("/health/apple/sync", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const parsed = AppleHealthPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
    return;
  }

  const data = parsed.data;
  const today = data.date ?? new Date().toISOString().slice(0, 10);

  let activitiesImported = 0;
  let xpEarned = 0;

  // Ensure a connection record exists for apple_health
  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, player.id), eq(healthConnectionsTable.platform, "apple_health")),
  });
  let connectionId: number;
  if (existing) {
    connectionId = existing.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId: player.id,
      platform: "apple_health",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  // Steps
  if (data.steps && data.steps > 0) {
    const result = await logFitnessActivity({
      playerId: player.id,
      type: "steps",
      value: data.steps,
      externalId: `apple_steps_${today}`,
      note: `Apple Health: ${data.steps.toLocaleString()} steps on ${today}`,
      isPassiveSync: true,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Active minutes
  if (data.activeMinutes && data.activeMinutes > 0) {
    const result = await logFitnessActivity({
      playerId: player.id,
      type: "active_minutes",
      value: data.activeMinutes,
      externalId: `apple_active_${today}`,
      note: `Apple Health: ${data.activeMinutes} active min on ${today}`,
      isPassiveSync: true,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Calories
  if (data.caloriesBurned && data.caloriesBurned > 0) {
    const result = await logFitnessActivity({
      playerId: player.id,
      type: "calories",
      value: Math.round(data.caloriesBurned),
      externalId: `apple_calories_${today}`,
      note: `Apple Health: ${Math.round(data.caloriesBurned)} kcal on ${today}`,
      isPassiveSync: true,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Sleep
  if (data.sleepHours && data.sleepHours >= 0.5) {
    const sleepDate = data.sleepDate ?? today;
    const result = await logFitnessActivity({
      playerId: player.id,
      type: "sleep",
      value: Math.round(data.sleepHours * 10) / 10,
      externalId: `apple_sleep_${sleepDate}`,
      note: `Apple Health: ${data.sleepHours}h sleep on ${sleepDate}`,
      isPassiveSync: true,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Workouts
  for (const w of data.workouts ?? []) {
    const activityType = APPLE_HEALTH_ACTIVITY_MAP[w.type.toLowerCase()] ?? null;
    if (!activityType) continue;
    const startedAt = w.startedAt ?? new Date().toISOString();
    const externalId = `apple_workout_${w.type}_${startedAt.slice(0, 16).replace(/\D/g, "")}`;
    const result = await logFitnessActivity({
      playerId: player.id,
      type: activityType,
      value: w.durationMin,
      externalId,
      note: `Apple Health: ${w.type} (${w.durationMin} min)`,
      isPassiveSync: true,
      distanceMiles: w.distanceMiles ?? null,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Update lastSyncedAt on the apple_health connection
  await db.update(healthConnectionsTable)
    .set({ lastSyncedAt: new Date() })
    .where(eq(healthConnectionsTable.id, connectionId));

  res.json({ activitiesImported, xpEarned });
});

export default router;
