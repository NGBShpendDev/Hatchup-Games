import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  planEliminationRound,
  type BracketParticipant,
} from "./eliminationBracket.ts";

function p(id: number, currentValue: number): BracketParticipant {
  return { id, currentValue };
}

describe("planEliminationRound", () => {
  it("reduces 4 → 2 survivors, increments round, extends endAt by durationDays", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 3 },
      [p(1, 100), p(2, 80), p(3, 60), p(4, 40)],
      now,
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    assert.deepEqual(plan.survivorIds, [1, 2]);
    assert.deepEqual(plan.eliminatedIds, [3, 4]);
    assert.equal(plan.eliminatedRound, 1);
    assert.equal(plan.nextRound, 2);
    assert.equal(
      plan.nextEndAt.toISOString(),
      new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("reduces 2 → 1 champion (head-to-head drops the loser)", () => {
    const plan = planEliminationRound(
      { currentRound: 2, durationDays: 7 },
      [p(1, 50), p(2, 30)],
    );
    assert.equal(plan.kind, "champion");
    if (plan.kind !== "champion") return;
    assert.deepEqual(plan.survivorIds, [1]);
    assert.deepEqual(plan.eliminatedIds, [2]);
    assert.equal(plan.eliminatedRound, 2);
  });

  it("handles odd count 5 → keeps top 3", () => {
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 1 },
      [p(1, 100), p(2, 90), p(3, 80), p(4, 70), p(5, 60)],
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    assert.deepEqual(plan.survivorIds, [1, 2, 3]);
    assert.deepEqual(plan.eliminatedIds, [4, 5]);
    assert.equal(plan.nextRound, 2);
  });

  it("handles odd count 3 → keeps top 2", () => {
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 1 },
      [p(1, 30), p(2, 20), p(3, 10)],
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    assert.deepEqual(plan.survivorIds, [1, 2]);
    assert.deepEqual(plan.eliminatedIds, [3]);
  });

  it("full bracket walk 5 → 3 → 2 → 1", () => {
    const round1 = planEliminationRound(
      { currentRound: 1, durationDays: 1 },
      [p(1, 100), p(2, 90), p(3, 80), p(4, 70), p(5, 60)],
    );
    assert.equal(round1.kind, "advance");
    if (round1.kind !== "advance") return;
    assert.deepEqual(round1.survivorIds, [1, 2, 3]);
    assert.equal(round1.nextRound, 2);

    // Survivors get currentValue reset to 0 in the route layer; simulate
    // fresh round with new progress values.
    const round2 = planEliminationRound(
      { currentRound: round1.nextRound, durationDays: 1 },
      [p(1, 20), p(2, 50), p(3, 40)],
    );
    assert.equal(round2.kind, "advance");
    if (round2.kind !== "advance") return;
    assert.deepEqual(round2.survivorIds, [2, 3]);
    assert.deepEqual(round2.eliminatedIds, [1]);
    assert.equal(round2.eliminatedRound, 2);
    assert.equal(round2.nextRound, 3);

    const round3 = planEliminationRound(
      { currentRound: round2.nextRound, durationDays: 1 },
      [p(2, 10), p(3, 25)],
    );
    assert.equal(round3.kind, "champion");
    if (round3.kind !== "champion") return;
    assert.deepEqual(round3.survivorIds, [3]);
    assert.deepEqual(round3.eliminatedIds, [2]);
    assert.equal(round3.eliminatedRound, 3);
  });

  it("is a no-op with 1 active participant", () => {
    const plan = planEliminationRound(
      { currentRound: 5, durationDays: 1 },
      [p(7, 999)],
    );
    assert.equal(plan.kind, "noop");
  });

  it("is a no-op with 0 active participants", () => {
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 1 },
      [],
    );
    assert.equal(plan.kind, "noop");
  });

  it("sorts by currentValue regardless of input order", () => {
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 1 },
      [p(4, 40), p(1, 100), p(3, 60), p(2, 80)],
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    assert.deepEqual(plan.survivorIds, [1, 2]);
    assert.deepEqual(plan.eliminatedIds, [3, 4]);
  });

  it("records eliminatedRound as the challenge's currentRound at elimination time", () => {
    const plan = planEliminationRound(
      { currentRound: 7, durationDays: 2 },
      [p(1, 10), p(2, 5), p(3, 2), p(4, 1)],
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    assert.equal(plan.eliminatedRound, 7);
    assert.equal(plan.nextRound, 8);
  });

  it("extends endAt by durationDays from `now`", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const plan = planEliminationRound(
      { currentRound: 1, durationDays: 5 },
      [p(1, 10), p(2, 5), p(3, 1), p(4, 0)],
      now,
    );
    assert.equal(plan.kind, "advance");
    if (plan.kind !== "advance") return;
    const expected = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    assert.equal(plan.nextEndAt.toISOString(), expected.toISOString());
  });

  it("champion result does not include nextRound/nextEndAt (timer not extended)", () => {
    const plan = planEliminationRound(
      { currentRound: 3, durationDays: 7 },
      [p(1, 100), p(2, 50)],
    );
    assert.equal(plan.kind, "champion");
    assert.equal("nextRound" in plan, false);
    assert.equal("nextEndAt" in plan, false);
  });
});
