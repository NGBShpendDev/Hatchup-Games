import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupSharedGroupRows,
  groupMutualWorkoutPartnerRows,
  MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT,
} from "./sharedGroups.ts";

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

describe("groupMutualWorkoutPartnerRows", () => {
  const partnerRow = (
    candidateId: number,
    partnerId: number,
    displayName: string,
    extra: { username?: string | null; avatarUrl?: string | null; creatorBadge?: string | null } = {},
  ) => ({
    candidateId,
    partnerId,
    partnerDisplayName: displayName,
    partnerUsername: extra.username ?? null,
    partnerAvatarUrl: extra.avatarUrl ?? null,
    partnerCreatorBadge: extra.creatorBadge ?? null,
  });

  it("returns an empty map for no rows", () => {
    const result = groupMutualWorkoutPartnerRows([]);
    assert.equal(result.size, 0);
  });

  it("groups partners per candidate and carries through identity fields", () => {
    const result = groupMutualWorkoutPartnerRows([
      partnerRow(10, 1, "Alex", { username: "alex", avatarUrl: "https://a.example/x.png", creatorBadge: "PRO" }),
      partnerRow(10, 2, "Sam", { username: "sam" }),
      partnerRow(11, 1, "Alex", { username: "alex", avatarUrl: "https://a.example/x.png", creatorBadge: "PRO" }),
    ]);
    assert.deepEqual(result.get(10), [
      { id: 1, displayName: "Alex", username: "alex", avatarUrl: "https://a.example/x.png", creatorBadge: "PRO" },
      { id: 2, displayName: "Sam", username: "sam", avatarUrl: null, creatorBadge: null },
    ]);
    assert.deepEqual(result.get(11), [
      { id: 1, displayName: "Alex", username: "alex", avatarUrl: "https://a.example/x.png", creatorBadge: "PRO" },
    ]);
  });

  it("dedups the same partner appearing across multiple shared groups", () => {
    const result = groupMutualWorkoutPartnerRows([
      partnerRow(10, 1, "Alex"),
      partnerRow(10, 1, "Alex"),
      partnerRow(10, 2, "Sam"),
    ]);
    assert.deepEqual(result.get(10), [
      { id: 1, displayName: "Alex", username: null, avatarUrl: null, creatorBadge: null },
      { id: 2, displayName: "Sam", username: null, avatarUrl: null, creatorBadge: null },
    ]);
  });

  it("caps each candidate's list at the preview limit", () => {
    const rows = Array.from({ length: MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT + 5 }, (_, i) =>
      partnerRow(10, i + 1, `Buddy ${i + 1}`),
    );
    const result = groupMutualWorkoutPartnerRows(rows);
    assert.equal(result.get(10)!.length, MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT);
  });

  it("respects a custom limit", () => {
    const rows = [
      partnerRow(10, 1, "A"),
      partnerRow(10, 2, "B"),
      partnerRow(10, 3, "C"),
    ];
    const result = groupMutualWorkoutPartnerRows(rows, 2);
    assert.deepEqual(result.get(10), [
      { id: 1, displayName: "A", username: null, avatarUrl: null, creatorBadge: null },
      { id: 2, displayName: "B", username: null, avatarUrl: null, creatorBadge: null },
    ]);
  });
});
