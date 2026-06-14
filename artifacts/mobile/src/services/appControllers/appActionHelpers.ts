import type { TrainingFeedback } from "../../useHatchUpApp";
import { getHatchlingPowerScore, getTrainingStatus } from "../../domain/hatchlings";
import type { CollectedHatchling } from "../../domain/models";

export function createTrainingFeedback({
  after,
  before,
  chestProgressGained,
}: {
  after: CollectedHatchling;
  before: CollectedHatchling;
  chestProgressGained: number;
}): TrainingFeedback {
  return {
    bondGained: Math.max(after.bond - before.bond, 0),
    chestProgressGained,
    id: `${after.id}:${
      after.trainingSessions[after.trainingSessions.length - 1] ?? Date.now()
    }`,
    palName: after.name,
    powerGained: Math.max(
      getHatchlingPowerScore(after) - getHatchlingPowerScore(before),
      0,
    ),
    sessionsRemaining: getTrainingStatus(after).remainingToday,
    xpGained: Math.max(after.xp - before.xp, 0),
  };
}
