import { db } from "@workspace/db";
import { hatchlingsTable, playersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * 100 XP per level matches the EVENT_JOIN_XP constant in events.ts and keeps
 * the evolution math obvious: level 5 requires 400 XP from baseline, level 15
 * requires 1 400 XP — both reachable through normal gameplay within a session.
 */
export const XP_PER_LEVEL = 100;

export interface HatchlingXpResult {
  hatchlingId: number;
  prevLevel: number;
  newLevel: number;
  newXp: number;
  xpDelta: number;
}

/**
 * Evolution thresholds: crossing level 5 or 15 triggers a share prompt so
 * players can celebrate their Pal's milestone with friends.
 */
export const EVOLUTION_LEVELS = [5, 15] as const;

/**
 * Returns true when the XP result crosses one of the evolution level
 * thresholds (5 or 15), meaning the caller should surface a share prompt.
 */
export function shouldTriggerSharePrompt(result: HatchlingXpResult): boolean {
  return EVOLUTION_LEVELS.some(
    (threshold) => result.prevLevel < threshold && result.newLevel >= threshold,
  );
}

/**
 * Award XP to a hatchling and monotonically bump its level when the threshold
 * is crossed. Returns a result object so callers can detect evolution triggers,
 * or null when the hatchling row is not found.
 */
export async function applyHatchlingXp(
  hatchlingId: number,
  xpDelta: number,
): Promise<HatchlingXpResult | null> {
  if (xpDelta <= 0) return null;

  const hatchling = await db.query.hatchlingsTable.findFirst({
    where: eq(hatchlingsTable.id, hatchlingId),
  });
  if (!hatchling) return null;

  const newXp = hatchling.xp + xpDelta;
  const newLevel = Math.max(hatchling.level, 1 + Math.floor(newXp / XP_PER_LEVEL));

  await db
    .update(hatchlingsTable)
    .set({ xp: newXp, level: newLevel })
    .where(eq(hatchlingsTable.id, hatchlingId));

  return { hatchlingId, prevLevel: hatchling.level, newLevel, newXp, xpDelta };
}

/**
 * Resolve the active Pal ID for a player: prefer `players.activeHatchlingId`
 * when it points to an existing hatchling owned by the player, otherwise fall
 * back to the player's first owned hatchling. Returns null if none found.
 *
 * The ownership + existence check prevents stale activeHatchlingId values
 * (deleted or reassigned Pals) from silently suppressing the XP grant that
 * should go to the player's real active Pal.
 */
export async function getActivePalId(playerId: number): Promise<number | null> {
  const player = await db.query.playersTable.findFirst({
    where: eq(playersTable.id, playerId),
    columns: { activeHatchlingId: true },
  });

  if (player?.activeHatchlingId) {
    const active = await db.query.hatchlingsTable.findFirst({
      where: and(
        eq(hatchlingsTable.id, player.activeHatchlingId),
        eq(hatchlingsTable.playerId, playerId),
      ),
      columns: { id: true },
    });
    if (active) return active.id;
  }

  const first = await db.query.hatchlingsTable.findFirst({
    where: eq(hatchlingsTable.playerId, playerId),
    columns: { id: true },
  });
  return first?.id ?? null;
}
