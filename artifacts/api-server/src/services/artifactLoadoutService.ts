/**
 * Artifact Loadout Service
 * Powers the pre-battle equip system and battle XP levelling.
 */

import { db } from "@workspace/db";
import {
  artifactsTable,
  playerArtifactsTable,
  artifactLoadoutsTable,
  artifactBattleXpTable,
  playersTable,
  fitnessBarsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Rarity power scores (used for matchmaking balancing) ──────────────────────
export const RARITY_POWER_SCORE: Record<string, number> = {
  Common:    5,
  Rare:      15,
  Epic:      30,
  Legendary: 50,
  Mythic:    80,
  Ancient:   120,
  Celestial: 200,
};

// ── Stat modifiers per rarity tier ───────────────────────────────────────────
// Major slot gets full values; minor slots get half.
export const RARITY_MODIFIERS: Record<string, { hp: number; speed: number; energy: number }> = {
  Common:    { hp: 5,   speed: 0,  energy: 0  },
  Rare:      { hp: 10,  speed: 1,  energy: 0  },
  Epic:      { hp: 20,  speed: 2,  energy: 5  },
  Legendary: { hp: 35,  speed: 4,  energy: 10 },
  Mythic:    { hp: 55,  speed: 7,  energy: 15 },
  Ancient:   { hp: 80,  speed: 10, energy: 20 },
  Celestial: { hp: 120, speed: 15, energy: 30 },
};

// ── Battle XP thresholds ──────────────────────────────────────────────────────
export const XP_THRESHOLDS = [0, 50, 150, 300]; // index = stage
const XP_PER_BATTLE = 10;
const XP_WIN_BONUS  = 10; // extra XP for the winner

export function computeEvolutionStage(xp: number): number {
  for (let s = XP_THRESHOLDS.length - 1; s >= 0; s--) {
    if (xp >= (XP_THRESHOLDS[s] ?? 0)) return s;
  }
  return 0;
}

export interface EquippedArtifactInfo {
  id: number;
  name: string;
  rarity: string;
  imageSlug: string;
  slot: "major" | "minor";
  isPowered: boolean;
  evolutionStage: number;
  battleXp: number;
}

export interface LoadoutModifiers {
  hpBonus: number;
  speedBonus: number;
  energyBonus: number;
  powerScore: number;
  equippedArtifacts: EquippedArtifactInfo[];
}

// ── Compute power score for a loadout ────────────────────────────────────────
export function computePowerScore(
  majorRarity: string | null,
  minor1Rarity: string | null,
  minor2Rarity: string | null,
): number {
  const maj   = RARITY_POWER_SCORE[majorRarity ?? ""] ?? 0;
  const min1  = RARITY_POWER_SCORE[minor1Rarity ?? ""] ?? 0;
  const min2  = RARITY_POWER_SCORE[minor2Rarity ?? ""] ?? 0;
  return maj + min1 * 0.5 + min2 * 0.5;
}

// ── Load active loadout + compute modifiers ───────────────────────────────────
export async function loadActiveLoadoutModifiers(
  playerId: number,
  hatchlingId: number,
): Promise<LoadoutModifiers> {
  const empty: LoadoutModifiers = { hpBonus: 0, speedBonus: 0, energyBonus: 0, powerScore: 0, equippedArtifacts: [] };

  const loadout = await db.query.artifactLoadoutsTable.findFirst({
    where: and(
      eq(artifactLoadoutsTable.playerId, playerId),
      eq(artifactLoadoutsTable.hatchlingId, hatchlingId),
      eq(artifactLoadoutsTable.buildName, "Active"),
    ),
  }).catch(() => null);

  if (!loadout) return empty;

  // Collect all artifact IDs in the loadout (filter nulls)
  const slotEntries: Array<{ artifactId: number; slot: "major" | "minor" }> = [
    ...(loadout.majorArtifactId   ? [{ artifactId: loadout.majorArtifactId,   slot: "major" as const }] : []),
    ...(loadout.minorArtifact1Id  ? [{ artifactId: loadout.minorArtifact1Id,  slot: "minor" as const }] : []),
    ...(loadout.minorArtifact2Id  ? [{ artifactId: loadout.minorArtifact2Id,  slot: "minor" as const }] : []),
  ];

  if (slotEntries.length === 0) return empty;

  const artifactIds = slotEntries.map(e => e.artifactId);

  // Load catalog data + ownership records
  const [artifacts, ownedRows] = await Promise.all([
    db.query.artifactsTable.findMany({ where: (t, { inArray: ia }) => ia(t.id, artifactIds) }),
    db.query.playerArtifactsTable.findMany({
      where: and(
        eq(playerArtifactsTable.playerId, playerId),
        inArray(playerArtifactsTable.artifactId, artifactIds),
      ),
    }),
  ]);

  const artifactMap = new Map(artifacts.map(a => [a.id, a]));
  const ownedMap    = new Map(ownedRows.map(o => [o.artifactId, o]));

  // Load battle XP rows for owned artifacts
  const ownedIds = ownedRows.map(o => o.id);
  type XpRow = { playerArtifactId: number; battleXp: number; evolutionStage: number };
  const xpRows: XpRow[] = ownedIds.length
    ? await db.query.artifactBattleXpTable.findMany({
        where: (t, { inArray: ia }) => ia(t.playerArtifactId, ownedIds),
      }).catch(() => [] as XpRow[])
    : [];
  const xpMap = new Map(xpRows.map(x => [x.playerArtifactId, x]));

  // Fetch player to check streak for fitness-powered check
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }).catch(() => null);

  let hpBonus = 0;
  let speedBonus = 0;
  let energyBonus = 0;
  const equippedArtifacts: EquippedArtifactInfo[] = [];

  for (const { artifactId, slot } of slotEntries) {
    const artifact = artifactMap.get(artifactId);
    const owned    = ownedMap.get(artifactId);
    if (!artifact || !owned) continue; // player doesn't actually own this artifact

    const mods = RARITY_MODIFIERS[artifact.rarity] ?? { hp: 0, speed: 0, energy: 0 };
    const factor = slot === "major" ? 1 : 0.5;

    hpBonus     += Math.round(mods.hp     * factor);
    speedBonus  += Math.round(mods.speed  * factor);
    energyBonus += Math.round(mods.energy * factor);

    // Fitness-powered: streak-gated artifacts need an active streak >= triggerValue
    const isPowered = !artifact.triggerKey?.startsWith("streak")
      || (player?.currentStreak ?? 0) >= (artifact.triggerValue ?? 0);

    const xpData = xpMap.get(owned.id);
    equippedArtifacts.push({
      id:             artifact.id,
      name:           artifact.name,
      rarity:         artifact.rarity,
      imageSlug:      artifact.imageSlug,
      slot,
      isPowered,
      evolutionStage: xpData?.evolutionStage ?? 0,
      battleXp:       xpData?.battleXp ?? 0,
    });
  }

  const powerScore = computePowerScore(
    artifacts.find(a => a.id === loadout.majorArtifactId)?.rarity ?? null,
    artifacts.find(a => a.id === loadout.minorArtifact1Id)?.rarity ?? null,
    artifacts.find(a => a.id === loadout.minorArtifact2Id)?.rarity ?? null,
  );

  return { hpBonus, speedBonus, energyBonus, powerScore, equippedArtifacts };
}

// ── Award battle XP to all artifacts in an active loadout ─────────────────────
export async function awardArtifactBattleXp(
  playerId: number,
  hatchlingId: number,
  playerWon: boolean,
): Promise<Array<{ artifactId: number; newStage: number; xpGained: number }>> {
  const loadout = await db.query.artifactLoadoutsTable.findFirst({
    where: and(
      eq(artifactLoadoutsTable.playerId, playerId),
      eq(artifactLoadoutsTable.hatchlingId, hatchlingId),
      eq(artifactLoadoutsTable.buildName, "Active"),
    ),
  }).catch(() => null);

  if (!loadout) return [];

  const xpGained = XP_PER_BATTLE + (playerWon ? XP_WIN_BONUS : 0);

  const artifactIds = [
    loadout.majorArtifactId,
    loadout.minorArtifact1Id,
    loadout.minorArtifact2Id,
  ].filter((id): id is number => id !== null && id !== undefined);

  if (artifactIds.length === 0) return [];

  const ownedRows = await db.query.playerArtifactsTable.findMany({
    where: and(
      eq(playerArtifactsTable.playerId, playerId),
      inArray(playerArtifactsTable.artifactId, artifactIds),
    ),
  }).catch(() => []);

  const results: Array<{ artifactId: number; newStage: number; xpGained: number }> = [];

  for (const owned of ownedRows) {
    try {
      // Upsert: find existing XP row or create one
      const existing = await db.query.artifactBattleXpTable.findFirst({
        where: eq(artifactBattleXpTable.playerArtifactId, owned.id),
      }).catch(() => null);

      const currentXp = existing?.battleXp ?? 0;
      const newXp = currentXp + xpGained;
      const newStage = computeEvolutionStage(newXp);

      if (existing) {
        await db.update(artifactBattleXpTable)
          .set({ battleXp: newXp, evolutionStage: newStage, updatedAt: new Date() })
          .where(eq(artifactBattleXpTable.id, existing.id));
      } else {
        await db.insert(artifactBattleXpTable)
          .values({ playerArtifactId: owned.id, battleXp: newXp, evolutionStage: newStage })
          .onConflictDoNothing();
      }

      results.push({ artifactId: owned.artifactId, newStage, xpGained });
    } catch (err) {
      logger.error({ err, ownedId: owned.id }, "Failed to award artifact battle XP");
    }
  }

  return results;
}
