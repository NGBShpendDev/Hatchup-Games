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

export type ClaimOutcome =
  | { kind: "claimed"; challenge: RewardChallenge }
  | { kind: "noop"; reason: "not_found" | "not_active" | "not_ended" };

/**
 * The transaction-bound operations passed to the callback in
 * `RewardStore.runFinalization`. All work performed via these methods
 * MUST run inside the same DB transaction so that a mid-flight failure
 * (process crash, dropped connection, awardChampion throwing, etc.) rolls
 * back the status flip and every preceding rank/grant write together.
 * Without that guarantee the challenge could be left marked `completed`
 * with only some participants paid and no retry path (subsequent finalize
 * attempts would noop on `status='not_active'`).
 */
export interface RewardStoreTx {
  /**
   * Atomically transition the challenge from `status="active"` to
   * `status="completed"` iff the challenge exists, is still active, and its
   * `endAt` is in the past. The transition MUST be performed in a single
   * conditional write (e.g. `UPDATE ... WHERE status='active' RETURNING`
   * or a `SELECT ... FOR UPDATE` inside a transaction) so that under
   * concurrent finalize attempts exactly one caller receives `"claimed"`
   * and every other caller receives `"noop"`. The claimed caller is the
   * only one that pays out rewards; this is what guarantees rewards are
   * never double-paid even if the leaderboard route auto-finalizes the
   * same challenge from two requests at the same time.
   */
  claimChallengeForFinalization(
    id: number,
    now: Date,
  ): Promise<ClaimOutcome>;
  getParticipants(challengeId: number): Promise<RewardParticipant[]>;
  setParticipantRank(participantId: number, rank: number): Promise<void>;
  grantPlayerReward(
    playerId: number,
    xp: number,
    coins: number,
  ): Promise<void>;
  awardChampion(playerId: number, challengeId: number): Promise<void>;
}

export interface RewardStore {
  /**
   * Run the entire finalization flow — claim, rank updates, grants, and
   * champion awards — inside a single DB transaction. If `fn` throws or
   * the underlying connection drops mid-flight, the transaction MUST roll
   * back so the status flip is reverted along with any participant writes.
   * This leaves the challenge in `status="active"` and a retry can re-run
   * `distributeChallengeRewards` to pay everyone correctly.
   */
  runFinalization<T>(fn: (tx: RewardStoreTx) => Promise<T>): Promise<T>;
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
  // The entire flow — atomic claim, per-participant rank persistence,
  // top-3 reward grants, and the champion badge/artifact award — runs in a
  // single transaction. If anything inside throws (process crash, dropped
  // DB connection, awardChampion failing, etc.) the transaction rolls
  // back the status flip along with any partial writes, so a subsequent
  // finalize attempt can re-claim the challenge and pay everyone
  // correctly. Without this we could be left with `status='completed'`
  // and only some participants paid — and no retry path, because future
  // attempts would noop on `status='not_active'`.
  //
  // Concurrency is still preserved: `claimChallengeForFinalization` is a
  // single conditional write that flips `status: "active" -> "completed"`
  // and returns the row only if it won the claim. Losers receive a
  // "not_active" noop and skip every payout side effect below, so rewards
  // can never double-pay even if multiple callers reach
  // `distributeChallengeRewards` at the same instant.
  return store.runFinalization(async (tx) => {
    const claim = await tx.claimChallengeForFinalization(challengeId, now);
    if (claim.kind === "noop") return claim;
    const challenge = claim.challenge;

    // Rank every participant — survivors first, then eliminated players by
    // `eliminatedRound` desc, ties broken by `currentValue` desc. This is the
    // same helper the public leaderboard endpoint uses, so the ordering shown
    // to players matches the order in which rewards get paid out. In a
    // single-survivor elimination tournament that means the survivor is 1st,
    // the last-eliminated rival is 2nd, etc., even when stale `currentValue`
    // on eliminated rows is numerically higher.
    const all = await tx.getParticipants(challengeId);
    const ranked = rankChallengeParticipants(all);

    const rankings: DistributionRanking[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const rank = i + 1;
      const p = ranked[i];
      await tx.setParticipantRank(p.id, rank);
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
        await tx.grantPlayerReward(p.playerId, grant.xp, grant.coins);
      }
      if (grant.isChampion) {
        await tx.awardChampion(p.playerId, challengeId);
      }
      rankings.push({ participantId: p.id, playerId: p.playerId, rank, grant });
    }

    // No explicit markCompleted: the atomic claim above already flipped
    // `status` to `"completed"` (inside this transaction). That ordering
    // gives us idempotency under concurrent finalize attempts and lets
    // the rollback path revert the flip if anything below fails.
    return { kind: "completed", rankings };
  });
}
