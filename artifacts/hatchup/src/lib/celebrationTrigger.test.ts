import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decideCelebration,
  championSeenKey,
  podiumSeenKey,
  type CelebrationChallenge,
} from "./celebrationTrigger.ts";

const PLAYER_ID = 42;
const CHALLENGE_ID = 7;
const OTHER_PLAYER_ID = 99;

function buildChallenge(overrides: Partial<CelebrationChallenge> = {}): CelebrationChallenge {
  return {
    status: "completed",
    isElimination: true,
    leaderboard: [
      { playerId: PLAYER_ID, rank: 1 },
      { playerId: OTHER_PLAYER_ID, rank: 2 },
    ],
    ...overrides,
  };
}

// Stand-in for localStorage: a Set we can pre-seed with "seen" keys and grow
// as the trigger logic dismisses the overlay. Mirrors the contract in
// challenge-detail.tsx (presence ⇒ already seen).
function makeStore(seeded: string[] = []) {
  const set = new Set<string>(seeded);
  return {
    has: (key: string) => set.has(key),
    add: (key: string) => set.add(key),
    raw: set,
  };
}

describe("decideCelebration — champion (rank 1)", () => {
  it("fires for rank 1 on first visit", () => {
    const store = makeStore();
    const decision = decideCelebration(
      buildChallenge(),
      PLAYER_ID,
      CHALLENGE_ID,
      store.has,
    );
    assert.deepEqual(decision, {
      kind: "champion",
      seenKey: championSeenKey(PLAYER_ID, CHALLENGE_ID),
    });
  });

  it("is suppressed on the second visit after the seen-key is persisted", () => {
    const challenge = buildChallenge();
    const store = makeStore();

    const first = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, store.has);
    assert.equal(first.kind, "champion");
    // Simulate the dismiss handler persisting the seen-key to localStorage.
    if (first.kind === "champion") store.add(first.seenKey);

    const second = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, store.has);
    assert.deepEqual(second, { kind: "none" });
  });

  it("is still suppressed for rank 1 even if the podium key happens to be set", () => {
    const store = makeStore([podiumSeenKey(PLAYER_ID, CHALLENGE_ID)]);
    const decision = decideCelebration(
      buildChallenge(),
      PLAYER_ID,
      CHALLENGE_ID,
      store.has,
    );
    // Podium key must NOT suppress champion — separate keys, separate gating.
    assert.equal(decision.kind, "champion");
  });
});

describe("decideCelebration — podium (rank 2 / rank 3)", () => {
  for (const rank of [2, 3] as const) {
    it(`fires for rank ${rank} on first visit`, () => {
      const store = makeStore();
      const challenge = buildChallenge({
        leaderboard: [{ playerId: PLAYER_ID, rank }],
      });
      const decision = decideCelebration(
        challenge,
        PLAYER_ID,
        CHALLENGE_ID,
        store.has,
      );
      assert.deepEqual(decision, {
        kind: "podium",
        rank,
        seenKey: podiumSeenKey(PLAYER_ID, CHALLENGE_ID),
      });
    });

    it(`is suppressed for rank ${rank} on the second visit`, () => {
      const challenge = buildChallenge({
        leaderboard: [{ playerId: PLAYER_ID, rank }],
      });
      const store = makeStore();

      const first = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, store.has);
      assert.equal(first.kind, "podium");
      if (first.kind === "podium") store.add(first.seenKey);

      const second = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, store.has);
      assert.deepEqual(second, { kind: "none" });
    });
  }

  it("is still suppressed for rank 2 even if the champion key happens to be set", () => {
    const store = makeStore([championSeenKey(PLAYER_ID, CHALLENGE_ID)]);
    const challenge = buildChallenge({
      leaderboard: [{ playerId: PLAYER_ID, rank: 2 }],
    });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, store.has);
    // Champion key must NOT suppress podium — separate keys, separate gating.
    assert.equal(decision.kind, "podium");
  });
});

describe("decideCelebration — no overlay cases", () => {
  it("does not fire for rank 4", () => {
    const challenge = buildChallenge({
      leaderboard: [{ playerId: PLAYER_ID, rank: 4 }],
    });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire for rank 10", () => {
    const challenge = buildChallenge({
      leaderboard: [{ playerId: PLAYER_ID, rank: 10 }],
    });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when the challenge isn't an elimination tournament", () => {
    const challenge = buildChallenge({ isElimination: false });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when isElimination is missing", () => {
    const challenge = buildChallenge({ isElimination: undefined });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when the challenge isn't completed", () => {
    const challenge = buildChallenge({ status: "active" });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when status is missing", () => {
    const challenge = buildChallenge({ status: undefined });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when the player isn't on the leaderboard", () => {
    const challenge = buildChallenge({
      leaderboard: [{ playerId: OTHER_PLAYER_ID, rank: 1 }],
    });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when the player's leaderboard entry has no rank", () => {
    const challenge = buildChallenge({
      leaderboard: [{ playerId: PLAYER_ID }],
    });
    const decision = decideCelebration(challenge, PLAYER_ID, CHALLENGE_ID, () => false);
    assert.deepEqual(decision, { kind: "none" });
  });

  it("does not fire when the challenge payload is null/undefined", () => {
    assert.deepEqual(
      decideCelebration(null, PLAYER_ID, CHALLENGE_ID, () => false),
      { kind: "none" },
    );
    assert.deepEqual(
      decideCelebration(undefined, PLAYER_ID, CHALLENGE_ID, () => false),
      { kind: "none" },
    );
  });

  it("does not fire when playerId is null/undefined", () => {
    assert.deepEqual(
      decideCelebration(buildChallenge(), null, CHALLENGE_ID, () => false),
      { kind: "none" },
    );
    assert.deepEqual(
      decideCelebration(buildChallenge(), undefined, CHALLENGE_ID, () => false),
      { kind: "none" },
    );
  });
});

describe("seen-key helpers", () => {
  it("scopes keys by player id and challenge id", () => {
    assert.equal(championSeenKey(1, 2), "champion-overlay-seen:1:2");
    assert.equal(podiumSeenKey(1, 2), "podium-overlay-seen:1:2");
    // Different players / challenges must not collide.
    assert.notEqual(championSeenKey(1, 2), championSeenKey(1, 3));
    assert.notEqual(championSeenKey(1, 2), championSeenKey(2, 2));
    assert.notEqual(championSeenKey(1, 2), podiumSeenKey(1, 2));
  });
});
