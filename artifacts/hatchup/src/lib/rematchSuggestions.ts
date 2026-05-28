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

export interface RankedHatchling<T extends HatchlingLikeForSort> {
  hatchling: T;
  wins: number;
  lastUsedAt: number | null;
  isLastUsed: boolean;
  isMostWins: boolean;
  isRecommended: boolean;
  reason: "last-used" | "most-wins" | null;
}

export function rankHatchlingsForRematch<T extends HatchlingLikeForSort>(
  hatchlings: T[],
  battles: RematchBattleLike[],
): RankedHatchling<T>[] {
  const winsById = new Map<number, number>();
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

  const ranked: RankedHatchling<T>[] = hatchlings.map(h => {
    const wins = winsById.get(h.id) ?? 0;
    const lastUsedAt = lastUsedById.get(h.id) ?? null;
    const isLastUsed = lastUsedId === h.id;
    const isMostWins = mostWinsId === h.id && mostWins > 0;
    const reason: RankedHatchling<T>["reason"] = isLastUsed
      ? "last-used"
      : isMostWins
        ? "most-wins"
        : null;
    return {
      hatchling: h,
      wins,
      lastUsedAt,
      isLastUsed,
      isMostWins,
      isRecommended: false,
      reason,
    };
  });

  ranked.sort((a, b) => {
    if (a.isLastUsed !== b.isLastUsed) return a.isLastUsed ? -1 : 1;
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aTs = a.lastUsedAt ?? 0;
    const bTs = b.lastUsedAt ?? 0;
    if (bTs !== aTs) return bTs - aTs;
    return a.hatchling.name.localeCompare(b.hatchling.name);
  });

  if (ranked.length > 0 && (ranked[0].isLastUsed || ranked[0].wins > 0)) {
    ranked[0].isRecommended = true;
  }

  return ranked;
}
