import { Router } from "express";
import { db, pushSubscriptionsTable, playersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import {
  getVapidPublicKey,
  initPushNotifications,
  isPushConfigured,
} from "../services/pushNotifications.ts";

const router = Router();

// ── Public VAPID key for browser subscription ──────────────────────────────
router.get("/push/public-key", async (_req, res) => {
  await initPushNotifications();
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: key, configured: isPushConfigured() });
});

// ── Register a browser push subscription ───────────────────────────────────
router.post("/push/subscribe", requireAuth, attachPlayer, async (req, res) => {
  const { endpoint, keys, userAgent } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys.p256dh/auth required" });
    return;
  }

  // Upsert by endpoint — re-bind to the current player if it migrates devices.
  const existing = await db.query.pushSubscriptionsTable.findFirst({
    where: eq(pushSubscriptionsTable.endpoint, endpoint),
  });
  if (existing) {
    await db.update(pushSubscriptionsTable)
      .set({ playerId: req.playerId!, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent ?? existing.userAgent })
      .where(eq(pushSubscriptionsTable.id, existing.id));
    res.json({ success: true, id: existing.id });
    return;
  }

  const [row] = await db.insert(pushSubscriptionsTable).values({
    playerId: req.playerId!,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    userAgent: userAgent ?? null,
  }).returning();

  res.status(201).json({ success: true, id: row.id });
});

// ── Remove a push subscription ─────────────────────────────────────────────
router.post("/push/unsubscribe", requireAuth, attachPlayer, async (req, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }

  await db.delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.endpoint, endpoint), eq(pushSubscriptionsTable.playerId, req.playerId!)));

  res.json({ success: true });
});

// ── Get per-category push preferences ──────────────────────────────────────
router.get("/push/preferences", requireAuth, attachPlayer, async (req, res) => {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const subs = await db.query.pushSubscriptionsTable.findMany({
    where: eq(pushSubscriptionsTable.playerId, req.playerId!),
    columns: { id: true },
  });

  res.json({
    invites: player.notifyInvitesPush,
    endingSoon: player.notifyEndingSoonPush,
    completed: player.notifyCompletedPush,
    subscriptionCount: subs.length,
  });
});

// ── Update per-category push preferences ───────────────────────────────────
router.patch("/push/preferences", requireAuth, attachPlayer, async (req, res) => {
  const { invites, endingSoon, completed } = req.body as {
    invites?: boolean; endingSoon?: boolean; completed?: boolean;
  };

  const patch: Record<string, boolean> = {};
  if (typeof invites === "boolean") patch.notifyInvitesPush = invites;
  if (typeof endingSoon === "boolean") patch.notifyEndingSoonPush = endingSoon;
  if (typeof completed === "boolean") patch.notifyCompletedPush = completed;

  if (Object.keys(patch).length > 0) {
    await db.update(playersTable).set(patch).where(eq(playersTable.id, req.playerId!));
  }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  res.json({
    invites: player!.notifyInvitesPush,
    endingSoon: player!.notifyEndingSoonPush,
    completed: player!.notifyCompletedPush,
  });
});

export default router;
