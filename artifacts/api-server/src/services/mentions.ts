// Parse @username mentions out of free-form text and resolve them to player ids.
//
// Usernames are case-insensitive and may contain letters, numbers, and
// underscores. We deliberately keep the regex simple and forgiving so casual
// prose like "shout out to @Alex!" still works. The DB layer is the source of
// truth for which usernames actually exist — anything that doesn't match a
// real player is silently dropped.

import { db, playersTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";

const MENTION_RE = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{2,30})/g;

export function extractMentionHandles(text: string): string[] {
  if (!text) return [];
  const handles = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    handles.add(m[2].toLowerCase());
  }
  return [...handles];
}

export interface MentionedPlayer {
  id: number;
  username: string;
  displayName: string | null;
}

/**
 * Resolve @handles in `text` to existing players. Excludes the author and
 * dedupes by player id. Returns an empty array when no handles match.
 */
export async function resolveMentionedPlayers(
  text: string,
  excludePlayerId: number,
): Promise<MentionedPlayer[]> {
  const handles = extractMentionHandles(text);
  if (handles.length === 0) return [];

  const rows = await db
    .select({
      id: playersTable.id,
      username: playersTable.username,
      displayName: playersTable.displayName,
    })
    .from(playersTable)
    .where(inArray(sql`lower(${playersTable.username})`, handles));

  return rows.filter(r => r.id !== excludePlayerId);
}
