import { db } from "@workspace/db";
import { playersTable, playerLocationTable, playerArtifactsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { isLocationEstablished } from "../routes/locations.ts";

type MetricKey = "xp" | "steps" | "workouts" | "battle_wins" | "streaks" | "artifacts";
const METRICS: MetricKey[] = ["xp", "steps", "workouts", "battle_wins", "streaks", "artifacts"];

function metricValue(p: typeof playersTable.$inferSelect, m: MetricKey, artifactsByPlayer: Map<number, number>): number {
  switch (m) {
    case "steps":       return p.totalSteps;
    case "workouts":    return p.totalWorkouts;
    case "battle_wins": return p.totalBattleWins;
    case "streaks":     return p.currentStreak;
    case "artifacts":   return artifactsByPlayer.get(p.id) ?? 0;
    default:            return p.xp;
  }
}

function metricLabel(m: MetricKey): string {
  switch (m) {
    case "steps":       return "Steps";
    case "workouts":    return "Workouts";
    case "battle_wins": return "Battle Wins";
    case "streaks":     return "Streak";
    case "artifacts":   return "Artifacts";
    default:            return "XP";
  }
}

/**
 * Minimum age (ms) a location record must have before it can be used for a
 * Top-10 city exemption check. Prevents instant "spoof a small city → refresh
 * Top-10 → get Premium" attacks: an attacker must hold coordinates in the
 * target city for at least this long before the exemption can be granted.
 */
const TOP10_LOCATION_MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check whether `playerId` is in the Top 10 of their city for ANY tracked metric.
 * Returns a small object: { exempt, rank, metric, city, label } when exempt; null otherwise.
 *
 * "City" is derived from playerLocationTable. Players without a location cannot earn
 * the city exemption. The location record must also be at least 24 hours old — this
 * prevents location-spoofing attacks where an attacker sets fresh coordinates for a
 * small city and immediately refreshes their Top-10 status to unlock Premium.
 */
export async function checkTop10CityExemption(playerId: number): Promise<{
  exempt: boolean;
  rank?: number;
  metric?: MetricKey;
  city?: string;
  state?: string;
  label?: string;
}> {
  const myLoc = await db.query.playerLocationTable.findFirst({
    where: eq(playerLocationTable.playerId, playerId),
  });
  if (!myLoc?.city) return { exempt: false };

  // Defense-in-depth: require the location record to be at least 24 hours old
  // before including it in Top-10 computations. Even though the Top-10 status
  // no longer grants Premium (see entitlement.ts), freshly-spoofed coordinates
  // should not affect displayed rankings or context labels either.
  if (!isLocationEstablished(myLoc, TOP10_LOCATION_MIN_AGE_MS)) return { exempt: false };

  // Pull all locations sharing the same city+state
  const cityLocs = await db.query.playerLocationTable.findMany({
    where: and(
      eq(playerLocationTable.city, myLoc.city),
      eq(playerLocationTable.state, myLoc.state ?? ""),
    ),
  });
  const cityPlayerIds = cityLocs.map(l => l.playerId);
  if (cityPlayerIds.length < 2) return { exempt: false };

  const cityPlayers = await db.query.playersTable.findMany();
  const cityPlayerSet = new Set(cityPlayerIds);
  const cohort = cityPlayers.filter(p => cityPlayerSet.has(p.id));
  if (cohort.length === 0) return { exempt: false };

  // Artifact counts (only needed for the "artifacts" metric, but cheap to pre-compute)
  const allArtifacts = await db.query.playerArtifactsTable.findMany();
  const artifactsByPlayer = new Map<number, number>();
  for (const a of allArtifacts) {
    artifactsByPlayer.set(a.playerId, (artifactsByPlayer.get(a.playerId) ?? 0) + 1);
  }

  let bestRank = Infinity;
  let bestMetric: MetricKey | undefined;

  for (const m of METRICS) {
    const sorted = [...cohort].sort((a, b) => metricValue(b, m, artifactsByPlayer) - metricValue(a, m, artifactsByPlayer));
    const idx = sorted.findIndex(p => p.id === playerId);
    if (idx === -1) continue;
    const rank = idx + 1;
    if (rank <= 10 && rank < bestRank) {
      bestRank = rank;
      bestMetric = m;
    }
  }

  if (bestMetric === undefined) return { exempt: false };

  return {
    exempt: true,
    rank: bestRank,
    metric: bestMetric,
    city: myLoc.city,
    state: myLoc.state ?? undefined,
    label: `#${bestRank} in ${myLoc.city} · ${metricLabel(bestMetric)}`,
  };
}

/**
 * Persist the current Top-10 status onto the player row, so that getEntitlement
 * can read it cheaply on every request. Idempotent.
 */
export async function refreshTop10Status(playerId: number): Promise<void> {
  const result = await checkTop10CityExemption(playerId);
  await db
    .update(playersTable)
    .set({
      top10LastCheckedAt: new Date(),
      top10ContextLabel: result.exempt && result.label ? result.label : null,
    })
    .where(eq(playersTable.id, playerId));
}
