// Pure decision logic for tournament-end celebration overlays.
//
// challenge-detail.tsx wires the actual overlay state, but the gating rules
// (rank + status + isElimination + per-(player, challenge) seen-key) live
// here so they can be unit-tested in isolation. Keep this file framework-
// free — no React, no DOM — so the node:test runner can import it directly.

export type CelebrationChallenge = {
  status?: string;
  isElimination?: boolean;
  leaderboard?: { playerId: number; rank?: number }[];
};

export type CelebrationDecision =
  | { kind: "none" }
  | { kind: "champion"; seenKey: string }
  | { kind: "podium"; rank: 2 | 3; seenKey: string };

export function championSeenKey(playerId: number, challengeId: number): string {
  return `champion-overlay-seen:${playerId}:${challengeId}`;
}

export function podiumSeenKey(playerId: number, challengeId: number): string {
  return `podium-overlay-seen:${playerId}:${challengeId}`;
}

/**
 * Decide which (if any) end-of-tournament overlay should fire for the given
 * player on the given challenge payload. Returns `{ kind: "none" }` for any
 * of:
 *   - challenge isn't a completed elimination tournament
 *   - the player isn't on the leaderboard
 *   - the player finished 4th or worse
 *   - the seen-key for the matching overlay is already set in `seenKeys`
 *     (caller passes a Set / Map / lookup populated from localStorage)
 */
export function decideCelebration(
  challenge: CelebrationChallenge | null | undefined,
  playerId: number | null | undefined,
  challengeId: number,
  hasSeenKey: (key: string) => boolean,
): CelebrationDecision {
  if (!challenge || playerId == null) return { kind: "none" };
  if (challenge.status !== "completed") return { kind: "none" };
  if (challenge.isElimination !== true) return { kind: "none" };

  const me = (challenge.leaderboard ?? []).find((e) => e.playerId === playerId);
  const rank = me?.rank;
  if (rank == null) return { kind: "none" };

  if (rank === 1) {
    const seenKey = championSeenKey(playerId, challengeId);
    if (hasSeenKey(seenKey)) return { kind: "none" };
    return { kind: "champion", seenKey };
  }
  if (rank === 2 || rank === 3) {
    const seenKey = podiumSeenKey(playerId, challengeId);
    if (hasSeenKey(seenKey)) return { kind: "none" };
    return { kind: "podium", rank, seenKey };
  }
  return { kind: "none" };
}
