import {
  getCreatureDexEntries,
  getDexCompletion,
  getDexElementSummary,
  getDexRaritySummary,
  getNextMissingDexEntry,
} from "../creatureDex";
import type { CollectedHatchling } from "../models";

describe("creature dex", () => {
  const collection: CollectedHatchling[] = [
    {
      bond: 5,
      id: "hatchling-1",
      lastInteractionAt: "2026-06-01T12:00:00.000Z",
      memories: [
        {
          description: "Hatched from a common leaf egg.",
          happenedAt: "2026-06-01T12:00:00.000Z",
          id: "memory-hatch-1",
          label: "First hatch",
        },
      ],
      name: "Sprig",
      element: "leaf",
      mood: "happy",
      rarity: "common",
      hatchedAt: "2026-06-01T12:00:00.000Z",
      level: 1,
      stats: { heart: 9, power: 6, resilience: 8, speed: 5 },
      trainingSessions: [],
      xp: 0,
    },
    {
      bond: 10,
      id: "hatchling-2",
      lastInteractionAt: "2026-06-02T12:00:00.000Z",
      memories: [
        {
          description: "Hatched from a common leaf egg.",
          happenedAt: "2026-06-02T12:00:00.000Z",
          id: "memory-hatch-2",
          label: "First hatch",
        },
      ],
      name: "Moss",
      element: "leaf",
      mood: "happy",
      rarity: "common",
      hatchedAt: "2026-06-02T12:00:00.000Z",
      level: 2,
      stats: { heart: 9, power: 7, resilience: 8, speed: 5 },
      trainingSessions: [],
      xp: 75,
    },
  ];

  it("tracks owned counts by element and rarity", () => {
    const entries = getCreatureDexEntries(collection);
    const commonLeaf = entries.find((entry) => entry.id === "common-leaf");

    expect(entries).toHaveLength(16);
    expect(commonLeaf).toMatchObject({
      ownedCount: 2,
      firstHatchedAt: "2026-06-01T12:00:00.000Z",
    });
  });

  it("reports collection completion", () => {
    expect(getDexCompletion(collection)).toEqual({
      total: 16,
      unlocked: 1,
      percent: 1 / 16,
    });
  });

  it("summarizes collection by element and rarity", () => {
    const leaf = getDexElementSummary(collection).find(
      (summary) => summary.id === "leaf",
    );
    const common = getDexRaritySummary(collection).find(
      (summary) => summary.id === "common",
    );

    expect(leaf).toMatchObject({ total: 4, unlocked: 1, percent: 1 / 4 });
    expect(common).toMatchObject({ total: 4, unlocked: 1, percent: 1 / 4 });
    expect(getNextMissingDexEntry(collection)).toMatchObject({
      element: "ember",
      rarity: "common",
    });
  });
});
