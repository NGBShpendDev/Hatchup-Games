import { initialHatchUpData } from "../models";
import {
  addXpToActiveHatchling,
  createHatchlingFromEgg,
  getHatchlingLevel,
  getHatchlingPowerScore,
  getTimeAdjustedHatchling,
  getTrainingStatus,
  trainHatchling,
} from "../hatchlings";

describe("hatchling progression", () => {
  it("creates hatchlings with level one stats from eggs", () => {
    const hatchling = createHatchlingFromEgg({
      egg: {
        element: "ember",
        id: "egg-ember",
        rarity: "rare",
        stepsRequired: 1500,
        stepsWalked: 1500,
      },
      hatchedAt: "2026-06-01T12:00:00.000Z",
      index: 1,
    });

    expect(hatchling).toMatchObject({
      bond: 5,
      element: "ember",
      level: 1,
      mood: "happy",
      name: "Cinder",
      rarity: "rare",
      xp: 0,
    });
    expect(getHatchlingPowerScore(hatchling)).toBeGreaterThan(40);
  });

  it("trains the active hatchling with earned XP", () => {
    const hatchling = createHatchlingFromEgg({
      egg: initialHatchUpData.activeEgg,
      hatchedAt: "2026-06-01T12:00:00.000Z",
      index: 1,
    });
    const data = {
      ...initialHatchUpData,
      activeHatchlingId: hatchling.id,
      collection: [hatchling],
    };

    const next = addXpToActiveHatchling(data, 150, "2026-06-01T12:00:00.000Z");

    expect(getHatchlingLevel(150)).toBe(3);
    expect(next.collection[0]).toMatchObject({
      bond: 11,
      level: 3,
      xp: 150,
    });
  });

  it("limits manual training with a daily cooldown", () => {
    const hatchling = createHatchlingFromEgg({
      egg: initialHatchUpData.activeEgg,
      hatchedAt: "2026-06-01T08:00:00.000Z",
      index: 1,
    });
    const data = {
      ...initialHatchUpData,
      activeHatchlingId: hatchling.id,
      collection: [hatchling],
    };

    const first = trainHatchling(data, hatchling.id, "2026-06-01T09:00:00.000Z");
    const blocked = trainHatchling(
      first,
      hatchling.id,
      "2026-06-01T10:00:00.000Z",
    );
    const second = trainHatchling(
      blocked,
      hatchling.id,
      "2026-06-01T13:00:00.000Z",
    );

    expect(first.collection[0].trainingSessions).toHaveLength(1);
    expect(blocked.collection[0].trainingSessions).toHaveLength(1);
    expect(second.collection[0].trainingSessions).toHaveLength(2);
    expect(getTrainingStatus(second.collection[0], "2026-06-01T13:30:00.000Z"))
      .toMatchObject({
        canTrain: false,
        remainingToday: 1,
        sessionsToday: 2,
      });
  });

  it("adds passive bond from elapsed time", () => {
    const hatchling = createHatchlingFromEgg({
      egg: initialHatchUpData.activeEgg,
      hatchedAt: "2026-06-01T08:00:00.000Z",
      index: 1,
    });

    const adjusted = getTimeAdjustedHatchling(
      hatchling,
      "2026-06-02T08:00:00.000Z",
    );

    expect(adjusted.bond).toBe(8);
    expect(adjusted.lastInteractionAt).toBe("2026-06-02T08:00:00.000Z");
  });
});
