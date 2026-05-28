import type { RewardEntry } from "@/components/reward-summary-modal";

export interface TournamentLeaderboardEntry {
  playerId: number;
  currentValue?: number;
  eliminated: boolean;
  eliminatedRound?: number | null;
  player?: { username?: string; displayName?: string | null } | null;
}

export interface TournamentChallengeSnapshot {
  isElimination?: boolean;
  currentRound?: number;
  rewardXp?: number;
  rewardCoins?: number;
  leaderboard?: TournamentLeaderboardEntry[];
}

export interface TournamentRoundModal {
  title: string;
  entries: RewardEntry[];
}

export interface TournamentRoundDiffResult {
  /** Reward modal to open, or null when the diff shouldn't fire one. */
  modal: TournamentRoundModal | null;
  /** Snapshot to persist for the next diff (round + eliminated flag). */
  next: { round: number; eliminated: boolean } | null;
}

/**
 * Pure diff for the tournament round-advance / elimination RewardSummaryModal.
 *
 * Mirrors the useEffect in challenge-detail.tsx: it returns a modal payload
 * ONLY when the bracket actually changed since the previous snapshot
 * (`prev = null` means "first render" and never opens the modal). The caller
 * is responsible for stashing `next` to drive the next call.
 */
export function diffTournamentRound(
  challenge: TournamentChallengeSnapshot | null | undefined,
  playerId: number | null | undefined,
  prev: { round: number; eliminated: boolean } | null,
): TournamentRoundDiffResult {
  if (!challenge || playerId == null) return { modal: null, next: null };
  if (!challenge.isElimination) return { modal: null, next: null };

  const round = challenge.currentRound ?? 1;
  const board = challenge.leaderboard ?? [];
  const me = board.find((e) => e.playerId === playerId);
  if (!me) return { modal: null, next: null };

  const next = { round, eliminated: me.eliminated };

  // First render — record the snapshot but never open the modal.
  if (prev === null) return { modal: null, next };

  const survivors = board.filter((e) => !e.eliminated);
  const baseXp = challenge.rewardXp ?? 0;
  const baseCoins = challenge.rewardCoins ?? 0;

  if (!prev.eliminated && me.eliminated) {
    const placement = survivors.length + 1;
    const cutRound = me.eliminatedRound ?? round;
    const entries: RewardEntry[] = [
      {
        kind: "challenge",
        label: `Eliminated in round ${cutRound}`,
        value: `#${placement}`,
        detail: "You went the distance. Respect — every round counts.",
      },
    ];
    if (placement <= 3) {
      entries.push({
        kind: "xp",
        label: "Final payout pending",
        detail: `Rewards finalize when the tournament wraps (top 3 share the prize).`,
      });
    } else {
      entries.push({
        kind: "leaderboard",
        label: "No payout this run",
        detail: "Top 3 finishers split the prize. Jump in the next bracket!",
      });
    }
    return {
      modal: { title: "Bracket Run Over", entries },
      next,
    };
  }

  if (!prev.eliminated && !me.eliminated && round > prev.round) {
    const opponents = survivors
      .filter((e) => e.playerId !== playerId)
      .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0));
    const top = opponents[0];
    const topName =
      top?.player?.displayName ?? top?.player?.username ?? (top ? `Player ${top.playerId}` : null);

    const entries: RewardEntry[] = [
      {
        kind: "challenge",
        label: `Advanced to round ${round}`,
        value: `${survivors.length} left`,
        detail: "You survived the cut. Progress resets — go again!",
      },
    ];
    if (topName) {
      entries.push({
        kind: "leaderboard",
        label: "Next to beat",
        value: topName,
        detail:
          opponents.length > 1
            ? `${opponents.length - 1} other survivor${opponents.length - 1 === 1 ? "" : "s"} also in the hunt.`
            : "Heads up — it's coming down to the two of you.",
      });
    }
    if (baseXp > 0 || baseCoins > 0) {
      entries.push({
        kind: "xp",
        label: "Grand prize still in play",
        detail: `Win it all for ${(baseXp * 2).toLocaleString()} XP + ${(baseCoins * 2).toLocaleString()} coins.`,
      });
    }
    return {
      modal: { title: `Round ${round} Survived!`, entries },
      next,
    };
  }

  return { modal: null, next };
}
