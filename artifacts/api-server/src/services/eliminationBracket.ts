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
