import { Router } from "express";
import { db } from "@workspace/db";
import { healthConnectionsTable, playersTable, fitnessActivitiesTable } from "@workspace/db";
import { eq, and, gte, like, sql } from "drizzle-orm";
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
      "openid",
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.sleep.read",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get("/health/google/callback", requireAuth, async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }

  const sessionPlayer = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!sessionPlayer || sessionPlayer.id !== verified.playerId) {
    res.redirect(`${base}/health-settings?error=session_mismatch`);
    return;
  }
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

  // Fetch the provider subject identifier for one-to-one account binding (fail-closed).
  // Linking is rejected if we cannot resolve a stable provider subject ID, preventing
  // bypass via network failures or misconfigured credentials.
  let googleProviderAccountId: string | null = null;
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { sub?: string };
      googleProviderAccountId = profile.sub ?? null;
    }
  } catch {
    logger.warn({ playerId }, "Google Fit: could not fetch userinfo for provider binding check");
  }

  // Fail-closed: require a resolved subject ID to proceed.
  if (!googleProviderAccountId) {
    res.redirect(`${base}/health-settings?error=provider_identity_unavailable`);
    return;
  }

  // Enforce one-to-one: reject if this Google account is already bound to a different player.
  const googleConflict = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.platform, "google_fit"),
      eq(healthConnectionsTable.providerAccountId, googleProviderAccountId),
    ),
  });
  if (googleConflict && googleConflict.playerId !== playerId) {
    res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
    return;
  }

  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "google_fit")),
  });
  let connectionId: number;
  try {
    if (existing) {
      await db.update(healthConnectionsTable)
        .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt, providerAccountId: googleProviderAccountId })
        .where(eq(healthConnectionsTable.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await db.insert(healthConnectionsTable).values({
        playerId, platform: "google_fit",
        providerAccountId: googleProviderAccountId,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
      }).returning({ id: healthConnectionsTable.id });
      connectionId = inserted.id;
    }
  } catch (err: unknown) {
    // Unique constraint violation — race condition where another player linked first
    if ((err as { code?: string }).code === "23505") {
      res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
      return;
    }
    throw err;
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

router.get("/health/fitbit/callback", requireAuth, async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }

  const sessionPlayer = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!sessionPlayer || sessionPlayer.id !== verified.playerId) {
    res.redirect(`${base}/health-settings?error=session_mismatch`);
    return;
  }
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

  // Fetch the provider subject identifier for one-to-one account binding (fail-closed).
  let fitbitProviderAccountId: string | null = null;
  try {
    const profileRes = await fetch("https://api.fitbit.com/1/user/-/profile.json", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { user?: { encodedId?: string } };
      fitbitProviderAccountId = profile.user?.encodedId ?? null;
    }
  } catch {
    logger.warn({ playerId }, "Fitbit: could not fetch profile for provider binding check");
  }

  // Fail-closed: require a resolved subject ID to proceed.
  if (!fitbitProviderAccountId) {
    res.redirect(`${base}/health-settings?error=provider_identity_unavailable`);
    return;
  }

  // Enforce one-to-one: reject if this Fitbit account is already bound to a different player.
  const fitbitConflict = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.platform, "fitbit"),
      eq(healthConnectionsTable.providerAccountId, fitbitProviderAccountId),
    ),
  });
  if (fitbitConflict && fitbitConflict.playerId !== playerId) {
    res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
    return;
  }

  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "fitbit")),
  });
  let connectionId: number;
  try {
    if (existing) {
      await db.update(healthConnectionsTable)
        .set({ accessToken: encryptToken(tokens.access_token), refreshToken: encryptToken(tokens.refresh_token), tokenExpiresAt: expiresAt, providerAccountId: fitbitProviderAccountId })
        .where(eq(healthConnectionsTable.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await db.insert(healthConnectionsTable).values({
        playerId, platform: "fitbit",
        providerAccountId: fitbitProviderAccountId,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
      }).returning({ id: healthConnectionsTable.id });
      connectionId = inserted.id;
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
      return;
    }
    throw err;
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

router.get("/health/garmin/callback", requireAuth, async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }

  const sessionPlayer = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!sessionPlayer || sessionPlayer.id !== verified.playerId) {
    res.redirect(`${base}/health-settings?error=session_mismatch`);
    return;
  }
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

  // Fetch the provider subject identifier for one-to-one account binding (fail-closed).
  let garminProviderAccountId: string | null = null;
  try {
    const profileRes = await fetch("https://apis.garmin.com/wellness-api/rest/user/id", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { userId?: string };
      garminProviderAccountId = profile.userId ?? null;
    }
  } catch {
    logger.warn({ playerId }, "Garmin: could not fetch user ID for provider binding check");
  }

  // Fail-closed: require a resolved subject ID to proceed.
  if (!garminProviderAccountId) {
    res.redirect(`${base}/health-settings?error=provider_identity_unavailable`);
    return;
  }

  // Enforce one-to-one: reject if this Garmin account is already bound to a different player.
  const garminConflict = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.platform, "garmin"),
      eq(healthConnectionsTable.providerAccountId, garminProviderAccountId),
    ),
  });
  if (garminConflict && garminConflict.playerId !== playerId) {
    res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
    return;
  }

  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "garmin")),
  });
  let connectionId: number;
  try {
    if (existing) {
      await db.update(healthConnectionsTable)
        .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt, providerAccountId: garminProviderAccountId })
        .where(eq(healthConnectionsTable.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await db.insert(healthConnectionsTable).values({
        playerId, platform: "garmin",
        providerAccountId: garminProviderAccountId,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
      }).returning({ id: healthConnectionsTable.id });
      connectionId = inserted.id;
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
      return;
    }
    throw err;
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

router.get("/health/oura/callback", requireAuth, async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  const base = getFrontendBase();
  if (error || !code || !state) { res.redirect(`${base}/health-settings?error=oauth_denied`); return; }

  const verified = verifyOAuthState(state);
  if (!verified) { res.redirect(`${base}/health-settings?error=invalid_state`); return; }

  const sessionPlayer = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!sessionPlayer || sessionPlayer.id !== verified.playerId) {
    res.redirect(`${base}/health-settings?error=session_mismatch`);
    return;
  }
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

  // Fetch the provider subject identifier for one-to-one account binding (fail-closed).
  let ouraProviderAccountId: string | null = null;
  try {
    const profileRes = await fetch("https://api.ouraring.com/v2/usercollection/personal_info", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json() as { id?: string };
      ouraProviderAccountId = profile.id ?? null;
    }
  } catch {
    logger.warn({ playerId }, "Oura: could not fetch personal info for provider binding check");
  }

  // Fail-closed: require a resolved subject ID to proceed.
  if (!ouraProviderAccountId) {
    res.redirect(`${base}/health-settings?error=provider_identity_unavailable`);
    return;
  }

  // Enforce one-to-one: reject if this Oura account is already bound to a different player.
  const ouraConflict = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.platform, "oura"),
      eq(healthConnectionsTable.providerAccountId, ouraProviderAccountId),
    ),
  });
  if (ouraConflict && ouraConflict.playerId !== playerId) {
    res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
    return;
  }

  const existing = await db.query.healthConnectionsTable.findFirst({
    where: and(eq(healthConnectionsTable.playerId, playerId), eq(healthConnectionsTable.platform, "oura")),
  });
  let connectionId: number;
  try {
    if (existing) {
      await db.update(healthConnectionsTable)
        .set({ accessToken: encryptToken(tokens.access_token), refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null, tokenExpiresAt: expiresAt, providerAccountId: ouraProviderAccountId })
        .where(eq(healthConnectionsTable.id, existing.id));
      connectionId = existing.id;
    } else {
      const [inserted] = await db.insert(healthConnectionsTable).values({
        playerId, platform: "oura",
        providerAccountId: ouraProviderAccountId,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt, consentGivenAt: new Date(),
      }).returning({ id: healthConnectionsTable.id });
      connectionId = inserted.id;
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      res.redirect(`${base}/health-settings?error=provider_account_already_linked`);
      return;
    }
    throw err;
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

// Maximum lookback window for Apple Health payloads (7 days).
// Data older than this cannot be submitted — it may represent replayed or
// fabricated historical entries designed to bypass deduplication.
const APPLE_HEALTH_MAX_LOOKBACK_DAYS = 7;

// Per-player, per-calendar-day hard caps on Apple Health workout data.
// These are enforced across all requests (not just per-payload) by querying
// what is already in the DB before accepting new workouts. This closes the
// repeated-request abuse where an attacker submits many payloads with distinct
// synthetic timestamps to keep minting unique externalIds.
//
// 600 minutes = 10 hours of workouts in a day (generous for ultra-endurance events)
// 20 sessions  = more than enough for any real day of interval or circuit training
const DAILY_APPLE_WORKOUT_MINUTES_CAP = 600;
const DAILY_APPLE_WORKOUT_COUNT_CAP = 20;

function isDateInRange(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = Date.now();
  const minMs = now - APPLE_HEALTH_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return d.getTime() <= now && d.getTime() >= minMs;
}

const AppleHealthPayloadSchema = z.object({
  // Hard caps: even elite-level athletes cannot legitimately exceed these in a
  // single day. Values above the caps indicate fabricated / replayed data.
  steps: z.number().int().min(0).max(100_000).optional(),
  activeMinutes: z.number().int().min(0).max(480).optional(),
  caloriesBurned: z.number().min(0).max(10_000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workouts: z.array(z.object({
    type: z.string().max(64),
    // Cap per-workout duration at 8 hours; anything longer is implausible and
    // would award an outsized amount of XP for a single session.
    durationMin: z.number().int().min(1).max(480),
    calories: z.number().min(0).max(10_000).optional(),
    distanceMiles: z.number().min(0).max(200).optional(),
    startedAt: z.string().optional(),
  // Limit to 25 workouts per sync — more than enough for any real day.
  })).max(25).optional(),
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

  // ── Date-range validation ────────────────────────────────────────────────────
  // The `date` field (and each workout's `startedAt`) must fall within the last
  // 7 days and must not be in the future. Dates outside this window are a
  // strong signal of replayed or fabricated historical payloads.
  const today = data.date ?? new Date().toISOString().slice(0, 10);
  if (!isDateInRange(today)) {
    res.status(422).json({ error: "date out of range", detail: "date must be within the last 7 days and not in the future" });
    return;
  }
  if (data.sleepDate && !isDateInRange(data.sleepDate)) {
    res.status(422).json({ error: "sleepDate out of range", detail: "sleepDate must be within the last 7 days and not in the future" });
    return;
  }

  const now = Date.now();
  const maxLookbackMs = APPLE_HEALTH_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  // Validate and normalise each workout's startedAt, and deduplicate by
  // externalId within the same payload to prevent a single request from
  // submitting hundreds of synthetic entries with distinct timestamps.
  const seenExternalIds = new Set<string>();
  const validWorkouts: Array<{ type: string; durationMin: number; calories?: number; distanceMiles?: number; startedAt: string; externalId: string; activityType: string }> = [];

  for (const w of data.workouts ?? []) {
    const activityType = APPLE_HEALTH_ACTIVITY_MAP[w.type.toLowerCase()] ?? null;
    if (!activityType) continue;

    // Default to now when startedAt is absent; if present, validate range.
    const startedAt = w.startedAt ?? new Date().toISOString();
    const startedAtMs = new Date(startedAt).getTime();
    if (isNaN(startedAtMs) || startedAtMs > now || startedAtMs < now - maxLookbackMs) {
      req.log.warn({ playerId: player.id, startedAt }, "apple_health workout startedAt out of range — skipping");
      continue;
    }

    const externalId = `apple_workout_${w.type}_${startedAt.slice(0, 16).replace(/\D/g, "")}`;
    if (seenExternalIds.has(externalId)) {
      req.log.warn({ playerId: player.id, externalId }, "apple_health duplicate workout in payload — skipping");
      continue;
    }
    seenExternalIds.add(externalId);
    validWorkouts.push({ ...w, startedAt, externalId, activityType });
  }

  // ── Cross-request aggregate daily cap for workouts ───────────────────────────
  // Query how many workout minutes and sessions have already been accepted from
  // Apple Health for this player today. This enforces the daily cap across ALL
  // requests, not just per-payload, closing the repeated-request abuse where an
  // attacker sends many payloads with distinct synthetic startedAt minute slots
  // to keep minting new externalIds and earning unbounded XP.
  const todayStartUtc = new Date(today + "T00:00:00.000Z");
  const [dailyWorkoutTotals] = await db
    .select({
      totalMinutes: sql<number>`coalesce(sum(${fitnessActivitiesTable.value}), 0)::int`,
      totalCount:   sql<number>`count(*)::int`,
    })
    .from(fitnessActivitiesTable)
    .where(
      and(
        eq(fitnessActivitiesTable.playerId, player.id),
        gte(fitnessActivitiesTable.createdAt, todayStartUtc),
        like(fitnessActivitiesTable.externalId, "apple_workout_%"),
      ),
    );

  let remainingWorkoutMinutes = Math.max(
    0,
    DAILY_APPLE_WORKOUT_MINUTES_CAP - (dailyWorkoutTotals?.totalMinutes ?? 0),
  );
  let remainingWorkoutCount = Math.max(
    0,
    DAILY_APPLE_WORKOUT_COUNT_CAP - (dailyWorkoutTotals?.totalCount ?? 0),
  );

  // Further filter validWorkouts to respect the cross-request cap.
  // Workouts that would exceed the cap are silently dropped (same as the
  // per-payload duplicate logic above) — the attacker's excess data yields zero
  // progression instead of partial credit that compounds across requests.
  const cappedWorkouts: typeof validWorkouts = [];
  for (const w of validWorkouts) {
    if (remainingWorkoutCount <= 0 || remainingWorkoutMinutes <= 0) break;
    const acceptedMin = Math.min(w.durationMin, remainingWorkoutMinutes);
    cappedWorkouts.push({ ...w, durationMin: acceptedMin });
    remainingWorkoutMinutes -= acceptedMin;
    remainingWorkoutCount -= 1;
  }

  if (cappedWorkouts.length < validWorkouts.length) {
    req.log.warn(
      { playerId: player.id, submitted: validWorkouts.length, accepted: cappedWorkouts.length },
      "apple_health daily workout cap reached — some workouts dropped",
    );
  }

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

  // All Apple Health activities are logged as "unverified" because the server
  // has no Apple-issued proof, attestation, or signed payload for this data.
  // logFitnessActivity will persist the activity row (for health-insights) but
  // will NOT award competitive XP, advance streaks, increment totalWorkouts/
  // totalSteps, apply hatchling XP, check badges, update eggs, or award
  // artifacts. This isolates client-pushed health data from the competitive
  // progression systems entirely.
  const UNVERIFIED = "unverified" as const;

  // Steps
  if (data.steps && data.steps > 0) {
    const result = await logFitnessActivity({
      playerId: player.id,
      type: "steps",
      value: data.steps,
      externalId: `apple_steps_${today}`,
      note: `Apple Health: ${data.steps.toLocaleString()} steps on ${today}`,
      isPassiveSync: true,
      verificationLevel: UNVERIFIED,
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
      verificationLevel: UNVERIFIED,
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
      verificationLevel: UNVERIFIED,
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
      verificationLevel: UNVERIFIED,
    });
    if (result.isNew) { activitiesImported++; xpEarned += result.fitnessXpEarned; }
  }

  // Workouts — date-range checked, deduplicated, and cross-request daily cap applied
  for (const w of cappedWorkouts) {
    const result = await logFitnessActivity({
      playerId: player.id,
      type: w.activityType,
      value: w.durationMin,
      externalId: w.externalId,
      note: `Apple Health: ${w.type} (${w.durationMin} min)`,
      isPassiveSync: true,
      distanceMiles: w.distanceMiles ?? null,
      verificationLevel: UNVERIFIED,
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
