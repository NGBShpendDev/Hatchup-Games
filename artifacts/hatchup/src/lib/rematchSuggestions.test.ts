import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rankHatchlingsForRematch, formatRecord } from "./rematchSuggestions.ts";

const H = (id: number, name = `H${id}`, level = 10) => ({ id, name, level });

describe("rankHatchlingsForRematch", () => {
  it("puts last-used hatchling first and marks it Recommended when nobody has enough win-rate history", () => {
    const battles = [
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-28T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-27T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-26T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1), H(2), H(3)], battles);
    assert.equal(ranked[0].hatchling.id, 2);
    assert.equal(ranked[0].isRecommended, true);
    assert.equal(ranked[0].reason, "last-used");
    assert.equal(ranked[1].hatchling.id, 1);
    assert.equal(ranked[1].reason, "most-wins");
    assert.equal(ranked[2].hatchling.id, 3);
  });

  it("falls back to most-wins recommendation when no last-used", () => {
    const battles = [
      { myHatchlingId: 5, outcome: "win", createdAt: "2026-05-27T12:00:00Z" },
      { myHatchlingId: 5, outcome: "win", createdAt: "2026-05-26T12:00:00Z" },
      { myHatchlingId: 6, outcome: "loss", createdAt: "2026-05-28T12:00:00Z" },
    ];
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

  it("computes wins, losses, and win rate once there are ≥3 decisive battles", () => {
    const battles = [
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-20T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-21T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-22T12:00:00Z" },
      { myHatchlingId: 1, outcome: "loss", createdAt: "2026-05-23T12:00:00Z" },
      { myHatchlingId: 1, outcome: "draw", createdAt: "2026-05-24T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1)], battles);
    assert.equal(ranked[0].wins, 3);
    assert.equal(ranked[0].losses, 1);
    assert.equal(ranked[0].draws, 1);
    assert.equal(ranked[0].hasWinRate, true);
    assert.equal(ranked[0].winRate, 0.75);
  });

  it("does not expose a win rate until there are ≥3 decisive battles", () => {
    const battles = [
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-20T12:00:00Z" },
      { myHatchlingId: 1, outcome: "loss", createdAt: "2026-05-21T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1)], battles);
    assert.equal(ranked[0].hasWinRate, false);
    assert.equal(ranked[0].winRate, null);
  });

  it("recommends best win rate over raw wins once history is long enough, even if rival was just played", () => {
    const battles = [
      // H1: 3W–1L (75%)
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-20T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-21T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-22T12:00:00Z" },
      { myHatchlingId: 1, outcome: "loss", createdAt: "2026-05-23T12:00:00Z" },
      // H2: 4W–6L (40%) but more total wins and most recent
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-10T12:00:00Z" },
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-11T12:00:00Z" },
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-12T12:00:00Z" },
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-13T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-14T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-15T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-16T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-17T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-18T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-28T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1), H(2)], battles);
    assert.equal(ranked[0].hatchling.id, 1);
    assert.equal(ranked[0].reason, "best-win-rate");
    assert.equal(ranked[0].isRecommended, true);
  });

  it("breaks win-rate ties by recency of last use", () => {
    const battles = [
      // Both 2W–1L (66.7%); H2 is more recent.
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-10T12:00:00Z" },
      { myHatchlingId: 1, outcome: "win", createdAt: "2026-05-11T12:00:00Z" },
      { myHatchlingId: 1, outcome: "loss", createdAt: "2026-05-12T12:00:00Z" },
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-20T12:00:00Z" },
      { myHatchlingId: 2, outcome: "win", createdAt: "2026-05-21T12:00:00Z" },
      { myHatchlingId: 2, outcome: "loss", createdAt: "2026-05-22T12:00:00Z" },
    ];
    const ranked = rankHatchlingsForRematch([H(1), H(2)], battles);
    assert.equal(ranked[0].hatchling.id, 2);
    assert.equal(ranked[0].reason, "best-win-rate");
  });
});

describe("formatRecord", () => {
  it("returns W–L with percentage when win rate is available", () => {
    assert.equal(
      formatRecord({ wins: 3, losses: 1, winRate: 0.75, hasWinRate: true }),
      "3W–1L · 75%",
    );
  });

  it("returns W–L without percentage when fewer than 3 decisive battles", () => {
    assert.equal(
      formatRecord({ wins: 1, losses: 1, winRate: null, hasWinRate: false }),
      "1W–1L",
    );
  });

  it("returns just W or L when only one side has results", () => {
    assert.equal(
      formatRecord({ wins: 2, losses: 0, winRate: null, hasWinRate: false }),
      "2W",
    );
    assert.equal(
      formatRecord({ wins: 0, losses: 2, winRate: null, hasWinRate: false }),
      "2L",
    );
  });

  it("returns empty string when no record", () => {
    assert.equal(
      formatRecord({ wins: 0, losses: 0, winRate: null, hasWinRate: false }),
      "",
    );
  });
});
