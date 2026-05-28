export interface RematchBattleLike {
  myHatchlingId: number | null;
  outcome: "win" | "loss" | "draw" | string;
  createdAt: string;
}

export interface HatchlingLikeForSort {
  id: number;
  name: string;
  level: number;
}

export const MIN_BATTLES_FOR_WIN_RATE = 3;

export interface RankedHatchling<T extends HatchlingLikeForSort> {
  hatchling: T;
  wins: number;
  losses: number;
  draws: number;
  battles: number;
  winRate: number | null;
  hasWinRate: boolean;
  lastUsedAt: number | null;
  isLastUsed: boolean;
  isMostWins: boolean;
  isBestWinRate: boolean;
  isRecommended: boolean;
  reason: "last-used" | "most-wins" | "best-win-rate" | null;
  currentStreak: { count: number; type: "win" | "loss" | "draw" } | null;
}

export function rankHatchlingsForRematch<T extends HatchlingLikeForSort>(
  hatchlings: T[],
  battles: RematchBattleLike[],
): RankedHatchling<T>[] {
  const winsById = new Map<number, number>();
  const lossesById = new Map<number, number>();
  const drawsById = new Map<number, number>();
  const lastUsedById = new Map<number, number>();
  const battlesByHatchlingId = new Map<number, RematchBattleLike[]>();

  for (const b of battles) {
    if (!b.myHatchlingId) continue;
    const ts = new Date(b.createdAt).getTime();
    if (Number.isFinite(ts)) {
      const prev = lastUsedById.get(b.myHatchlingId) ?? 0;
      if (ts > prev) lastUsedById.set(b.myHatchlingId, ts);
    }
    if (b.outcome === "win") {
      winsById.set(b.myHatchlingId, (winsById.get(b.myHatchlingId) ?? 0) + 1);
    } else if (b.outcome === "loss") {
      lossesById.set(b.myHatchlingId, (lossesById.get(b.myHatchlingId) ?? 0) + 1);
    } else if (b.outcome === "draw") {
      drawsById.set(b.myHatchlingId, (drawsById.get(b.myHatchlingId) ?? 0) + 1);
    }
    const arr = battlesByHatchlingId.get(b.myHatchlingId) ?? [];
    arr.push(b);
    battlesByHatchlingId.set(b.myHatchlingId, arr);
  }

  // Compute current win/loss/draw streak per hatchling (chronological order).
  const streakById = new Map<number, { count: number; type: "win" | "loss" | "draw" }>();
  for (const [id, hBattles] of battlesByHatchlingId) {
    const chrono = [...hBattles].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    if (chrono.length === 0) continue;
    const latestOutcome = chrono[chrono.length - 1].outcome;
    if (latestOutcome !== "win" && latestOutcome !== "loss" && latestOutcome !== "draw") continue;
    let count = 0;
    for (let i = chrono.length - 1; i >= 0; i--) {
      if (chrono[i].outcome === latestOutcome) count++;
      else break;
    }
    streakById.set(id, { count, type: latestOutcome });
  }

  let lastUsedId: number | null = null;
  let lastUsedTs = -Infinity;
  for (const [id, ts] of lastUsedById) {
    if (ts > lastUsedTs) {
      lastUsedTs = ts;
      lastUsedId = id;
    }
  }

  let mostWinsId: number | null = null;
  let mostWins = 0;
  for (const [id, w] of winsById) {
    if (w > mostWins) {
      mostWins = w;
      mostWinsId = id;
    }
  }

  // Best win-rate among hatchlings with enough history (≥ MIN_BATTLES_FOR_WIN_RATE
  // decisive battles, i.e. wins + losses, against this rival). When rates are
  // within 5 whole percentage points, an active win streak (≥ 2) tips the
  // balance; otherwise ties are broken by recency of last use.
  // Comparisons use integer percentage points to avoid floating-point drift.
  let bestWinRateId: number | null = null;
  let bestWinRate = -1;
  let bestWinRatePct = -1;
  let bestWinRateLastUsed = -Infinity;
  let bestWinRateIsStreaking = false;
  for (const h of hatchlings) {
    const wins = winsById.get(h.id) ?? 0;
    const losses = lossesById.get(h.id) ?? 0;
    const decisive = wins + losses;
    if (decisive < MIN_BATTLES_FOR_WIN_RATE) continue;
    const rate = wins / decisive;
    const ratePct = Math.round(rate * 100);
    const lastUsed = lastUsedById.get(h.id) ?? 0;
    const streak = streakById.get(h.id);
    const isStreaking = streak?.type === "win" && streak.count >= 2;

    if (bestWinRateId === null) {
      bestWinRate = rate;
      bestWinRatePct = ratePct;
      bestWinRateId = h.id;
      bestWinRateLastUsed = lastUsed;
      bestWinRateIsStreaking = isStreaking;
      continue;
    }

    const rateDiffPct = ratePct - bestWinRatePct;
    let update = false;

    if (rateDiffPct > 5) {
      // Clearly better rate — wins outright.
      update = true;
    } else if (rateDiffPct >= -5) {
      // Within 5 pp — streak tiebreak, then rate, then recency.
      if (isStreaking && !bestWinRateIsStreaking) {
        update = true;
      } else if (!isStreaking && bestWinRateIsStreaking) {
        update = false;
      } else if (rateDiffPct > 0) {
        update = true;
      } else if (rateDiffPct === 0) {
        update = lastUsed > bestWinRateLastUsed;
      }
    }
    // rateDiffPct < -5: clearly worse rate — skip.

    if (update) {
      bestWinRate = rate;
      bestWinRatePct = ratePct;
      bestWinRateId = h.id;
      bestWinRateLastUsed = lastUsed;
      bestWinRateIsStreaking = isStreaking;
    }
  }

  const ranked: RankedHatchling<T>[] = hatchlings.map(h => {
    const wins = winsById.get(h.id) ?? 0;
    const losses = lossesById.get(h.id) ?? 0;
    const draws = drawsById.get(h.id) ?? 0;
    const decisive = wins + losses;
    const hasWinRate = decisive >= MIN_BATTLES_FOR_WIN_RATE;
    const winRate = hasWinRate ? wins / decisive : null;
    const lastUsedAt = lastUsedById.get(h.id) ?? null;
    const isLastUsed = lastUsedId === h.id;
    const isBestWinRate = bestWinRateId === h.id && hasWinRate;
    const isMostWins = mostWinsId === h.id && mostWins > 0;
    const currentStreak = streakById.get(h.id) ?? null;
    const reason: RankedHatchling<T>["reason"] = isBestWinRate
      ? "best-win-rate"
      : isLastUsed
        ? "last-used"
        : isMostWins
          ? "most-wins"
          : null;
    return {
      hatchling: h,
      wins,
      losses,
      draws,
      battles: wins + losses + draws,
      winRate,
      hasWinRate,
      lastUsedAt,
      isLastUsed,
      isMostWins,
      isBestWinRate,
      isRecommended: false,
      reason,
      currentStreak,
    };
  });

  ranked.sort((a, b) => {
    if (a.isBestWinRate !== b.isBestWinRate) return a.isBestWinRate ? -1 : 1;
    if (a.hasWinRate && b.hasWinRate) {
      const aRatePct = Math.round((a.winRate ?? 0) * 100);
      const bRatePct = Math.round((b.winRate ?? 0) * 100);
      if (aRatePct !== bRatePct) {
        // Streak boost: when rates are within 5 whole pp, prefer active win streak ≥ 2.
        const rateDiffPct = Math.abs(aRatePct - bRatePct);
        if (rateDiffPct <= 5) {
          const aStreaking = a.currentStreak?.type === "win" && (a.currentStreak.count ?? 0) >= 2;
          const bStreaking = b.currentStreak?.type === "win" && (b.currentStreak.count ?? 0) >= 2;
          if (aStreaking !== bStreaking) return aStreaking ? -1 : 1;
        }
        return bRatePct - aRatePct;
      }
    }
    if (a.isLastUsed !== b.isLastUsed) return a.isLastUsed ? -1 : 1;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aTs = a.lastUsedAt ?? 0;
    const bTs = b.lastUsedAt ?? 0;
    if (bTs !== aTs) return bTs - aTs;
    return a.hatchling.name.localeCompare(b.hatchling.name);
  });

  if (ranked.length > 0) {
    const top = ranked[0];
    if (top.isBestWinRate || top.isLastUsed || top.wins > 0) {
      top.isRecommended = true;
    }
  }

  return ranked;
}

export function formatRecord(r: {
  wins: number;
  losses: number;
  winRate: number | null;
  hasWinRate: boolean;
}): string {
  if (r.hasWinRate && r.winRate !== null) {
    const pct = Math.round(r.winRate * 100);
    return `${r.wins}W–${r.losses}L · ${pct}%`;
  }
  if (r.wins > 0 && r.losses > 0) return `${r.wins}W–${r.losses}L`;
  if (r.wins > 0) return `${r.wins}W`;
  if (r.losses > 0) return `${r.losses}L`;
  return "";
}

/**
 * Returns a short streak label for streaks of ≥ 2, e.g. "🔥 W3" or "L2".
 * Returns "" when there is no streak or the streak is only 1 (trivial).
 */
export function formatStreak(
  streak: { count: number; type: "win" | "loss" | "draw" } | null,
): string {
  if (!streak || streak.count < 2) return "";
  if (streak.type === "win") return `🔥 W${streak.count}`;
  if (streak.type === "loss") return `L${streak.count}`;
  return `D${streak.count}`;
}
