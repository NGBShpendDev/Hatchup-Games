import webpush from "web-push";
import { db } from "@workspace/db";
import {
  pushSubscriptionsTable,
  pushVapidKeysTable,
  playersTable,
  type PushCategory,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

let vapidPublicKey: string | null = null;
let vapidConfigured = false;
let vapidInitPromise: Promise<void> | null = null;

/**
 * Ensure VAPID keys are available — either from env vars or persisted in the
 * `push_vapid_keys` table. Generates and persists a key pair on first boot so
 * subscriptions survive server restarts without manual env setup.
 *
 * Idempotent and safe to call from many request paths concurrently.
 */
export function initPushNotifications(): Promise<void> {
  if (vapidInitPromise) return vapidInitPromise;
  vapidInitPromise = (async () => {
    try {
      let publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
      let privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
      let subject = process.env.VAPID_SUBJECT ?? "mailto:support@hatchup.app";

      if (!publicKey || !privateKey) {
        const existing = await db.query.pushVapidKeysTable.findFirst({
          where: eq(pushVapidKeysTable.id, 1),
        });
        if (existing) {
          publicKey = existing.publicKey;
          privateKey = existing.privateKey;
          subject = existing.subject;
        } else {
          const generated = webpush.generateVAPIDKeys();
          publicKey = generated.publicKey;
          privateKey = generated.privateKey;
          await db.insert(pushVapidKeysTable).values({
            id: 1,
            publicKey,
            privateKey,
            subject,
          }).onConflictDoNothing();
          logger.info("Generated new VAPID key pair for web push");
        }
      }

      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidPublicKey = publicKey;
      vapidConfigured = true;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Push notifications not initialized");
    }
  })();
  return vapidInitPromise;
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey;
}

export function isPushConfigured(): boolean {
  return vapidConfigured;
}

const CATEGORY_TO_PLAYER_FIELD: Record<PushCategory, keyof typeof playersTable.$inferSelect> = {
  invites: "notifyInvitesPush",
  endingSoon: "notifyEndingSoonPush",
  completed: "notifyCompletedPush",
};

export interface PushPayload {
  title: string;
  body: string;
  link?: string;
  category: PushCategory;
  tag?: string;
}

/**
 * Send a web push to a single player. Respects per-category opt-out preferences,
 * fans out to every registered subscription, and prunes dead/expired endpoints
 * automatically (HTTP 404/410 from the push service).
 */
export async function sendPushToPlayer(playerId: number, payload: PushPayload): Promise<void> {
  if (!vapidConfigured) {
    await initPushNotifications();
    if (!vapidConfigured) return;
  }

  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
  });
  if (!player) return;

  const prefField = CATEGORY_TO_PLAYER_FIELD[payload.category];
  if (player[prefField] === false) return;

  const subscriptions = await db.query.pushSubscriptionsTable.findMany({
    where: eq(pushSubscriptionsTable.playerId, playerId),
  });
  if (subscriptions.length === 0) return;

  const json = JSON.stringify({
    title: payload.title,
    body: payload.body,
    link: payload.link ?? "/",
    category: payload.category,
    tag: payload.tag,
  });

  const expiredIds: number[] = [];
  await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        json,
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        expiredIds.push(sub.id);
      } else {
        logger.warn({ err: (err as Error).message, playerId, endpoint: sub.endpoint }, "push_send_failed");
      }
    }
  }));

  if (expiredIds.length > 0) {
    await db.delete(pushSubscriptionsTable).where(inArray(pushSubscriptionsTable.id, expiredIds));
  }
}
