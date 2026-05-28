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

  res.json(snapshotPrefs(player, subs.length));
});

type PrefSnapshot = ReturnType<typeof snapshotPrefs>;

function gateByMaster(
  master: boolean,
  channels: { inbox: boolean; push: boolean; email: boolean },
): { inbox: boolean; push: boolean; email: boolean } {
  if (!master) return { inbox: false, push: false, email: false };
  return channels;
}

function snapshotPrefs(
  player: typeof playersTable.$inferSelect,
  subscriptionCount?: number,
) {
  const base = {
    invites: player.notifyInvitesPush,
    social: player.notifySocialPush,
    endingSoon: player.notifyEndingSoonPush,
    completed: player.notifyCompletedPush,
    // Legacy per-type masters (kept so old clients still work).
    socialReactions: player.notifySocialReactions,
    socialReplies: player.notifySocialReplies,
    socialMentions: player.notifySocialMentions,
    socialFollowers: player.notifySocialFollowers,
    // New per-channel toggles — { inbox, push, email } per type.
    // The legacy per-type master (notifySocial<Type>) hard-overrides every
    // channel to off in socialChannelsForType(). Mirror that here so the UI
    // shows the *effective* delivery state, not the stored bit. Otherwise a
    // user who opted out at the legacy master level would see channel toggles
    // as ON yet receive nothing.
    socialChannels: {
      reactions: gateByMaster(player.notifySocialReactions, {
        inbox: player.notifySocialReactionsInbox,
        push: player.notifySocialReactionsPush,
        email: player.notifySocialReactionsEmail,
      }),
      replies: gateByMaster(player.notifySocialReplies, {
        inbox: player.notifySocialRepliesInbox,
        push: player.notifySocialRepliesPush,
        email: player.notifySocialRepliesEmail,
      }),
      mentions: gateByMaster(player.notifySocialMentions, {
        inbox: player.notifySocialMentionsInbox,
        push: player.notifySocialMentionsPush,
        email: player.notifySocialMentionsEmail,
      }),
      followers: gateByMaster(player.notifySocialFollowers, {
        inbox: player.notifySocialFollowersInbox,
        push: player.notifySocialFollowersPush,
        email: player.notifySocialFollowersEmail,
      }),
    },
  };
  return subscriptionCount === undefined ? base : { ...base, subscriptionCount };
}

const CHANNEL_FIELD: Record<string, Record<string, keyof typeof playersTable.$inferSelect>> = {
  reactions: {
    inbox: "notifySocialReactionsInbox",
    push: "notifySocialReactionsPush",
    email: "notifySocialReactionsEmail",
  },
  replies: {
    inbox: "notifySocialRepliesInbox",
    push: "notifySocialRepliesPush",
    email: "notifySocialRepliesEmail",
  },
  mentions: {
    inbox: "notifySocialMentionsInbox",
    push: "notifySocialMentionsPush",
    email: "notifySocialMentionsEmail",
  },
  followers: {
    inbox: "notifySocialFollowersInbox",
    push: "notifySocialFollowersPush",
    email: "notifySocialFollowersEmail",
  },
};

// ── Update per-category push preferences ───────────────────────────────────
router.patch("/push/preferences", requireAuth, attachPlayer, async (req, res) => {
  const body = req.body as {
    invites?: boolean; social?: boolean; endingSoon?: boolean; completed?: boolean;
    socialReactions?: boolean; socialReplies?: boolean;
    socialMentions?: boolean; socialFollowers?: boolean;
    socialChannels?: Partial<Record<
      "reactions" | "replies" | "mentions" | "followers",
      Partial<{ inbox: boolean; push: boolean; email: boolean }>
    >>;
  };

  const patch: Record<string, boolean> = {};
  if (typeof body.invites === "boolean") patch.notifyInvitesPush = body.invites;
  if (typeof body.social === "boolean") patch.notifySocialPush = body.social;
  if (typeof body.endingSoon === "boolean") patch.notifyEndingSoonPush = body.endingSoon;
  if (typeof body.completed === "boolean") patch.notifyCompletedPush = body.completed;
  if (typeof body.socialReactions === "boolean") patch.notifySocialReactions = body.socialReactions;
  if (typeof body.socialReplies === "boolean") patch.notifySocialReplies = body.socialReplies;
  if (typeof body.socialMentions === "boolean") patch.notifySocialMentions = body.socialMentions;
  if (typeof body.socialFollowers === "boolean") patch.notifySocialFollowers = body.socialFollowers;

  if (body.socialChannels) {
    for (const [type, channels] of Object.entries(body.socialChannels)) {
      const fields = CHANNEL_FIELD[type];
      if (!fields || !channels) continue;
      let anyOn = false;
      for (const [channel, value] of Object.entries(channels)) {
        const field = fields[channel];
        if (field && typeof value === "boolean") {
          patch[field as string] = value;
          if (value) anyOn = true;
        }
      }
      // If the user turns any channel ON for this type, also clear the legacy
      // per-type master so prior end-to-end opt-outs don't keep suppressing
      // their newly-enabled channel.
      if (anyOn) {
        const masterField = `notifySocial${type.charAt(0).toUpperCase()}${type.slice(1)}`;
        patch[masterField] = true;
      }
    }
  }

  if (Object.keys(patch).length > 0) {
    await db.update(playersTable).set(patch).where(eq(playersTable.id, req.playerId!));
  }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, req.playerId!) });
  res.json(snapshotPrefs(player!) satisfies PrefSnapshot);
});

export default router;
