import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeChallengeReward } from "./challengeRewards.ts";

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
