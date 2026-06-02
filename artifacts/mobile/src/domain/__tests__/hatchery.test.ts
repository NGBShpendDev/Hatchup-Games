import { initialHatchUpData } from "../models";
import {
  addStepsToEgg,
  createEgg,
  getNewStepsForSync,
  hatchActiveEgg,
  isEggReady,
} from "../hatchery";

describe("hatchery", () => {
  it("advances an egg with movement without exceeding its requirement", () => {
    const egg = createEgg(0);

    expect(addStepsToEgg(egg, 10000)).toMatchObject({
      stepsWalked: egg.stepsRequired,
    });
  });

  it("counts only newly synced steps on the same day", () => {
    expect(
      getNewStepsForSync(
        {
          date: "2026-06-01",
          health: {
            date: "2026-06-01",
            steps: 4250,
            activeCalories: 260,
            workouts: 1,
            source: "mock",
          },
          xp: {
            steps: 42,
            activeCalories: 26,
            workouts: 30,
            quests: 60,
            firstSync: 15,
            total: 173,
          },
        },
        "2026-06-01",
        5000,
      ),
    ).toBe(750);
  });

  it("moves a ready egg into the collection and starts a new egg", () => {
    const ready = {
      ...initialHatchUpData,
      activeEgg: addStepsToEgg(initialHatchUpData.activeEgg, 1500),
    };
    expect(isEggReady(ready.activeEgg)).toBe(true);

    const next = hatchActiveEgg(ready, "2026-06-01T12:00:00.000Z");

    expect(next.eggsHatched).toBe(1);
    expect(next.collection[0]).toMatchObject({
      id: "hatchling-1",
      name: "Sprig",
      element: "leaf",
      rarity: "common",
    });
    expect(next.activeEgg.id).toBe("egg-2");
  });
});
