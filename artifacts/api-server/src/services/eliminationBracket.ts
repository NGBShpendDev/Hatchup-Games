export type BracketParticipant = {
  id: number;
  currentValue: number;
};

export type BracketChallenge = {
  currentRound: number;
  durationDays: number;
};

export type EliminationPlan =
  | { kind: "noop" }
  | {
      kind: "champion";
      eliminatedIds: number[];
      eliminatedRound: number;
      survivorIds: number[];
    }
  | {
      kind: "advance";
      eliminatedIds: number[];
      eliminatedRound: number;
      survivorIds: number[];
      nextRound: number;
      nextEndAt: Date;
    };

export type StoredChallenge = {
  id: number;
  isElimination: boolean;
  currentRound: number;
  durationDays: number;
  status?: string;
};

export interface EliminationStore {
  getChallenge(id: number): Promise<StoredChallenge | null>;
  getActiveParticipants(challengeId: number): Promise<BracketParticipant[]>;
  markEliminated(ids: number[], eliminatedRound: number): Promise<void>;
  resetSurvivorProgress(ids: number[]): Promise<void>;
  // Atomic conditional UPDATE: bump current_round to `nextRound` (and
  // optionally extend end_at) iff the row still has
  // `current_round = expectedRound AND status = 'active'`. Returns true
  // only for the single concurrent caller that won the race; losing
  // callers see `false` and must bail out without mutating any other
  // state. This is the idempotency claim that prevents two near-
  // simultaneous finalize attempts from double-eliminating losers or
  // double-bumping the round counter.
  tryClaimRoundResolution(
    id: number,
    expectedRound: number,
    nextRound: number,
    nextEndAt: Date | null,
  ): Promise<boolean>;
}

export type AdvanceOutcome =
  | { kind: "noop" }
  | {
      kind: "champion";
      eliminatedParticipantIds: number[];
      eliminatedRound: number;
    }
  | {
      kind: "advance";
      eliminatedParticipantIds: number[];
      survivorParticipantIds: number[];
      eliminatedRound: number;
      nextRound: number;
      nextEndAt: Date;
    };

// Orchestrates a single round advancement against an injectable store so the
// logic can be unit-tested without spinning up a DB. Returns an outcome the
// caller can use both for control flow ("advance" → leave challenge active,
// "champion"/"noop" → caller finalizes) and for downstream notification
// fan-out (which playerIds were eliminated vs. advanced).
export async function advanceEliminationRound(
  store: EliminationStore,
  challengeId: number,
  now: Date = new Date(),
): Promise<AdvanceOutcome> {
  const challenge = await store.getChallenge(challengeId);
  if (!challenge || !challenge.isElimination) return { kind: "noop" };
  if (challenge.status && challenge.status !== "active") return { kind: "noop" };

  const active = await store.getActiveParticipants(challengeId);

  const plan = planEliminationRound(
    { currentRound: challenge.currentRound, durationDays: challenge.durationDays },
    active,
    now,
  );

  if (plan.kind === "noop") return { kind: "noop" };

  // Atomic claim BEFORE any participant mutations. The conditional UPDATE
  // ensures only one concurrent caller wins this round's resolution; the
  // loser bails out as a noop so we never double-eliminate or double-bump.
  // For the "advance" path we bump current_round → nextRound and extend
  // end_at. For "champion" we still bump current_round (by 1) so a racing
  // caller's claim against the old expected round fails — even though the
  // timer is not extended (nextEndAt = null).
  const expectedRound = challenge.currentRound;
  const claimNextRound =
    plan.kind === "advance" ? plan.nextRound : expectedRound + 1;
  const claimNextEndAt = plan.kind === "advance" ? plan.nextEndAt : null;
  const claimed = await store.tryClaimRoundResolution(
    challengeId,
    expectedRound,
    claimNextRound,
    claimNextEndAt,
  );
  if (!claimed) return { kind: "noop" };

  if (plan.eliminatedIds.length > 0) {
    await store.markEliminated(plan.eliminatedIds, plan.eliminatedRound);
  }

  // If only one survivor remains, the bracket is resolved — let the caller
  // run normal finalization (ranking + reward payout) for the champion. Do
  // NOT reset their progress.
  if (plan.kind === "champion") {
    return {
      kind: "champion",
      eliminatedParticipantIds: plan.eliminatedIds,
      eliminatedRound: plan.eliminatedRound,
    };
  }

  await store.resetSurvivorProgress(plan.survivorIds);
  return {
    kind: "advance",
    eliminatedParticipantIds: plan.eliminatedIds,
    survivorParticipantIds: plan.survivorIds,
    eliminatedRound: plan.eliminatedRound,
    nextRound: plan.nextRound,
    nextEndAt: plan.nextEndAt,
  };
}

// Pure helper: produce the final ordering for a challenge's participants.
//
// Used by both the public leaderboard endpoint and the reward distribution
// flow so they agree on who finished 1st/2nd/3rd. The rule, in order:
//
//   1. Non-eliminated participants always rank above eliminated ones.
//      In a finished elimination tournament the sole survivor is the
//      champion regardless of stale `currentValue` rivals carried into
//      elimination.
//   2. Within the eliminated group, a later `eliminatedRound` wins —
//      surviving more rounds is the stronger result. Missing rounds are
//      treated as round 0 so legacy rows sort to the bottom.
//   3. Ties are broken by `currentValue` descending (raw progress for
//      non-elimination challenges, or last recorded round progress for
//      elimination rows).
//
// Stable for equal keys (Array.prototype.sort is stable in V8/Node), so
// identical participants keep their input order.
export type RankableParticipant = {
  id: number;
  currentValue: number;
  eliminated: boolean;
  eliminatedRound: number | null;
};

export function rankChallengeParticipants<T extends RankableParticipant>(
  participants: ReadonlyArray<T>,
): T[] {
  return [...participants].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.eliminated && b.eliminated) {
      const ar = a.eliminatedRound ?? 0;
      const br = b.eliminatedRound ?? 0;
      if (ar !== br) return br - ar;
    }
    return (b.currentValue ?? 0) - (a.currentValue ?? 0);
  });
}

export function planEliminationRound(
  challenge: BracketChallenge,
  activeParticipants: ReadonlyArray<BracketParticipant>,
  now: Date = new Date(),
): EliminationPlan {
  if (activeParticipants.length <= 1) return { kind: "noop" };

  const sorted = [...activeParticipants].sort(
    (a, b) => b.currentValue - a.currentValue,
  );

  const surviveCount =
    sorted.length === 2 ? 1 : Math.ceil(sorted.length / 2);

  const survivors = sorted.slice(0, surviveCount);
  const eliminated = sorted.slice(surviveCount);

  const eliminatedRound = challenge.currentRound;
  const eliminatedIds = eliminated.map((p) => p.id);
  const survivorIds = survivors.map((p) => p.id);

  if (survivors.length <= 1) {
    return { kind: "champion", eliminatedIds, eliminatedRound, survivorIds };
  }

  const nextEndAt = new Date(
    now.getTime() + challenge.durationDays * 24 * 60 * 60 * 1000,
  );

  return {
    kind: "advance",
    eliminatedIds,
    eliminatedRound,
    survivorIds,
    nextRound: challenge.currentRound + 1,
    nextEndAt,
  };
}
