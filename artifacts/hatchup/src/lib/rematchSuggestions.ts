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
}

export function rankHatchlingsForRematch<T extends HatchlingLikeForSort>(
  hatchlings: T[],
  battles: RematchBattleLike[],
): RankedHatchling<T>[] {
  const winsById = new Map<number, number>();
  const lossesById = new Map<number, number>();
  const drawsById = new Map<number, number>();
  const lastUsedById = new Map<number, number>();

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
  // decisive battles, i.e. wins + losses, against this rival). Ties broken by
  // recency of last use.
  let bestWinRateId: number | null = null;
  let bestWinRate = -1;
  let bestWinRateLastUsed = -Infinity;
  for (const h of hatchlings) {
    const wins = winsById.get(h.id) ?? 0;
    const losses = lossesById.get(h.id) ?? 0;
    const decisive = wins + losses;
    if (decisive < MIN_BATTLES_FOR_WIN_RATE) continue;
    const rate = wins / decisive;
    const lastUsed = lastUsedById.get(h.id) ?? 0;
    if (
      rate > bestWinRate ||
      (rate === bestWinRate && lastUsed > bestWinRateLastUsed)
    ) {
      bestWinRate = rate;
      bestWinRateId = h.id;
      bestWinRateLastUsed = lastUsed;
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
    };
  });

  ranked.sort((a, b) => {
    if (a.isBestWinRate !== b.isBestWinRate) return a.isBestWinRate ? -1 : 1;
    if (a.hasWinRate && b.hasWinRate && a.winRate !== b.winRate) {
      return (b.winRate ?? 0) - (a.winRate ?? 0);
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
