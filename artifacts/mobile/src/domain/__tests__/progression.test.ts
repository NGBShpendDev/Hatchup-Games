import { getMonsterStage, getProgression } from "../progression";

describe("monster progression", () => {
  it.each([
    [0, "egg"],
    [59, "egg"],
    [60, "baby"],
    [200, "teen"],
    [500, "final"],
  ])("maps %i XP to the %s stage", (xp, stage) => {
    expect(getMonsterStage(xp).id).toBe(stage);
  });

  it("reports progress toward the next evolution", () => {
    expect(getProgression(30)).toMatchObject({
      progress: 0.5,
      xpToNext: 30,
    });
  });
});
