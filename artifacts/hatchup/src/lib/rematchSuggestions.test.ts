import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankHatchlingsForRematch } from "./rematchSuggestions.ts";

const H = (id: number, name = `H${id}`, level = 10) => ({ id, name, level });

describe("rankHatchlingsForRematch", () => {
  it("puts last-used hatchling first and marks it Recommended", () => {
    const battles = [
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-28T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-27T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-26T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1), H(2), H(3)], battles);
    assert.equal(ranked[0].hatchling.id, 2);
    assert.equal(ranked[0].isRecommended, true);
    assert.equal(ranked[0].reason, "last-used");
    // Hatchling 1 has most wins, should be next.
    assert.equal(ranked[1].hatchling.id, 1);
    assert.equal(ranked[1].reason, "most-wins");
    // Unused hatchling last.
    assert.equal(ranked[2].hatchling.id, 3);
  });

  it("falls back to most-wins recommendation when no last-used", () => {
    const battles = [
      { myHatchlingId: 5, outcome: "win", createdAt: "2026-05-27T12:00:00Z" },
      { myHatchlingId: 5, outcome: "win", createdAt: "2026-05-26T12:00:00Z" },
      { myHatchlingId: 6, outcome: "loss", createdAt: "2026-05-28T12:00:00Z" },
    ];
    // Hatchling 6 is the most recent; it should be recommended (last-used).
    const ranked = rankHatchlingsForRematch([H(5), H(6)], battles);
    assert.equal(ranked[0].hatchling.id, 6);
    assert.equal(ranked[0].isRecommended, true);
  });

  it("does not recommend anything when there is no history", () => {
    const ranked = rankHatchlingsForRematch([H(1), H(2)], []);
    assert.equal(ranked[0].isRecommended, false);
    assert.equal(ranked[1].isRecommended, false);
  });

  it("ignores battles with null myHatchlingId", () => {
    const battles = [
      { myHatchlingId: null, outcome: "win", createdAt: "2026-05-28T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1)], battles);
    assert.equal(ranked[0].isRecommended, false);
  });
});
