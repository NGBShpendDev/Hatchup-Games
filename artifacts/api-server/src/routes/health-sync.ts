import { Router } from "express";
import { db } from "@workspace/db";
import { healthConnectionsTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  encryptToken,
  syncGoogleFit,
  createOAuthState,
  verifyOAuthState,
} from "../services/googleFitSync";
import { logger } from "../lib/logger";

const router = Router();

function getRedirectUri(req: any): string {
  const host = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : `${req.protocol}://${req.get("host")}`;
  return `${host}/api/health/google/callback`;
}

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

router.post("/health/sync", requireAuth, async (req, res) => {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const connection = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.playerId, player.id),
      eq(healthConnectionsTable.platform, "google_fit"),
    ),
  });

  if (!connection || !connection.accessToken) {
    res.status(400).json({ error: "No Google Fit connection found. Connect Google Fit first." });
    return;
  }

  try {
    const result = await syncGoogleFit(player.id, connection);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
});

router.get("/health/google/connect", requireAuth, async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({ error: "Google Fit integration not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your environment secrets." });
    return;
  }

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.clerkId, req.clerkUserId!),
  });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const redirectUri = getRedirectUri(req);
  const state = createOAuthState(player.id);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
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
  const frontendBase = process.env.NODE_ENV === "production"
    ? `https://${(process.env.REPLIT_DOMAINS ?? "").split(",")[0]}`
    : "";

  if (error || !code || !state) {
    res.redirect(`${frontendBase}/health-settings?error=oauth_denied`);
    return;
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    res.redirect(`${frontendBase}/health-settings?error=invalid_state`);
    return;
  }
  const playerId = verified.playerId;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect(`${frontendBase}/health-settings?error=not_configured`);
    return;
  }

  const redirectUri = getRedirectUri(req);

  let tokens: { access_token: string; refresh_token?: string; expires_in: number };
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      res.redirect(`${frontendBase}/health-settings?error=token_exchange_failed`);
      return;
    }
    tokens = await tokenRes.json() as { access_token: string; refresh_token?: string; expires_in: number };
  } catch {
    res.redirect(`${frontendBase}/health-settings?error=network_error`);
    return;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const existingConn = await db.query.healthConnectionsTable.findFirst({
    where: and(
      eq(healthConnectionsTable.playerId, playerId),
      eq(healthConnectionsTable.platform, "google_fit"),
    ),
  });

  let connectionId: number;
  if (existingConn) {
    await db.update(healthConnectionsTable)
      .set({
        accessToken: encryptToken(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
        tokenExpiresAt: expiresAt,
      })
      .where(eq(healthConnectionsTable.id, existingConn.id));
    connectionId = existingConn.id;
  } else {
    const [inserted] = await db.insert(healthConnectionsTable).values({
      playerId,
      platform: "google_fit",
      accessToken: encryptToken(tokens.access_token),
      refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      tokenExpiresAt: expiresAt,
      consentGivenAt: new Date(),
    }).returning({ id: healthConnectionsTable.id });
    connectionId = inserted.id;
  }

  res.redirect(`${frontendBase}/health-settings?connected=google_fit`);

  setImmediate(async () => {
    try {
      const conn = await db.query.healthConnectionsTable.findFirst({
        where: eq(healthConnectionsTable.id, connectionId),
      });
      if (conn) {
        const result = await syncGoogleFit(playerId, conn);
        logger.info({ playerId, ...result }, "Initial Google Fit backfill completed after OAuth connect");
      }
    } catch (err) {
      logger.error({ err, playerId }, "Initial Google Fit backfill failed after OAuth connect");
    }
  });
});

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

export default router;
