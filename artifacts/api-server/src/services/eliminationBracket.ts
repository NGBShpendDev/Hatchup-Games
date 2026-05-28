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
  updateChallengeRound(
    id: number,
    nextRound: number,
    nextEndAt: Date,
  ): Promise<void>;
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

  if (plan.eliminatedIds.length > 0) {
    await store.markEliminated(plan.eliminatedIds, plan.eliminatedRound);
  }

  // If only one survivor remains, the bracket is resolved — let the caller
  // run normal finalization (ranking + reward payout) for the champion. Do
  // NOT reset their progress or extend the timer.
  if (plan.kind === "champion") {
    return {
      kind: "champion",
      eliminatedParticipantIds: plan.eliminatedIds,
      eliminatedRound: plan.eliminatedRound,
    };
  }

  await store.resetSurvivorProgress(plan.survivorIds);
  await store.updateChallengeRound(challengeId, plan.nextRound, plan.nextEndAt);
  return {
    kind: "advance",
    eliminatedParticipantIds: plan.eliminatedIds,
    survivorParticipantIds: plan.survivorIds,
    eliminatedRound: plan.eliminatedRound,
    nextRound: plan.nextRound,
    nextEndAt: plan.nextEndAt,
  };
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
