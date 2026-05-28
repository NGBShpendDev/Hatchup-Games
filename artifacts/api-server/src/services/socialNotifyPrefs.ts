// Per-type opt-outs for social notifications.
//
// Splits the catch-all "social" push category into finer-grained toggles so
// players can silence, say, reactions without losing replies. Used to gate
// BOTH the in-app inbox row insert AND the matching web push so the toggle
// suppresses the notification end-to-end.

import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type SocialNotifyPrefKey =
  | "notifySocialReactions"
  | "notifySocialReplies"
  | "notifySocialMentions"
  | "notifySocialFollowers";

const TYPE_TO_PREF: Record<string, SocialNotifyPrefKey> = {
  post_reaction: "notifySocialReactions",
  comment_like: "notifySocialReactions",
  post_comment: "notifySocialReplies",
  post_mention: "notifySocialMentions",
  comment_mention: "notifySocialMentions",
  club_mention: "notifySocialMentions",
  new_follower: "notifySocialFollowers",
};

export function socialPrefKeyForType(type: string): SocialNotifyPrefKey | null {
  return TYPE_TO_PREF[type] ?? null;
}

export const SOCIAL_NOTIFY_PREF_KEYS = [
  "notifySocialReactions",
  "notifySocialReplies",
  "notifySocialMentions",
  "notifySocialFollowers",
] as const satisfies readonly SocialNotifyPrefKey[];

/**
 * Returns true if the recipient hasn't opted out of this social notification
 * type. Non-social types (or unknown ones) always pass through — they have no
 * per-type toggle and are gated only by the broader push category.
 */
export async function isSocialNotificationAllowed(
  playerId: number,
  type: string,
): Promise<boolean> {
  const key = socialPrefKeyForType(type);
  if (!key) return true;
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
    columns: {
      notifySocialReactions: true,
      notifySocialReplies: true,
      notifySocialMentions: true,
      notifySocialFollowers: true,
    },
  });
  if (!player) return true;
  return player[key] !== false;
}
