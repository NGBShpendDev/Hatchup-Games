import { getBadges, getUnlockedBadgeCount } from "../badges";
import { initialHatchUpData } from "../models";

describe("profile badges", () => {
  it("unlocks milestone badges from local profile progress", () => {
    const data = {
      ...initialHatchUpData,
      eggsHatched: 1,
      longestStreak: 3,
      totalXp: 500,
    };
    const badges = getBadges(data, "2026-06-01");

    expect(badges.find((badge) => badge.id === "first-hatch")?.unlocked).toBe(
      true,
    );
    expect(badges.find((badge) => badge.id === "streak-3")?.unlocked).toBe(
      true,
    );
    expect(getUnlockedBadgeCount(data, "2026-06-01")).toBeGreaterThanOrEqual(3);
  });
});
