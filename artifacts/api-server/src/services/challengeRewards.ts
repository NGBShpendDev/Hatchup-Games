export interface ChallengeRewardGrant {
  xp: number;
  coins: number;
  isChampion: boolean;
}

/**
 * Compute the XP/coin payout for a challenge participant.
 *
 * Normal (non-elimination) challenges pay out the top 3:
 *   1st = 100% / 2nd = 60% / 3rd = 30% of the base reward.
 *
 * Elimination tournaments take multiple rounds of effort to win, so the sole
 * survivor (rank 1) gets a champion-tier 2× boost on top of the normal 1st
 * place payout. Runner-up slots (rank 2 and 3) still get the normal share —
 * elimination logic typically only leaves a single survivor, but if the
 * bracket resolves with multiple non-eliminated players the normal scale
 * still applies to them.
 */
export function computeChallengeReward(
  rank: number,
  rewardXp: number,
  rewardCoins: number,
  isElimination: boolean,
): ChallengeRewardGrant {
  if (rank < 1 || rank > 3) return { xp: 0, coins: 0, isChampion: false };

  const baseMultiplier = rank === 1 ? 1 : rank === 2 ? 0.6 : 0.3;
  const championMultiplier = isElimination && rank === 1 ? 2 : 1;

  return {
    xp: Math.floor(rewardXp * baseMultiplier * championMultiplier),
    coins: Math.floor(rewardCoins * baseMultiplier * championMultiplier),
    isChampion: isElimination && rank === 1,
  };
}
