import { getMonsterStage, getProgression } from "../progression";

describe("monster progression", () => {
  it.each([
    [0, "egg"],
    [199, "egg"],
    [200, "baby"],
    [700, "teen"],
    [1500, "final"],
  ])("maps %i XP to the %s stage", (xp, stage) => {
    expect(getMonsterStage(xp).id).toBe(stage);
  });

  it("reports progress toward the next evolution", () => {
    expect(getProgression(100)).toMatchObject({
      progress: 0.5,
      xpToNext: 100,
    });
  });
});
