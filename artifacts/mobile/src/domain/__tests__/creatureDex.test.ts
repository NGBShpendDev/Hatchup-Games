import { getCreatureDexEntries, getDexCompletion } from "../creatureDex";
import type { CollectedHatchling } from "../models";

describe("creature dex", () => {
  const collection: CollectedHatchling[] = [
    {
      bond: 5,
      id: "hatchling-1",
      lastInteractionAt: "2026-06-01T12:00:00.000Z",
      name: "Sprig",
      element: "leaf",
      mood: "happy",
      rarity: "common",
      hatchedAt: "2026-06-01T12:00:00.000Z",
      level: 1,
      stats: { heart: 9, power: 6, resilience: 8, speed: 5 },
      xp: 0,
    },
    {
      bond: 10,
      id: "hatchling-2",
      lastInteractionAt: "2026-06-02T12:00:00.000Z",
      name: "Moss",
      element: "leaf",
      mood: "happy",
      rarity: "common",
      hatchedAt: "2026-06-02T12:00:00.000Z",
      level: 2,
      stats: { heart: 9, power: 7, resilience: 8, speed: 5 },
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
});
