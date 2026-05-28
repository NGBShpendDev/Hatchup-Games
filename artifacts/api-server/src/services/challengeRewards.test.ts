import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeChallengeReward,
  distributeChallengeRewards,
  type RewardChallenge,
  type RewardParticipant,
  type RewardStore,
} from "./challengeRewards.ts";

describe("computeChallengeReward", () => {
  it("pays 1st place the full base reward for a normal challenge", () => {
    const r = computeChallengeReward(1, 100, 50, false);
    assert.deepEqual(r, { xp: 100, coins: 50, isChampion: false });
  });

  it("pays 2nd place 60% for a normal challenge", () => {
    const r = computeChallengeReward(2, 100, 50, false);
    assert.deepEqual(r, { xp: 60, coins: 30, isChampion: false });
  });

  it("pays 3rd place 30% for a normal challenge", () => {
    const r = computeChallengeReward(3, 100, 50, false);
    assert.deepEqual(r, { xp: 30, coins: 15, isChampion: false });
  });

  it("doubles 1st place payout for elimination tournament champion", () => {
    const r = computeChallengeReward(1, 100, 50, true);
    assert.deepEqual(r, { xp: 200, coins: 100, isChampion: true });
  });

  it("does not boost runner-up payouts in elimination tournaments", () => {
    const second = computeChallengeReward(2, 100, 50, true);
    const third = computeChallengeReward(3, 100, 50, true);
    assert.deepEqual(second, { xp: 60, coins: 30, isChampion: false });
    assert.deepEqual(third, { xp: 30, coins: 15, isChampion: false });
  });

  it("returns zero rewards for ranks outside the top 3", () => {
    assert.deepEqual(computeChallengeReward(4, 100, 50, false), { xp: 0, coins: 0, isChampion: false });
    assert.deepEqual(computeChallengeReward(0, 100, 50, true), { xp: 0, coins: 0, isChampion: false });
  });

  it("floors fractional reward amounts", () => {
    const r = computeChallengeReward(2, 99, 33, false);
    assert.deepEqual(r, { xp: 59, coins: 19, isChampion: false });
  });
});

// ── distributeChallengeRewards (store-backed orchestration) ───────────────
type FakeState = {
  challenge: RewardChallenge;
  participants: RewardParticipant[];
  ranksSet: Array<{ participantId: number; rank: number }>;
  grants: Array<{ playerId: number; xp: number; coins: number }>;
  champions: number[];
  markCompletedCalls: number;
};

function makeRewardStore(
  initial: RewardChallenge,
  participants: RewardParticipant[],
): { store: RewardStore; state: FakeState } {
  const state: FakeState = {
    challenge: { ...initial },
    participants: participants.map(p => ({ ...p })),
    ranksSet: [],
    grants: [],
    champions: [],
    markCompletedCalls: 0,
  };
  const store: RewardStore = {
    async getChallenge() {
      return { ...state.challenge };
    },
    async getParticipants() {
      return state.participants.map(p => ({ ...p }));
    },
    async setParticipantRank(participantId, rank) {
      state.ranksSet.push({ participantId, rank });
      const p = state.participants.find(x => x.id === participantId);
      if (p) (p as RewardParticipant & { rank?: number }).rank = rank;
    },
    async grantPlayerReward(playerId, xp, coins) {
      state.grants.push({ playerId, xp, coins });
    },
    async awardChampion(playerId, _challengeId) {
      state.champions.push(playerId);
    },
    async markCompleted() {
      state.markCompletedCalls += 1;
      state.challenge.status = "completed";
    },
  };
  return { store, state };
}

const PAST = new Date("2026-01-10T00:00:00Z");
const NOW = new Date("2026-01-20T00:00:00Z");
const FUTURE = new Date("2026-02-01T00:00:00Z");

describe("distributeChallengeRewards", () => {
  it("ranks top 3 by currentValue desc (non-elimination) and pays only top 3", async () => {
    const { store, state } = makeRewardStore(
      { id: 1, status: "active", endAt: PAST, isElimination: false, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 11, playerId: 110, currentValue: 30, eliminated: false, eliminatedRound: null },
        { id: 12, playerId: 120, currentValue: 90, eliminated: false, eliminatedRound: null },
        { id: 13, playerId: 130, currentValue: 60, eliminated: false, eliminatedRound: null },
        { id: 14, playerId: 140, currentValue: 10, eliminated: false, eliminatedRound: null },
        { id: 15, playerId: 150, currentValue: 5, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 1, NOW);

    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;

    // Verify rank assignment order (1st = highest currentValue)
    assert.deepEqual(
      outcome.rankings.map(r => ({ id: r.participantId, rank: r.rank })),
      [
        { id: 12, rank: 1 },
        { id: 13, rank: 2 },
        { id: 11, rank: 3 },
        { id: 14, rank: 4 },
        { id: 15, rank: 5 },
      ],
    );

    // Every participant gets a rank persisted.
    assert.deepEqual(state.ranksSet, [
      { participantId: 12, rank: 1 },
      { participantId: 13, rank: 2 },
      { participantId: 11, rank: 3 },
      { participantId: 14, rank: 4 },
      { participantId: 15, rank: 5 },
    ]);

    // Rewards: 1st=100/50, 2nd=60/30, 3rd=30/15. Ranks 4+ get nothing.
    assert.deepEqual(state.grants, [
      { playerId: 120, xp: 100, coins: 50 },
      { playerId: 130, xp: 60, coins: 30 },
      { playerId: 110, xp: 30, coins: 15 },
    ]);

    // No champion in non-elimination mode.
    assert.deepEqual(state.champions, []);

    // Status transition runs exactly once.
    assert.equal(state.markCompletedCalls, 1);
    assert.equal(state.challenge.status, "completed");
  });

  it("does not pay or champion-award participants ranked 4+ (elimination, multi-survivor)", async () => {
    const { store, state } = makeRewardStore(
      { id: 2, status: "active", endAt: PAST, isElimination: false, rewardXp: 200, rewardCoins: 100 },
      [
        { id: 1, playerId: 10, currentValue: 50, eliminated: false, eliminatedRound: null },
        { id: 2, playerId: 20, currentValue: 40, eliminated: false, eliminatedRound: null },
        { id: 3, playerId: 30, currentValue: 30, eliminated: false, eliminatedRound: null },
        { id: 4, playerId: 40, currentValue: 20, eliminated: false, eliminatedRound: null },
        { id: 5, playerId: 50, currentValue: 10, eliminated: false, eliminatedRound: null },
      ],
    );

    await distributeChallengeRewards(store, 2, NOW);

    // Ranks 4 and 5 received NO grant entries.
    const paidPlayers = state.grants.map(g => g.playerId);
    assert.deepEqual(paidPlayers, [10, 20, 30]);
    assert.equal(state.grants.length, 3);
  });

  it("promotes the sole elimination survivor to rank 1 over eliminated rivals with higher stale values", async () => {
    const { store, state } = makeRewardStore(
      { id: 3, status: "active", endAt: PAST, isElimination: true, rewardXp: 100, rewardCoins: 50 },
      [
        // Eliminated rivals kept their stale (higher) currentValues from
        // earlier rounds — they MUST NOT outrank the survivor.
        { id: 1, playerId: 10, currentValue: 500, eliminated: true, eliminatedRound: 1 },
        { id: 2, playerId: 20, currentValue: 300, eliminated: true, eliminatedRound: 2 },
        { id: 3, playerId: 30, currentValue: 50, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 3, NOW);

    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;

    // Survivor wins 1st; later-eliminated rival takes 2nd; earlier
    // elimination = 3rd. Stale `currentValue` doesn't promote a loser.
    assert.deepEqual(
      outcome.rankings.map(r => ({ id: r.participantId, rank: r.rank })),
      [
        { id: 3, rank: 1 },
        { id: 2, rank: 2 },
        { id: 1, rank: 3 },
      ],
    );
    assert.deepEqual(state.ranksSet, [
      { participantId: 3, rank: 1 },
      { participantId: 2, rank: 2 },
      { participantId: 1, rank: 3 },
    ]);

    // Survivor gets champion-tier 2× boost: 200 xp / 100 coins. Eliminated
    // runners-up still get the normal 2nd/3rd payout (no boost, no badge).
    assert.deepEqual(state.grants, [
      { playerId: 30, xp: 200, coins: 100 },
      { playerId: 20, xp: 60, coins: 30 },
      { playerId: 10, xp: 30, coins: 15 },
    ]);
    assert.deepEqual(state.champions, [30]);
    assert.equal(state.markCompletedCalls, 1);
  });

  it("awards champion badge + 2× XP/coin boost only on rank 1 in elimination mode", async () => {
    // Edge case: elimination bracket resolves with multiple non-eliminated
    // players. Only rank 1 gets the champion treatment; runners-up get the
    // normal scaled payout with no champion boost or badge.
    const { store, state } = makeRewardStore(
      { id: 4, status: "active", endAt: PAST, isElimination: true, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 1, playerId: 10, currentValue: 80, eliminated: false, eliminatedRound: null },
        { id: 2, playerId: 20, currentValue: 60, eliminated: false, eliminatedRound: null },
        { id: 3, playerId: 30, currentValue: 40, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 4, NOW);

    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;

    // Rank 1: 100 * 2 = 200 xp, 50 * 2 = 100 coins, isChampion=true
    // Rank 2: 100 * 0.6 = 60 xp, 50 * 0.6 = 30 coins, isChampion=false
    // Rank 3: 100 * 0.3 = 30 xp, 50 * 0.3 = 15 coins, isChampion=false
    assert.deepEqual(state.grants, [
      { playerId: 10, xp: 200, coins: 100 },
      { playerId: 20, xp: 60, coins: 30 },
      { playerId: 30, xp: 30, coins: 15 },
    ]);

    // Champion badge/artifact fires exactly once for rank 1.
    assert.deepEqual(state.champions, [10]);
  });

  it("is a no-op when the challenge is already completed (does not re-rank or re-pay)", async () => {
    const { store, state } = makeRewardStore(
      { id: 5, status: "completed", endAt: PAST, isElimination: false, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 1, playerId: 10, currentValue: 100, eliminated: false, eliminatedRound: null },
        { id: 2, playerId: 20, currentValue: 50, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 5, NOW);

    assert.equal(outcome.kind, "noop");
    if (outcome.kind !== "noop") return;
    assert.equal(outcome.reason, "not_active");
    assert.deepEqual(state.ranksSet, []);
    assert.deepEqual(state.grants, []);
    assert.deepEqual(state.champions, []);
    assert.equal(state.markCompletedCalls, 0);
  });

  it("is a no-op when endAt is still in the future", async () => {
    const { store, state } = makeRewardStore(
      { id: 6, status: "active", endAt: FUTURE, isElimination: false, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 1, playerId: 10, currentValue: 100, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 6, NOW);

    assert.equal(outcome.kind, "noop");
    if (outcome.kind !== "noop") return;
    assert.equal(outcome.reason, "not_ended");
    assert.deepEqual(state.grants, []);
    assert.equal(state.markCompletedCalls, 0);
    assert.equal(state.challenge.status, "active");
  });

  it("is a no-op when the challenge does not exist", async () => {
    const store: RewardStore = {
      async getChallenge() { return null; },
      async getParticipants() { throw new Error("should not be called"); },
      async setParticipantRank() { throw new Error("should not be called"); },
      async grantPlayerReward() { throw new Error("should not be called"); },
      async awardChampion() { throw new Error("should not be called"); },
      async markCompleted() { throw new Error("should not be called"); },
    };
    const outcome = await distributeChallengeRewards(store, 999, NOW);
    assert.equal(outcome.kind, "noop");
    if (outcome.kind !== "noop") return;
    assert.equal(outcome.reason, "not_found");
  });

  it("transitions status to completed exactly once and never crowns an eliminated rank-1 player", async () => {
    // Defensive edge case: a bracket somehow finalizes with zero survivors.
    // The lone eliminated row should still get a rank + normal 1st-place
    // payout, but MUST NOT receive the champion badge or 2× boost.
    const { store, state } = makeRewardStore(
      { id: 7, status: "active", endAt: PAST, isElimination: true, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 1, playerId: 10, currentValue: 500, eliminated: true, eliminatedRound: 1 },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 7, NOW);

    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;
    assert.deepEqual(outcome.rankings.map(r => ({ id: r.participantId, rank: r.rank })), [
      { id: 1, rank: 1 },
    ]);
    assert.equal(outcome.rankings[0].grant.isChampion, false);
    assert.deepEqual(state.grants, [{ playerId: 10, xp: 100, coins: 50 }]);
    assert.deepEqual(state.champions, []);
    assert.equal(state.markCompletedCalls, 1);
    assert.equal(state.challenge.status, "completed");
  });

  it("breaks currentValue ties by input order (stable sort) and pays accordingly", async () => {
    const { store, state } = makeRewardStore(
      { id: 8, status: "active", endAt: PAST, isElimination: false, rewardXp: 100, rewardCoins: 50 },
      [
        { id: 1, playerId: 10, currentValue: 50, eliminated: false, eliminatedRound: null },
        { id: 2, playerId: 20, currentValue: 50, eliminated: false, eliminatedRound: null },
        { id: 3, playerId: 30, currentValue: 50, eliminated: false, eliminatedRound: null },
        { id: 4, playerId: 40, currentValue: 50, eliminated: false, eliminatedRound: null },
      ],
    );

    const outcome = await distributeChallengeRewards(store, 8, NOW);
    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;
    assert.deepEqual(outcome.rankings.map(r => r.participantId), [1, 2, 3, 4]);
    // Top 3 paid in stable input order.
    assert.deepEqual(state.grants, [
      { playerId: 10, xp: 100, coins: 50 },
      { playerId: 20, xp: 60, coins: 30 },
      { playerId: 30, xp: 30, coins: 15 },
    ]);
  });
});
