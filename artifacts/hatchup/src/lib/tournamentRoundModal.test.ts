import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  diffTournamentRound,
  type TournamentChallengeSnapshot,
} from "./tournamentRoundModal.ts";

const PLAYER_ID = 42;

function buildChallenge(
  overrides: Partial<TournamentChallengeSnapshot> = {},
): TournamentChallengeSnapshot {
  return {
    isElimination: true,
    currentRound: 1,
    rewardXp: 1000,
    rewardCoins: 500,
    leaderboard: [
      { playerId: PLAYER_ID, currentValue: 100, eliminated: false },
      { playerId: 2, currentValue: 80, eliminated: false, player: { displayName: "Alice" } },
      { playerId: 3, currentValue: 60, eliminated: false, player: { username: "bob" } },
      { playerId: 4, currentValue: 40, eliminated: true, eliminatedRound: 1 },
    ],
    ...overrides,
  };
}

describe("diffTournamentRound — initial render", () => {
  it("does NOT open the modal on first render (prev === null)", () => {
    const result = diffTournamentRound(buildChallenge(), PLAYER_ID, null);
    assert.equal(result.modal, null);
    // Snapshot is still recorded so the next diff has a baseline.
    assert.deepEqual(result.next, { round: 1, eliminated: false });
  });

  it("does not open the modal when player is missing from leaderboard", () => {
    const challenge = buildChallenge({
      leaderboard: [{ playerId: 999, eliminated: false }],
    });
    const result = diffTournamentRound(challenge, PLAYER_ID, null);
    assert.equal(result.modal, null);
    assert.equal(result.next, null);
  });

  it("does not open the modal for non-elimination challenges", () => {
    const challenge = buildChallenge({ isElimination: false });
    const result = diffTournamentRound(challenge, PLAYER_ID, {
      round: 1,
      eliminated: false,
    });
    assert.equal(result.modal, null);
    assert.equal(result.next, null);
  });

  it("does not open the modal when challenge or playerId is missing", () => {
    assert.equal(diffTournamentRound(null, PLAYER_ID, null).modal, null);
    assert.equal(diffTournamentRound(buildChallenge(), null, null).modal, null);
  });
});

describe("diffTournamentRound — advance path", () => {
  it("opens a 'Round N Survived!' modal with survivor count, next opponent, and boosted grand prize", () => {
    // Round just advanced from 1 → 2; player 4 was eliminated last cut.
    const challenge = buildChallenge({
      currentRound: 2,
      rewardXp: 1000,
      rewardCoins: 500,
      leaderboard: [
        { playerId: PLAYER_ID, currentValue: 100, eliminated: false },
        { playerId: 2, currentValue: 90, eliminated: false, player: { displayName: "Alice" } },
        { playerId: 3, currentValue: 70, eliminated: false, player: { username: "bob" } },
        { playerId: 4, currentValue: 40, eliminated: true, eliminatedRound: 1 },
      ],
    });
    const { modal, next } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 1,
      eliminated: false,
    });

    assert.ok(modal, "modal should be opened on a real round advance");
    assert.equal(modal.title, "Round 2 Survived!");

    const [advanced, nextOpp, prize] = modal.entries;
    // Advanced entry: survivor count = 3 (PLAYER_ID, 2, 3).
    assert.equal(advanced.kind, "challenge");
    assert.equal(advanced.label, "Advanced to round 2");
    assert.equal(advanced.value, "3 left");

    // Next to beat: strongest non-self survivor by currentValue → Alice (90).
    assert.equal(nextOpp.kind, "leaderboard");
    assert.equal(nextOpp.label, "Next to beat");
    assert.equal(nextOpp.value, "Alice");
    // 2 other survivors → "1 other survivor also in the hunt."
    assert.match(String(nextOpp.detail), /1 other survivor also in the hunt/);

    // Grand-prize line uses 2× base reward.
    assert.equal(prize.kind, "xp");
    assert.equal(prize.label, "Grand prize still in play");
    assert.match(String(prize.detail), /2,000 XP/);
    assert.match(String(prize.detail), /1,000 coins/);

    assert.deepEqual(next, { round: 2, eliminated: false });
  });

  it("falls back to the username when displayName is missing on the next opponent", () => {
    const challenge = buildChallenge({
      currentRound: 2,
      leaderboard: [
        { playerId: PLAYER_ID, currentValue: 100, eliminated: false },
        { playerId: 3, currentValue: 70, eliminated: false, player: { username: "bob" } },
      ],
    });
    const { modal } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 1,
      eliminated: false,
    });
    assert.ok(modal);
    const nextOpp = modal.entries[1];
    assert.equal(nextOpp.value, "bob");
    // Heads-up copy fires when only one rival remains.
    assert.match(String(nextOpp.detail), /coming down to the two of you/);
  });

  it("does NOT re-fire the advance modal when the round number is unchanged", () => {
    const challenge = buildChallenge({ currentRound: 2 });
    const { modal, next } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 2,
      eliminated: false,
    });
    assert.equal(modal, null);
    assert.deepEqual(next, { round: 2, eliminated: false });
  });
});

describe("diffTournamentRound — elimination path", () => {
  it("opens a 'Bracket Run Over' modal with the cut round and placement = survivors + 1", () => {
    // Player just got cut in round 2; 3 others survived → placement #4.
    const challenge = buildChallenge({
      currentRound: 2,
      leaderboard: [
        { playerId: PLAYER_ID, currentValue: 50, eliminated: true, eliminatedRound: 2 },
        { playerId: 2, currentValue: 90, eliminated: false },
        { playerId: 3, currentValue: 80, eliminated: false },
        { playerId: 5, currentValue: 70, eliminated: false },
      ],
    });
    const { modal, next } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 1,
      eliminated: false,
    });

    assert.ok(modal);
    assert.equal(modal.title, "Bracket Run Over");

    const [cut, payout] = modal.entries;
    assert.equal(cut.kind, "challenge");
    assert.equal(cut.label, "Eliminated in round 2");
    assert.equal(cut.value, "#4");

    // Outside top 3 → "No payout this run" copy.
    assert.equal(payout.kind, "leaderboard");
    assert.equal(payout.label, "No payout this run");
    assert.match(String(payout.detail), /Top 3 finishers split the prize/);

    assert.deepEqual(next, { round: 2, eliminated: true });
  });

  it("shows the top-3 'Final payout pending' copy when placement is ≤ 3", () => {
    // Player cut in round 3; 2 others survived → placement #3 (top-3).
    const challenge = buildChallenge({
      currentRound: 3,
      leaderboard: [
        { playerId: PLAYER_ID, currentValue: 50, eliminated: true, eliminatedRound: 3 },
        { playerId: 2, currentValue: 90, eliminated: false },
        { playerId: 3, currentValue: 80, eliminated: false },
      ],
    });
    const { modal } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 3,
      eliminated: false,
    });
    assert.ok(modal);
    const [cut, payout] = modal.entries;
    assert.equal(cut.value, "#3");
    assert.equal(payout.kind, "xp");
    assert.equal(payout.label, "Final payout pending");
    assert.match(String(payout.detail), /top 3 share the prize/);
  });

  it("does NOT re-fire the elimination modal once already marked eliminated", () => {
    const challenge = buildChallenge({
      currentRound: 2,
      leaderboard: [
        { playerId: PLAYER_ID, currentValue: 50, eliminated: true, eliminatedRound: 2 },
        { playerId: 2, currentValue: 90, eliminated: false },
      ],
    });
    const { modal } = diffTournamentRound(challenge, PLAYER_ID, {
      round: 2,
      eliminated: true,
    });
    assert.equal(modal, null);
  });
});
