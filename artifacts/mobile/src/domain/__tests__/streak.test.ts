import { updateStreak } from "../streak";

describe("updateStreak", () => {
  it("continues a streak on the following day", () => {
    expect(
      updateStreak(
        {
          currentStreak: 3,
          longestStreak: 4,
          lastRewardDate: "2026-05-31",
        },
        "2026-06-01",
        10,
      ),
    ).toEqual({
      currentStreak: 4,
      longestStreak: 4,
      lastRewardDate: "2026-06-01",
    });
  });

  it("does not increase a streak twice on the same day", () => {
    const existing = {
      currentStreak: 3,
      longestStreak: 4,
      lastRewardDate: "2026-06-01",
    };
    expect(updateStreak(existing, "2026-06-01", 10)).toEqual(existing);
  });
});
