import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceEliminationRound,
  planEliminationRound,
  type BracketParticipant,
  type EliminationStore,
  type StoredChallenge,
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

// ── advanceEliminationRound (store-backed orchestration) ───────────────────
type FakeParticipant = {
  id: number;
  currentValue: number;
  eliminated: boolean;
  eliminatedRound: number | null;
};

function makeStore(
  initial: StoredChallenge,
  participants: FakeParticipant[],
): {
  store: EliminationStore;
  state: { challenge: StoredChallenge & { endAt?: Date }; participants: FakeParticipant[] };
} {
  const state = {
    challenge: { ...initial },
    participants: participants.map(p => ({ ...p })),
  };
  const store: EliminationStore = {
    async getChallenge() {
      return { ...state.challenge };
    },
    async getActiveParticipants() {
      return state.participants
        .filter(p => !p.eliminated)
        .map(p => ({ id: p.id, currentValue: p.currentValue }));
    },
    async markEliminated(ids, eliminatedRound) {
      for (const p of state.participants) {
        if (ids.includes(p.id)) {
          p.eliminated = true;
          p.eliminatedRound = eliminatedRound;
        }
      }
    },
    async resetSurvivorProgress(ids) {
      for (const p of state.participants) {
        if (ids.includes(p.id)) p.currentValue = 0;
      }
    },
    async updateChallengeRound(_id, nextRound, nextEndAt) {
      state.challenge.currentRound = nextRound;
      (state.challenge as { endAt?: Date }).endAt = nextEndAt;
    },
  };
  return { store, state };
}

describe("advanceEliminationRound", () => {
  it("4 → 2 survivors: increments round, extends endAt, resets survivor progress", async () => {
    const now = new Date("2026-03-01T00:00:00Z");
    const { store, state } = makeStore(
      { id: 42, isElimination: true, currentRound: 1, durationDays: 3, status: "active" },
      [
        { id: 1, currentValue: 100, eliminated: false, eliminatedRound: null },
        { id: 2, currentValue: 80, eliminated: false, eliminatedRound: null },
        { id: 3, currentValue: 60, eliminated: false, eliminatedRound: null },
        { id: 4, currentValue: 40, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await advanceEliminationRound(store, 42, now);

    assert.equal(outcome.kind, "advance");
    if (outcome.kind !== "advance") return;
    assert.deepEqual(outcome.survivorParticipantIds, [1, 2]);
    assert.deepEqual(outcome.eliminatedParticipantIds, [3, 4]);
    assert.equal(outcome.eliminatedRound, 1);
    assert.equal(outcome.nextRound, 2);
    assert.equal(state.challenge.currentRound, 2);
    assert.equal(
      state.challenge.endAt?.toISOString(),
      new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    );

    const byId = new Map(state.participants.map(p => [p.id, p]));
    assert.equal(byId.get(1)!.eliminated, false);
    assert.equal(byId.get(1)!.currentValue, 0);
    assert.equal(byId.get(2)!.eliminated, false);
    assert.equal(byId.get(2)!.currentValue, 0);
    assert.equal(byId.get(3)!.eliminated, true);
    assert.equal(byId.get(3)!.eliminatedRound, 1);
    assert.equal(byId.get(3)!.currentValue, 60);
    assert.equal(byId.get(4)!.eliminated, true);
    assert.equal(byId.get(4)!.eliminatedRound, 1);
  });

  it("2 → 1: finalizes instead of advancing (returns false, no timer extension)", async () => {
    const { store, state } = makeStore(
      { id: 7, isElimination: true, currentRound: 3, durationDays: 7, status: "active" },
      [
        { id: 10, currentValue: 200, eliminated: false, eliminatedRound: null },
        { id: 11, currentValue: 50, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await advanceEliminationRound(store, 7);

    assert.equal(outcome.kind, "champion");
    if (outcome.kind !== "champion") return;
    assert.deepEqual(outcome.eliminatedParticipantIds, [11]);
    assert.equal(outcome.eliminatedRound, 3);
    // Round must NOT be incremented and endAt must NOT be extended.
    assert.equal(state.challenge.currentRound, 3);
    assert.equal(state.challenge.endAt, undefined);
    // Loser eliminated, champion's progress preserved (not reset).
    const byId = new Map(state.participants.map(p => [p.id, p]));
    assert.equal(byId.get(10)!.eliminated, false);
    assert.equal(byId.get(10)!.currentValue, 200);
    assert.equal(byId.get(11)!.eliminated, true);
    assert.equal(byId.get(11)!.eliminatedRound, 3);
  });

  it("odd count 5 → 3 survivors with round increment and timer extension", async () => {
    const now = new Date("2026-04-10T12:00:00Z");
    const { store, state } = makeStore(
      { id: 5, isElimination: true, currentRound: 2, durationDays: 1, status: "active" },
      [
        { id: 1, currentValue: 100, eliminated: false, eliminatedRound: null },
        { id: 2, currentValue: 90, eliminated: false, eliminatedRound: null },
        { id: 3, currentValue: 80, eliminated: false, eliminatedRound: null },
        { id: 4, currentValue: 70, eliminated: false, eliminatedRound: null },
        { id: 5, currentValue: 60, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await advanceEliminationRound(store, 5, now);

    assert.equal(outcome.kind, "advance");
    if (outcome.kind !== "advance") return;
    assert.deepEqual(outcome.survivorParticipantIds, [1, 2, 3]);
    assert.deepEqual(outcome.eliminatedParticipantIds, [4, 5]);
    assert.equal(outcome.nextRound, 3);
    assert.equal(state.challenge.currentRound, 3);
    assert.equal(
      state.challenge.endAt?.toISOString(),
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );

    const survivors = state.participants.filter(p => !p.eliminated);
    assert.equal(survivors.length, 3);
    assert.deepEqual(survivors.map(p => p.id).sort((a, b) => a - b), [1, 2, 3]);
    // Survivor progress was reset.
    for (const s of survivors) assert.equal(s.currentValue, 0);
    // Eliminated entries kept their stale values (used for ranking later).
    const elim = state.participants.filter(p => p.eliminated);
    assert.deepEqual(elim.map(p => p.id).sort((a, b) => a - b), [4, 5]);
    for (const e of elim) assert.equal(e.eliminatedRound, 2);
  });

  it("no-op for already-completed tournaments (does not touch state)", async () => {
    const { store, state } = makeStore(
      { id: 9, isElimination: true, currentRound: 4, durationDays: 2, status: "completed" },
      [
        { id: 1, currentValue: 500, eliminated: false, eliminatedRound: null },
        { id: 2, currentValue: 0, eliminated: true, eliminatedRound: 3 },
      ],
    );

    const outcome = await advanceEliminationRound(store, 9);

    assert.equal(outcome.kind, "noop");
    assert.equal(state.challenge.currentRound, 4);
    assert.equal(state.challenge.endAt, undefined);
    const byId = new Map(state.participants.map(p => [p.id, p]));
    assert.equal(byId.get(1)!.currentValue, 500);
    assert.equal(byId.get(1)!.eliminated, false);
    assert.equal(byId.get(2)!.eliminated, true);
    assert.equal(byId.get(2)!.eliminatedRound, 3);
  });

  it("no-op when only one active participant remains (bracket already collapsed)", async () => {
    const { store, state } = makeStore(
      { id: 11, isElimination: true, currentRound: 5, durationDays: 1, status: "active" },
      [
        { id: 1, currentValue: 999, eliminated: false, eliminatedRound: null },
        { id: 2, currentValue: 0, eliminated: true, eliminatedRound: 4 },
      ],
    );

    const outcome = await advanceEliminationRound(store, 11);

    assert.equal(outcome.kind, "noop");
    assert.equal(state.challenge.currentRound, 5);
    assert.equal(state.challenge.endAt, undefined);
  });

  it("returns noop for non-elimination challenges", async () => {
    const { store, state } = makeStore(
      { id: 1, isElimination: false, currentRound: 1, durationDays: 3, status: "active" },
      [
        { id: 1, currentValue: 100, eliminated: false, eliminatedRound: null },
        { id: 2, currentValue: 80, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await advanceEliminationRound(store, 1);

    assert.equal(outcome.kind, "noop");
    assert.equal(state.challenge.currentRound, 1);
  });

  it("returns noop when the challenge does not exist", async () => {
    const store: EliminationStore = {
      async getChallenge() { return null; },
      async getActiveParticipants() { return []; },
      async markEliminated() { throw new Error("should not be called"); },
      async resetSurvivorProgress() { throw new Error("should not be called"); },
      async updateChallengeRound() { throw new Error("should not be called"); },
    };
    const outcome = await advanceEliminationRound(store, 404);
    assert.equal(outcome.kind, "noop");
  });
});
