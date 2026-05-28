import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectTopComments } from "./socialCommentOrdering.ts";

type C = { id: number; createdAt: Date };

const c = (id: number, iso: string): C => ({ id, createdAt: new Date(iso) });

describe("selectTopComments", () => {
  it("returns the most-liked comment first", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-01T00:01:00Z"),
      c(3, "2026-01-01T00:02:00Z"),
    ];
    const likes = new Map<number, number>([
      [1, 2],
      [2, 10],
      [3, 5],
    ]);
    const top = selectTopComments(comments, likes, 3);
    assert.deepEqual(top.map(x => x.id), [2, 3, 1]);
  });

  it("breaks like ties by recency (newer first)", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-01T00:05:00Z"),
      c(3, "2026-01-01T00:10:00Z"),
    ];
    const likes = new Map<number, number>([
      [1, 4],
      [2, 4],
      [3, 4],
    ]);
    const top = selectTopComments(comments, likes, 3);
    assert.deepEqual(top.map(x => x.id), [3, 2, 1]);
  });

  it("falls back to recency when no comment has likes", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
      c(3, "2026-01-03T00:00:00Z"),
    ];
    const likes = new Map<number, number>();
    const top = selectTopComments(comments, likes, 3);
    assert.deepEqual(top.map(x => x.id), [3, 2, 1]);
  });

  it("places the top-liked comment ahead of a newer unliked comment", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-05T00:00:00Z"),
    ];
    const likes = new Map<number, number>([[1, 1]]);
    const top = selectTopComments(comments, likes, 3);
    assert.deepEqual(top.map(x => x.id), [1, 2]);
  });

  it("respects the limit", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
      c(3, "2026-01-03T00:00:00Z"),
      c(4, "2026-01-04T00:00:00Z"),
      c(5, "2026-01-05T00:00:00Z"),
    ];
    const likes = new Map<number, number>([
      [1, 100],
      [3, 50],
    ]);
    const top = selectTopComments(comments, likes, 3);
    assert.equal(top.length, 3);
    assert.deepEqual(top.map(x => x.id), [1, 3, 5]);
  });

  it("does not mutate the input array", () => {
    const comments: C[] = [
      c(1, "2026-01-01T00:00:00Z"),
      c(2, "2026-01-02T00:00:00Z"),
    ];
    const original = comments.map(x => x.id);
    const likes = new Map<number, number>([[2, 1]]);
    selectTopComments(comments, likes, 3);
    assert.deepEqual(comments.map(x => x.id), original);
  });
});
