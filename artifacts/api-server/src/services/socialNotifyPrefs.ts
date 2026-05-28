// Per-type, per-channel opt-outs for social notifications.
//
// Each social event type (reactions, replies, mentions, follows) has three
// independent delivery channels: in-app inbox, web push, email. Players can
// silence any combination — e.g. "only show comment likes in the inbox, not
// as a push" or "email me when someone comments".
//
// A legacy per-type master toggle (`notifySocial<Type>`) still acts as a
// nuclear off-switch — when false, every channel is suppressed regardless of
// the per-channel flags. This preserves any prior opt-outs from before the
// per-channel UI shipped.

import { db, playersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

export type SocialPrefBase = "Reactions" | "Replies" | "Mentions" | "Followers";

const TYPE_TO_BASE: Record<string, SocialPrefBase> = {
  post_reaction: "Reactions",
  comment_like: "Reactions",
  post_comment: "Replies",
  post_mention: "Mentions",
  comment_mention: "Mentions",
  club_mention: "Mentions",
  new_follower: "Followers",
};

export function socialPrefBaseForType(type: string): SocialPrefBase | null {
  return TYPE_TO_BASE[type] ?? null;
}

export type SocialPrefKey =
  | "notifySocialReactions"
  | "notifySocialReplies"
  | "notifySocialMentions"
  | "notifySocialFollowers";

export const SOCIAL_NOTIFY_PREF_KEYS = [
  "notifySocialReactions",
  "notifySocialReplies",
  "notifySocialMentions",
  "notifySocialFollowers",
] as const satisfies readonly SocialPrefKey[];

export interface SocialChannels {
  inbox: boolean;
  push: boolean;
  email: boolean;
}

const ALL_OFF: SocialChannels = { inbox: false, push: false, email: false };

/**
 * Resolve the (inbox, push, email) channel decision for a notification type.
 * Returns null for non-social / unknown types so the caller can treat them
 * as "no per-type gate applies".
 */
export async function socialChannelsForType(
  playerId: number,
  type: string,
): Promise<SocialChannels | null> {
  const base = TYPE_TO_BASE[type];
  if (!base) return null;
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
    columns: {
      notifySocialReactions: true,
      notifySocialReplies: true,
      notifySocialMentions: true,
      notifySocialFollowers: true,
      notifySocialReactionsInbox: true,
      notifySocialReactionsPush: true,
      notifySocialReactionsEmail: true,
      notifySocialRepliesInbox: true,
      notifySocialRepliesPush: true,
      notifySocialRepliesEmail: true,
      notifySocialMentionsInbox: true,
      notifySocialMentionsPush: true,
      notifySocialMentionsEmail: true,
      notifySocialFollowersInbox: true,
      notifySocialFollowersPush: true,
      notifySocialFollowersEmail: true,
    },
  });
  if (!player) return { inbox: true, push: true, email: false };

  const masterKey = `notifySocial${base}` as SocialPrefKey;
  if (player[masterKey] === false) return ALL_OFF;

  return {
    inbox: player[`notifySocial${base}Inbox` as const] !== false,
    push: player[`notifySocial${base}Push` as const] !== false,
    email: player[`notifySocial${base}Email` as const] === true,
  };
}

const PREF_COLUMNS = {
  id: true,
  notifySocialReactions: true,
  notifySocialReplies: true,
  notifySocialMentions: true,
  notifySocialFollowers: true,
  notifySocialReactionsInbox: true,
  notifySocialReactionsPush: true,
  notifySocialReactionsEmail: true,
  notifySocialRepliesInbox: true,
  notifySocialRepliesPush: true,
  notifySocialRepliesEmail: true,
  notifySocialMentionsInbox: true,
  notifySocialMentionsPush: true,
  notifySocialMentionsEmail: true,
  notifySocialFollowersInbox: true,
  notifySocialFollowersPush: true,
  notifySocialFollowersEmail: true,
} as const;

/**
 * Batch variant of `socialChannelsForType`. Fetches all recipients in a
 * single `inArray` query instead of one query per recipient ID.
 *
 * Returns a Map keyed by player ID. Recipients missing from the DB get the
 * default channels (inbox=true, push=true, email=false).
 * Returns an empty Map when `playerIds` is empty or the type is non-social.
 */
export async function socialChannelsForPlayers(
  playerIds: number[],
  type: string,
): Promise<Map<number, SocialChannels>> {
  const base = TYPE_TO_BASE[type];
  if (!base || playerIds.length === 0) return new Map();

  const rows = await db.query.playersTable.findMany({
    where: inArray(playersTable.id, playerIds),
    columns: PREF_COLUMNS,
  });

  const rowById = new Map(rows.map(r => [r.id, r]));
  const result = new Map<number, SocialChannels>();

  for (const id of playerIds) {
    const player = rowById.get(id);
    if (!player) {
      result.set(id, { inbox: true, push: true, email: false });
      continue;
    }
    const masterKey = `notifySocial${base}` as SocialPrefKey;
    if (player[masterKey] === false) {
      result.set(id, ALL_OFF);
      continue;
    }
    result.set(id, {
      inbox: player[`notifySocial${base}Inbox` as const] !== false,
      push: player[`notifySocial${base}Push` as const] !== false,
      email: player[`notifySocial${base}Email` as const] === true,
    });
  }

  return result;
}

/**
 * Back-compat shim: returns true when the inbox channel is enabled.
 * Most call sites now use `socialChannelsForType` directly so they can also
 * gate push and email; this remains for `notifications.ts POST` which only
 * inserts inbox rows.
 */
export async function isSocialNotificationAllowed(
  playerId: number,
  type: string,
): Promise<boolean> {
  const ch = await socialChannelsForType(playerId, type);
  if (!ch) return true;
  return ch.inbox;
}
