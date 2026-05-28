import { db } from "@workspace/db";
import { hatchlingsTable, playersTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";

export type ActiveHatchling = typeof hatchlingsTable.$inferSelect;

/**
 * Resolve the "partner" Hatchling a player's perks should flow to.
 *
 * Preference order, matching the nutrition buff resolver:
 *   1. `players.activeHatchlingId` (the explicitly chosen partner), if it
 *      still exists and is owned by the player.
 *   2. The most-recently-worked-out hatchling (NULLS LAST), tiebroken by
 *      most-recently-created.
 *
 * Returns `null` if the player owns no hatchlings.
 */
export async function resolveActivePartner(playerId: number): Promise<ActiveHatchling | null> {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
    columns: { activeHatchlingId: true },
  });

  if (player?.activeHatchlingId) {
    const chosen = await db.query.hatchlingsTable.findFirst({
      where: and(
        eq(hatchlingsTable.id, player.activeHatchlingId),
        eq(hatchlingsTable.playerId, playerId),
      ),
    });
    if (chosen) return chosen;
  }

  const fallback = await db.query.hatchlingsTable.findFirst({
    where: eq(hatchlingsTable.playerId, playerId),
    orderBy: [sql`${hatchlingsTable.lastWorkoutAt} DESC NULLS LAST`, desc(hatchlingsTable.createdAt)],
  });
  return fallback ?? null;
}
