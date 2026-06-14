import { getEggProgressSummary, getTrackedEgg } from "../eggProgress";
import type { IncubatorEgg } from "../models";

function egg(overrides: Partial<IncubatorEgg>): IncubatorEgg {
  return {
    element: "tide",
    id: "test-egg",
    rarity: "common",
    stepsRequired: 5000,
    stepsWalked: 0,
    ...overrides,
  };
}

describe("eggProgress", () => {
  it("formats clear progress labels for active eggs", () => {
    const summary = getEggProgressSummary(egg({ stepsWalked: 3243 }));

    expect(summary.eggName).toBe("Common Tide Egg");
    expect(summary.progressLabel).toBe("3,243 / 5,000 steps");
    expect(summary.stepsLeftLabel).toBe("1,757 steps left");
    expect(summary.readinessLabel).toBe("Common Tide Egg is 65% ready");
    expect(summary.isReady).toBe(false);
  });

  it("clamps old or debug egg values into safe display ranges", () => {
    const overfilled = getEggProgressSummary(egg({ stepsWalked: 9999 }));
    const negative = getEggProgressSummary(egg({ stepsWalked: -500 }));

    expect(overfilled.percent).toBe(1);
    expect(overfilled.stepsLeft).toBe(0);
    expect(overfilled.stepsLeftLabel).toBe("Ready to hatch");
    expect(negative.percent).toBe(0);
    expect(negative.stepsProgress).toBe(0);
    expect(negative.stepsLeft).toBe(5000);
  });

  it("tracks ready eggs first, then the closest not-ready egg", () => {
    const trackedReady = getTrackedEgg([
      egg({ id: "far", stepsWalked: 500 }),
      egg({ id: "ready", stepsWalked: 5000 }),
    ]);
    const trackedClosest = getTrackedEgg([
      egg({ id: "far", stepsWalked: 500 }),
      egg({ id: "close", stepsWalked: 4200 }),
    ]);

    expect(trackedReady?.id).toBe("ready");
    expect(trackedClosest?.id).toBe("close");
  });
});
