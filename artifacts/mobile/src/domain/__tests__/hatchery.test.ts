import { initialHatchUpData } from "../models";
import {
  addStepsToEgg,
  addStepsToEggs,
  createEgg,
  createStarterEgg,
  grantMilestoneEggs,
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

  it("advances all active eggs with the same movement", () => {
    const eggs = addStepsToEggs(initialHatchUpData.activeEggs, 900);

    expect(eggs).toHaveLength(3);
    expect(eggs.every((egg) => egg.stepsWalked === 900)).toBe(true);
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
    const activeEggs = initialHatchUpData.activeEggs.map((egg, index) =>
      index === 0 ? addStepsToEgg(egg, egg.stepsRequired) : egg,
    );
    const ready = {
      ...initialHatchUpData,
      activeEgg: activeEggs[0],
      activeEggs,
    };
    expect(isEggReady(ready.activeEgg)).toBe(true);

    const next = hatchActiveEgg(ready, "2026-06-01T12:00:00.000Z");

    expect(next.eggsHatched).toBe(1);
    expect(next.collection[0]).toMatchObject({
      id: "hatchling-1",
      name: "Sprig",
      element: "leaf",
      rarity: "common",
      level: 1,
      xp: 0,
    });
    expect(next.activeHatchlingId).toBe("hatchling-1");
    expect(next.activeEggs).toHaveLength(3);
    expect(next.activeEgg.id).not.toBe("egg-1");
  });

  it("creates a chosen starter egg for onboarding", () => {
    expect(createStarterEgg("storm")).toMatchObject({
      element: "storm",
      id: "starter-storm",
      rarity: "common",
    });
  });

  it("drops random milestone eggs into open incubator slots", () => {
    const starterOnly = {
      ...initialHatchUpData,
      activeEgg: initialHatchUpData.activeEggs[0],
      activeEggs: [initialHatchUpData.activeEggs[0]],
      milestoneEggsAwarded: [],
    };

    const next = grantMilestoneEggs(starterOnly, 0, 200);

    expect(next.activeEggs).toHaveLength(3);
    expect(next.milestoneEggsAwarded).toEqual(["xp-50", "xp-150"]);
  });
});
