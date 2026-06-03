import { initialHatchUpData } from "../models";
import {
  addXpToActiveHatchling,
  createHatchlingFromEgg,
  getHatchlingLevel,
  getHatchlingPowerScore,
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

    const next = addXpToActiveHatchling(data, 150);

    expect(getHatchlingLevel(150)).toBe(3);
    expect(next.collection[0]).toMatchObject({
      bond: 11,
      level: 3,
      xp: 150,
    });
  });
});
