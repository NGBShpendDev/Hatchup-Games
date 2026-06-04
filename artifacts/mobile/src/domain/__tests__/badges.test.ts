import {
  getBadgeCategoryProgress,
  getBadgeCategorySummary,
  getBadgeCompletionRatio,
  getBadgesByCategory,
  getBadges,
  getNextBadges,
  getUnlockedBadgeCount,
} from "../badges";
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

  it("groups badges by category and highlights near-complete milestones", () => {
    const data = {
      ...initialHatchUpData,
      accountXp: 900,
      eggsHatched: 4,
      longestStreak: 6,
      totalXp: 1400,
    };
    const summary = getBadgeCategorySummary(data, "2026-06-01");
    const grouped = getBadgesByCategory(data, "2026-06-01");
    const progress = getBadgeCategoryProgress(data, "2026-06-01");
    const nextBadges = getNextBadges(data, "2026-06-01", 3);

    expect(summary.collection.total).toBeGreaterThan(0);
    expect(summary.xp.total).toBeGreaterThan(0);
    expect(grouped.collection.length).toBe(summary.collection.total);
    expect(progress.collection).toBeGreaterThan(0);
    expect(getBadgeCompletionRatio(data, "2026-06-01")).toBeGreaterThan(0);
    expect(nextBadges.map((badge) => badge.id)).toContain("xp-1500");
  });
});
