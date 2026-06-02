import { getCreatureDexEntries, getDexCompletion } from "../creatureDex";
import type { CollectedHatchling } from "../models";

describe("creature dex", () => {
  const collection: CollectedHatchling[] = [
    {
      id: "hatchling-1",
      name: "Sprig",
      element: "leaf",
      rarity: "common",
      hatchedAt: "2026-06-01T12:00:00.000Z",
    },
    {
      id: "hatchling-2",
      name: "Moss",
      element: "leaf",
      rarity: "common",
      hatchedAt: "2026-06-02T12:00:00.000Z",
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
