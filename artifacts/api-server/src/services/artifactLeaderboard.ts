// Pure helpers for the artifact collectors leaderboard.
// Extracted so we can lock the weighting/sort contract with unit tests.

export const RARITY_WEIGHTS: Record<string, number> = {
  Common: 1, Rare: 2, Epic: 3, Legendary: 4, Mythic: 5, Ancient: 6, Celestial: 7,
};

export type OwnedArtifact = { playerId: number; artifactId: number };
export type ArtifactMeta  = { id: number; rarity: string; name: string };

export type CollectorAgg = {
  playerId:     number;
  count:        number;
  score:        number;
  rarestWeight: number;
  rarestRarity: string | null;
  rarestName:   string | null;
};

export function rarityWeight(rarity: string): number {
  return RARITY_WEIGHTS[rarity] ?? 0;
}

/**
 * Aggregate owned-artifact rows into per-player collector stats and sort them
 * by rarity score desc, then count desc, then playerId asc (stable tie-break).
 *
 * - `hiddenPlayerIds` are excluded from the result.
 * - Unknown artifact ids (missing from `catalog`) are ignored.
 * - Unknown rarities contribute 0 to score (rarityWeight fallback).
 */
export function rankArtifactCollectors(
  owned:           readonly OwnedArtifact[],
  catalog:         readonly ArtifactMeta[],
  hiddenPlayerIds: readonly number[] = [],
): CollectorAgg[] {
  const hiddenSet  = new Set(hiddenPlayerIds);
  const catalogMap = new Map<number, ArtifactMeta>();
  for (const a of catalog) catalogMap.set(a.id, a);

  const aggMap = new Map<number, CollectorAgg>();
  for (const pa of owned) {
    if (hiddenSet.has(pa.playerId)) continue;
    const art = catalogMap.get(pa.artifactId);
    if (!art) continue;
    const w = rarityWeight(art.rarity);
    let agg = aggMap.get(pa.playerId);
    if (!agg) {
      agg = { playerId: pa.playerId, count: 0, score: 0, rarestWeight: 0, rarestRarity: null, rarestName: null };
      aggMap.set(pa.playerId, agg);
    }
    agg.count += 1;
    agg.score += w;
    if (w > agg.rarestWeight) {
      agg.rarestWeight = w;
      agg.rarestRarity = art.rarity;
      agg.rarestName   = art.name;
    }
  }

  return [...aggMap.values()].sort(
    (a, b) => b.score - a.score || b.count - a.count || a.playerId - b.playerId,
  );
}
