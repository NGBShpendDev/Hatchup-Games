// Bridge between in-app `notifications` rows and the web-push pipeline.
//
// Every notification type that lands in the inbox should also surface as a
// push (when the player has a subscription registered and hasn't opted out
// of that category). This module owns the type → push-category mapping so
// each call site doesn't have to remember it, and exposes a small helper
// that wraps `sendPushToPlayer` with the right category + tag.
//
// Per-category opt-outs are enforced inside `sendPushToPlayer` against the
// matching `players.notify*Push` column, so call sites only need to pass
// the notification row through.

import type { PushCategory } from "@workspace/db";
import { sendPushToPlayer } from "./pushNotifications.ts";

/**
 * Map every inbox `notifications.type` to the push category that gates its
 * delivery. Keep this in sync with `routes/notifications.ts` ALLOWED_TYPES
 * and the per-flow inserts in `services/*` / `routes/*`.
 */
export const NOTIFICATION_TYPE_TO_PUSH_CATEGORY: Record<string, PushCategory> = {
  // Invite-like (anything someone is pinging the player about)
  challenge_invite: "invites",
  club_invite: "invites",
  rematch_invite: "invites",
  club_mention: "social",
  comment_like: "social",
  post_reaction: "social",
  post_comment: "social",
  post_mention: "social",
  comment_mention: "social",
  new_follower: "social",
  artifact_unlock: "invites",
  artifact_share: "invites",
  generic: "invites",
  // Account / moderation pings reuse the invites opt-in so silencing
  // recap / completed pushes doesn't also silence safety notices.
  account_suspended: "invites",
  account_restored: "invites",
  account_verified: "invites",

  // Time-pressure: challenge windows closing
  challenge_ending: "endingSoon",

  // Completion / outcome pushes
  challenge_complete: "completed",
  tournament_advanced: "completed",
  tournament_eliminated: "completed",
  tournament_champion: "completed",

  // Weekly nutrition recap
  nutrition_recap: "nutritionRecap",
  nutrition_recap_preview: "nutritionRecap",
};

export interface NotificationLike {
  playerId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
}

/**
 * Fire a web push that mirrors the given inbox notification. Best-effort:
 * fan-out is fire-and-forget at the call site and `sendPushToPlayer`
 * already swallows transport errors. Returns `false` when the type has no
 * mapped push category (so the caller can decide to log).
 */
export async function pushForNotification(
  notification: NotificationLike,
  options: { tag?: string } = {},
): Promise<boolean> {
  const category = NOTIFICATION_TYPE_TO_PUSH_CATEGORY[notification.type];
  if (!category) return false;

  await sendPushToPlayer(notification.playerId, {
    title: notification.title,
    body: notification.body ?? "",
    link: notification.link ?? "/",
    category,
    tag: options.tag,
  });
  return true;
}
