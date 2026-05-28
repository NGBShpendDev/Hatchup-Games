import { rankChallengeParticipants } from "./eliminationBracket.ts";

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

// ── Reward distribution orchestration ──────────────────────────────────────
// Extracted from `routes/challenges.ts::finalizeChallenge` so the ranking +
// payout + status-transition flow can be unit-tested without touching the DB
// (same store-injection pattern used by `services/eliminationBracket`).
//
// The caller (route layer) is still responsible for the elimination-round
// advance attempt and for fanning out "challenge complete" pushes — those
// involve I/O that is uninteresting to the rule logic. This function owns
// exactly: rank assignment, top-3 reward payout, champion badge/artifact
// hook, and the one-shot status transition to "completed".

export type RewardChallenge = {
  id: number;
  status: string;
  endAt: Date;
  isElimination: boolean;
  rewardXp: number;
  rewardCoins: number;
};

export type RewardParticipant = {
  id: number;
  playerId: number;
  currentValue: number;
  eliminated: boolean;
  eliminatedRound: number | null;
};

export interface RewardStore {
  getChallenge(id: number): Promise<RewardChallenge | null>;
  getParticipants(challengeId: number): Promise<RewardParticipant[]>;
  setParticipantRank(participantId: number, rank: number): Promise<void>;
  grantPlayerReward(
    playerId: number,
    xp: number,
    coins: number,
  ): Promise<void>;
  awardChampion(playerId: number, challengeId: number): Promise<void>;
  markCompleted(challengeId: number): Promise<void>;
}

export type DistributionRanking = {
  participantId: number;
  playerId: number;
  rank: number;
  grant: ChallengeRewardGrant;
};

export type DistributionOutcome =
  | { kind: "noop"; reason: "not_found" | "not_active" | "not_ended" }
  | { kind: "completed"; rankings: DistributionRanking[] };

export async function distributeChallengeRewards(
  store: RewardStore,
  challengeId: number,
  now: Date = new Date(),
): Promise<DistributionOutcome> {
  const challenge = await store.getChallenge(challengeId);
  if (!challenge) return { kind: "noop", reason: "not_found" };
  if (challenge.status !== "active") return { kind: "noop", reason: "not_active" };
  if (now < challenge.endAt) return { kind: "noop", reason: "not_ended" };

  // Rank every participant — survivors first, then eliminated players by
  // `eliminatedRound` desc, ties broken by `currentValue` desc. This is the
  // same helper the public leaderboard endpoint uses, so the ordering shown
  // to players matches the order in which rewards get paid out. In a
  // single-survivor elimination tournament that means the survivor is 1st,
  // the last-eliminated rival is 2nd, etc., even when stale `currentValue`
  // on eliminated rows is numerically higher.
  const all = await store.getParticipants(challengeId);
  const ranked = rankChallengeParticipants(all);

  const rankings: DistributionRanking[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const rank = i + 1;
    const p = ranked[i];
    await store.setParticipantRank(p.id, rank);
    // The champion-tier 2× boost + badge is reserved for a tournament
    // survivor. In the (defensive) edge case where the rank-1 row is itself
    // eliminated (e.g. bracket finalized with no survivors), treat it as a
    // non-champion finish so we never crown an eliminated player.
    const grant = computeChallengeReward(
      rank,
      challenge.rewardXp,
      challenge.rewardCoins,
      challenge.isElimination && !p.eliminated,
    );
    if (grant.xp > 0 || grant.coins > 0) {
      await store.grantPlayerReward(p.playerId, grant.xp, grant.coins);
    }
    if (grant.isChampion) {
      await store.awardChampion(p.playerId, challengeId);
    }
    rankings.push({ participantId: p.id, playerId: p.playerId, rank, grant });
  }

  await store.markCompleted(challengeId);
  return { kind: "completed", rankings };
}
