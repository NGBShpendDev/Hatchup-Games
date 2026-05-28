import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupSharedGroupRows } from "./sharedGroups.ts";

describe("groupSharedGroupRows", () => {
  it("returns an empty map when there are no rows (viewer + target share zero groups)", () => {
    const result = groupSharedGroupRows([]);
    assert.equal(result.size, 0);
  });

  it("returns a single entry when viewer and target share exactly one group", () => {
    const result = groupSharedGroupRows([
      { playerId: 42, groupId: 7, groupName: "Morning Runners" },
    ]);
    assert.equal(result.size, 1);
    assert.deepEqual(result.get(42), [{ id: 7, name: "Morning Runners" }]);
  });

  it("returns all entries when viewer and target share multiple groups", () => {
    const result = groupSharedGroupRows([
      { playerId: 42, groupId: 7, groupName: "Morning Runners" },
      { playerId: 42, groupId: 9, groupName: "Yoga Crew" },
      { playerId: 42, groupId: 11, groupName: "Lift Club" },
    ]);
    assert.deepEqual(result.get(42), [
      { id: 7, name: "Morning Runners" },
      { id: 9, name: "Yoga Crew" },
      { id: 11, name: "Lift Club" },
    ]);
  });

  it("omits players who are not in any shared group from the result map", () => {
    // Page contains players 42, 43, 44 — only 42 and 44 share groups with viewer.
    const result = groupSharedGroupRows([
      { playerId: 42, groupId: 7, groupName: "Morning Runners" },
      { playerId: 44, groupId: 9, groupName: "Yoga Crew" },
      { playerId: 44, groupId: 11, groupName: "Lift Club" },
    ]);
    assert.equal(result.has(43), false);
    assert.deepEqual(result.get(42), [{ id: 7, name: "Morning Runners" }]);
    assert.deepEqual(result.get(44), [
      { id: 9, name: "Yoga Crew" },
      { id: 11, name: "Lift Club" },
    ]);
    // Callers fall back to `[]` via `sharedGroupsByPlayer.get(p.id) ?? []`,
    // so an omitted player must surface as an empty array, not undefined data.
    assert.deepEqual(result.get(43) ?? [], []);
  });

  it("keeps each player's groups isolated (no cross-contamination)", () => {
    const result = groupSharedGroupRows([
      { playerId: 1, groupId: 100, groupName: "A" },
      { playerId: 2, groupId: 200, groupName: "B" },
      { playerId: 1, groupId: 300, groupName: "C" },
    ]);
    assert.deepEqual(result.get(1), [
      { id: 100, name: "A" },
      { id: 300, name: "C" },
    ]);
    assert.deepEqual(result.get(2), [{ id: 200, name: "B" }]);
  });
});
