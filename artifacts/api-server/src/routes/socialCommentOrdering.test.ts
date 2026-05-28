import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTopCommentAt, selectTopComments } from "./socialCommentOrdering.ts";

type Comment = { id: number; createdAt: Date };

const c = (id: number, iso: string): Comment => ({ id, createdAt: new Date(iso) });

describe("isTopCommentAt (top comment flag)", () => {
  it("flags the most-liked comment when it has >0 likes", () => {
    // Newest-first input mirrors the DB ordering enrichPost passes in.
    const all = [
      c(3, "2026-01-03T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
      c(1, "2026-01-01T00:00:00Z"),
    ];
    const likes = new Map<number, number>([
      [1, 5], // oldest but most-liked
      [2, 1],
      [3, 0],
    ]);
    const sorted = selectTopComments(all, likes, 3);

    assert.equal(sorted[0]?.id, 1, "most-liked should sort to the lead");
    assert.equal(isTopCommentAt(0, sorted, likes), true);
    assert.equal(isTopCommentAt(1, sorted, likes), false);
    assert.equal(isTopCommentAt(2, sorted, likes), false);
  });

  it("flags no comment as top when every comment has zero likes", () => {
    const all = [
      c(3, "2026-01-03T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
      c(1, "2026-01-01T00:00:00Z"),
    ];
    const likes = new Map<number, number>();
    const sorted = selectTopComments(all, likes, 3);

    // Lead position goes to the most recent on the recency tiebreak, but it
    // should NOT be flagged as the top comment because it didn't win on likes.
    assert.equal(sorted[0]?.id, 3);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(isTopCommentAt(i, sorted, likes), false, `index ${i} should not be top`);
    }
  });

  it("flags only the single lead comment when multiple comments tie on likes", () => {
    const all = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
      c(3, "2026-01-03T00:00:00Z"),
    ];
    // Three-way tie at 4 likes each — recency breaks the tie.
    const likes = new Map<number, number>([
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    const sorted = selectTopComments(all, likes, 3);

    assert.equal(sorted[0]?.id, 3, "newest should win the like tie");
    assert.equal(isTopCommentAt(0, sorted, likes), true);
    assert.equal(isTopCommentAt(1, sorted, likes), false);
    assert.equal(isTopCommentAt(2, sorted, likes), false);
  });

  it("returns false for an empty comment list", () => {
    assert.equal(isTopCommentAt(0, [], new Map()), false);
  });
});
