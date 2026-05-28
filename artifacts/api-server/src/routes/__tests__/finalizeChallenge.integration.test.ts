// Integration test for `finalizeChallenge` — the elimination tournament
// finalize flow.
//
// The pure rule logic (ranking, payouts, champion boost) is already covered
// by `services/challengeRewards.test.ts` with an in-memory store. This test
// targets the route-level wiring on top of a real Postgres instance:
//
//   elimination round advance → reward distribute → completion push fan-out
//                              → endingSoonPushSentAt reset
//
// It seeds an active elimination tournament, advances time past `endAt`,
// invokes `finalizeChallenge` directly, and asserts the resulting database
// state (ranks, XP/coin balances, champion badge, Crown of the Bracket
// artifact, status transition) plus the captured push fan-out.
//
// `sendPushToPlayer` is the only external side effect we mock — everything
// else runs against the real DB via the shared `@workspace/db` pool.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Capture push fan-out without touching VAPID / web-push ────────────────
type CapturedPush = {
  playerId: number;
  title: string;
  body: string;
  link?: string;
  category: string;
  tag?: string;
};
const capturedPushes: CapturedPush[] = [];

mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    async sendPushToPlayer(playerId: number, payload: Omit<CapturedPush, "playerId">) {
      capturedPushes.push({ ...payload, playerId });
    },
    async initPushNotifications() {},
  },
});

// Champion email path is exercised by other tests; keep this integration test
// focused on the finalize wiring by stubbing out the email transport.
mock.module("../../services/emailService.ts", {
  namedExports: {
    isEmailConfigured() {
      return false;
    },
    async sendTransactionalEmail() {},
  },
});

// Imports must come AFTER mock.module so the mocked specifier is wired in.
const { db } = await import("@workspace/db");
const {
  challengesTable,
  challengeParticipantsTable,
  playersTable,
  playerBadgesTable,
  artifactsTable,
  playerArtifactsTable,
  notificationsTable,
} = await import("@workspace/db");
const { eq, and, inArray } = await import("drizzle-orm");
const { finalizeChallenge } = await import("../../services/challengeFinalize.ts");

// ── Test data tagging for isolation ───────────────────────────────────────
// We share the dev Postgres instance, so every row this test creates is
// tagged with a unique username/clerkId prefix and we clean up by player id
// before and after the suite (cascades to challenges + participants we
// inserted via the explicit creator/playerId FK references we control).
const TAG = `finalize-int-${process.pid}-${Date.now()}`;

const createdPlayerIds: number[] = [];
const createdChallengeIds: number[] = [];

async function seedPlayer(suffix: string): Promise<number> {
  const [row] = await db.insert(playersTable).values({
    clerkId: `clerk_${TAG}_${suffix}`,
    username: `${TAG}_${suffix}`,
    displayName: `Test ${suffix}`,
    xp: 0,
    coins: 0,
  }).returning();
  createdPlayerIds.push(row.id);
  return row.id;
}

async function seedChallenge(input: {
  creatorId: number;
  isElimination: boolean;
  endAt: Date;
  currentRound?: number;
  rewardXp?: number;
  rewardCoins?: number;
  title?: string;
}): Promise<number> {
  const [row] = await db.insert(challengesTable).values({
    creatorId: input.creatorId,
    title: input.title ?? `Tournament ${TAG}`,
    description: "integration test",
    metric: "steps",
    targetValue: 10000,
    durationDays: 1,
    type: "public",
    status: "active",
    rewardXp: input.rewardXp ?? 100,
    rewardCoins: input.rewardCoins ?? 50,
    requiresPublicMeetup: false,
    startAt: new Date(input.endAt.getTime() - 24 * 60 * 60 * 1000),
    endAt: input.endAt,
    maxParticipants: 100,
    isElimination: input.isElimination,
    currentRound: input.currentRound ?? 1,
  }).returning();
  createdChallengeIds.push(row.id);
  return row.id;
}

async function seedParticipant(
  challengeId: number,
  playerId: number,
  currentValue: number,
  opts: { endingSoonPushSentAt?: Date } = {},
): Promise<number> {
  const [row] = await db.insert(challengeParticipantsTable).values({
    challengeId,
    playerId,
    currentValue,
    endingSoonPushSentAt: opts.endingSoonPushSentAt ?? null,
  }).returning();
  return row.id;
}

async function expireChallenge(challengeId: number, when: Date): Promise<void> {
  await db.update(challengesTable)
    .set({ endAt: when })
    .where(eq(challengesTable.id, challengeId));
}

async function cleanup() {
  if (createdChallengeIds.length > 0) {
    await db.delete(challengeParticipantsTable)
      .where(inArray(challengeParticipantsTable.challengeId, createdChallengeIds));
    await db.delete(challengesTable)
      .where(inArray(challengesTable.id, createdChallengeIds));
  }
  if (createdPlayerIds.length > 0) {
    await db.delete(notificationsTable)
      .where(inArray(notificationsTable.playerId, createdPlayerIds));
    await db.delete(playerBadgesTable)
      .where(inArray(playerBadgesTable.playerId, createdPlayerIds));
    await db.delete(playerArtifactsTable)
      .where(inArray(playerArtifactsTable.playerId, createdPlayerIds));
    await db.delete(playersTable)
      .where(inArray(playersTable.id, createdPlayerIds));
  }
  createdPlayerIds.length = 0;
  createdChallengeIds.length = 0;
}

before(async () => {
  // Nothing to do — DB is provisioned via DATABASE_URL.
});

after(async () => {
  await cleanup();
});

beforeEach(() => {
  capturedPushes.length = 0;
});

// ── Scenario 1: elimination tournament finalize ───────────────────────────
// 4 players, single round of elimination → bottom 2 dropped, 2 survive →
// advance. Second finalize on the new round → 2 → 1 → champion → reward
// distribution kicks in.
describe("finalizeChallenge — elimination tournament", () => {
  it("advances rounds, then crowns the champion with rewards, badge, artifact, push fan-out, and status=completed", async () => {
    const p1 = await seedPlayer("e1");
    const p2 = await seedPlayer("e2");
    const p3 = await seedPlayer("e3");
    const p4 = await seedPlayer("e4");

    const past = new Date(Date.now() - 60 * 60 * 1000);
    const challengeId = await seedChallenge({
      creatorId: p1,
      isElimination: true,
      endAt: past,
      rewardXp: 100,
      rewardCoins: 50,
    });

    // currentValue ordering: p1 (100) > p2 (80) > p3 (40) > p4 (10).
    // p3 and p4 will be eliminated in round 1; p1 and p2 advance.
    // Pre-set endingSoonPushSentAt on the survivors so we can assert it gets
    // cleared when the new round starts.
    const sentAt = new Date(past.getTime() - 60 * 60 * 1000);
    const part1 = await seedParticipant(challengeId, p1, 100, { endingSoonPushSentAt: sentAt });
    const part2 = await seedParticipant(challengeId, p2, 80, { endingSoonPushSentAt: sentAt });
    const part3 = await seedParticipant(challengeId, p3, 40);
    const part4 = await seedParticipant(challengeId, p4, 10);

    // ── First finalize: should advance to round 2, not complete. ──────────
    await finalizeChallenge(challengeId);

    const afterRound1 = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, challengeId),
    });
    assert.equal(afterRound1?.status, "active", "still active after one advance");
    assert.equal(afterRound1?.currentRound, 2, "advanced to round 2");
    assert.ok(afterRound1 && afterRound1.endAt.getTime() > Date.now(), "endAt extended into the future");

    const parts = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
    });
    const partMap = new Map(parts.map(p => [p.id, p]));

    assert.equal(partMap.get(part3)!.eliminated, true, "p3 eliminated in round 1");
    assert.equal(partMap.get(part3)!.eliminatedRound, 1);
    assert.equal(partMap.get(part4)!.eliminated, true, "p4 eliminated in round 1");
    assert.equal(partMap.get(part4)!.eliminatedRound, 1);
    assert.equal(partMap.get(part1)!.eliminated, false, "p1 advances");
    assert.equal(partMap.get(part2)!.eliminated, false, "p2 advances");

    // Survivors' currentValue reset to 0 for the new round.
    assert.equal(partMap.get(part1)!.currentValue, 0);
    assert.equal(partMap.get(part2)!.currentValue, 0);

    // endingSoonPushSentAt should be reset for survivors (so they can get a
    // fresh "ending soon" push for round 2) and untouched for the eliminated.
    assert.equal(partMap.get(part1)!.endingSoonPushSentAt, null, "p1 ending-soon flag cleared");
    assert.equal(partMap.get(part2)!.endingSoonPushSentAt, null, "p2 ending-soon flag cleared");

    // Round-1 should have sent advance/elim in-app notifications.
    const round1Notifs = await db.query.notificationsTable.findMany({
      where: inArray(notificationsTable.playerId, [p1, p2, p3, p4]),
    });
    const advancedTypes = round1Notifs.filter(n => n.type === "tournament_advanced");
    const eliminatedTypes = round1Notifs.filter(n => n.type === "tournament_eliminated");
    assert.equal(advancedTypes.length, 2, "two survivors notified of advance");
    assert.equal(eliminatedTypes.length, 2, "two losers notified of elimination");

    // No "challenge complete" / champion push should have fired yet — only
    // the per-round advance/eliminated fan-outs (which now also use the
    // `completed` category since they share the outcome opt-in).
    assert.equal(
      capturedPushes.filter(p => p.tag?.startsWith("challenge-complete-")).length,
      0,
    );
    assert.equal(
      capturedPushes.filter(p => p.tag?.startsWith("tournament-champion-")).length,
      0,
    );
    assert.equal(
      capturedPushes.filter(p => p.tag?.startsWith("tournament-advanced-")).length,
      2,
      "two advance pushes fired for round-1 survivors",
    );
    assert.equal(
      capturedPushes.filter(p => p.tag?.startsWith("tournament-eliminated-")).length,
      2,
      "two elimination pushes fired for round-1 losers",
    );

    // Now seed currentValue for the new round to give p1 the win, then
    // expire the round.
    await db.update(challengeParticipantsTable)
      .set({ currentValue: 50 })
      .where(eq(challengeParticipantsTable.id, part1));
    await db.update(challengeParticipantsTable)
      .set({ currentValue: 25 })
      .where(eq(challengeParticipantsTable.id, part2));
    await expireChallenge(challengeId, new Date(Date.now() - 60 * 1000));

    // ── Second finalize: 2 active → 1 survivor → champion → distribute. ───
    await finalizeChallenge(challengeId);

    const afterFinal = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, challengeId),
    });
    assert.equal(afterFinal?.status, "completed", "challenge marked completed");
    assert.ok(afterFinal?.completedPushSentAt, "completedPushSentAt stamped");

    // Champion (p1) should have rank=1, runner-up (p2) rank=2 (assigned by
    // distributeChallengeRewards based on remaining non-eliminated rows).
    // p2 was eliminated in the second round and therefore should NOT be in
    // the ranked active set; p1 is the sole survivor.
    const finalParts = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
    });
    const finalMap = new Map(finalParts.map(p => [p.id, p]));
    assert.equal(finalMap.get(part1)!.rank, 1, "champion ranked 1");
    assert.equal(finalMap.get(part1)!.eliminated, false);
    assert.equal(finalMap.get(part2)!.eliminated, true, "p2 eliminated in round 2");
    assert.equal(finalMap.get(part2)!.eliminatedRound, 2);

    // XP/coin balances: champion gets the elimination 2× boost on rank-1
    // payout: 100*2 = 200 xp, 50*2 = 100 coins.
    // PLUS the TOURNAMENT_CHAMPION badge reward (1500 xp / 750 coins).
    const championPlayer = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, p1),
    });
    assert.equal(championPlayer?.xp, 200 + 1500, "champion XP = reward + badge bonus");
    assert.equal(championPlayer?.coins, 100 + 750, "champion coins = reward + badge bonus");

    // Eliminated players received no payout.
    const loser = await db.query.playersTable.findFirst({ where: eq(playersTable.id, p4) });
    assert.equal(loser?.xp, 0);
    assert.equal(loser?.coins, 0);

    // Tournament Champion badge awarded.
    const champBadge = await db.query.playerBadgesTable.findFirst({
      where: eq(playerBadgesTable.playerId, p1),
    });
    assert.ok(champBadge, "champion badge row exists");
    assert.equal(champBadge!.badgeKey, "TOURNAMENT_CHAMPION");

    // Crown of the Bracket artifact granted to the champion — minted as a
    // per-tournament catalog row keyed on the challenge id so each champion
    // collects a distinct crown over time.
    const crown = await db.query.artifactsTable.findFirst({
      where: eq(artifactsTable.imageSlug, `crown_of_the_bracket__c${challengeId}`),
    });
    assert.ok(crown, "per-tournament crown artifact catalog row exists");
    assert.match(crown!.name, /^Crown of the Bracket — /, "crown name reflects the tournament");
    assert.ok(crown!.name.includes(`Tournament ${TAG}`), "crown name embeds the tournament title");
    assert.match(crown!.lore, /Forged when .* crowned its champion/, "lore reflects the tournament");
    const ownership = await db.query.playerArtifactsTable.findFirst({
      where: eq(playerArtifactsTable.playerId, p1),
    });
    assert.ok(ownership, "champion owns the per-tournament Crown of the Bracket");
    assert.equal(ownership!.artifactId, crown!.id);

    // Completion push fan-out: one `challenge-complete-*` push per non-champion
    // participant + one `tournament-champion-*` for the winner.
    const completePushes = capturedPushes.filter(p => p.tag?.startsWith("challenge-complete-"));
    const championPushes = capturedPushes.filter(p => p.tag?.startsWith("tournament-champion-"));
    assert.equal(completePushes.length, 3, "challenge-complete push fired for the 3 non-champions");
    assert.equal(championPushes.length, 1, "champion push fired exactly once");
    const completedPlayerIds = new Set([
      ...completePushes.map(p => p.playerId),
      ...championPushes.map(p => p.playerId),
    ]);
    assert.deepEqual(
      [...completedPlayerIds].sort((a, b) => a - b),
      [p1, p2, p3, p4].sort((a, b) => a - b),
    );
  });
});

// ── Scenario 1b: two tournaments sharing the same title + season ──────────
// Regression guard: per-tournament crowns must be keyed on the challenge id,
// not the display name. If two distinct elimination tournaments happen to
// share an identical title (and thus generate the same season label),
// both champions still need to receive a distinct crown row.
describe("finalizeChallenge — repeat title/season crown collisions", () => {
  it("mints a distinct crown per challenge even when the title and season match", async () => {
    const champA = await seedPlayer("dup-a");
    const champB = await seedPlayer("dup-b");

    const past = new Date(Date.now() - 60 * 60 * 1000);
    const sharedTitle = `Repeat Cup ${TAG}`;

    const chA = await seedChallenge({
      creatorId: champA,
      isElimination: true,
      endAt: past,
      title: sharedTitle,
    });
    const chB = await seedChallenge({
      creatorId: champB,
      isElimination: true,
      endAt: past,
      title: sharedTitle,
    });

    await seedParticipant(chA, champA, 100);
    await seedParticipant(chB, champB, 100);

    await finalizeChallenge(chA);
    await finalizeChallenge(chB);

    const crownA = await db.query.artifactsTable.findFirst({
      where: eq(artifactsTable.imageSlug, `crown_of_the_bracket__c${chA}`),
    });
    const crownB = await db.query.artifactsTable.findFirst({
      where: eq(artifactsTable.imageSlug, `crown_of_the_bracket__c${chB}`),
    });
    assert.ok(crownA, "champion A got their own crown row");
    assert.ok(crownB, "champion B got their own crown row");
    assert.notEqual(crownA!.id, crownB!.id, "crown rows are distinct catalog entries");

    const ownedA = await db.query.playerArtifactsTable.findFirst({
      where: and(
        eq(playerArtifactsTable.playerId, champA),
        eq(playerArtifactsTable.artifactId, crownA!.id),
      ),
    });
    const ownedB = await db.query.playerArtifactsTable.findFirst({
      where: and(
        eq(playerArtifactsTable.playerId, champB),
        eq(playerArtifactsTable.artifactId, crownB!.id),
      ),
    });
    assert.ok(ownedA, "champion A owns their crown");
    assert.ok(ownedB, "champion B owns their crown");
  });
});

// ── Scenario 2: non-elimination challenge finalize ────────────────────────
describe("finalizeChallenge — non-elimination challenge", () => {
  it("ranks top 3 by progress, pays standard rewards, fires completion pushes, and skips champion side effects", async () => {
    const a = await seedPlayer("n1");
    const b = await seedPlayer("n2");
    const c = await seedPlayer("n3");
    const d = await seedPlayer("n4");

    const past = new Date(Date.now() - 60 * 1000);
    const challengeId = await seedChallenge({
      creatorId: a,
      isElimination: false,
      endAt: past,
      rewardXp: 100,
      rewardCoins: 50,
    });

    const pa = await seedParticipant(challengeId, a, 30);
    const pb = await seedParticipant(challengeId, b, 90);
    const pc = await seedParticipant(challengeId, c, 60);
    const pd = await seedParticipant(challengeId, d, 10);

    await finalizeChallenge(challengeId);

    const challenge = await db.query.challengesTable.findFirst({
      where: eq(challengesTable.id, challengeId),
    });
    assert.equal(challenge?.status, "completed");
    assert.ok(challenge?.completedPushSentAt);

    // Rankings: b (90) → 1, c (60) → 2, a (30) → 3, d (10) → 4.
    const parts = await db.query.challengeParticipantsTable.findMany({
      where: eq(challengeParticipantsTable.challengeId, challengeId),
    });
    const m = new Map(parts.map(p => [p.id, p]));
    assert.equal(m.get(pb)!.rank, 1);
    assert.equal(m.get(pc)!.rank, 2);
    assert.equal(m.get(pa)!.rank, 3);
    assert.equal(m.get(pd)!.rank, 4);

    // No elimination side effects.
    for (const part of parts) {
      assert.equal(part.eliminated, false);
      assert.equal(part.eliminatedRound, null);
    }

    // Payouts: 1st = 100/50, 2nd = 60/30, 3rd = 30/15, 4th = 0/0.
    const players = await db.query.playersTable.findMany({
      where: inArray(playersTable.id, [a, b, c, d]),
    });
    const pm = new Map(players.map(p => [p.id, p]));
    assert.equal(pm.get(b)!.xp, 100); assert.equal(pm.get(b)!.coins, 50);
    assert.equal(pm.get(c)!.xp, 60);  assert.equal(pm.get(c)!.coins, 30);
    assert.equal(pm.get(a)!.xp, 30);  assert.equal(pm.get(a)!.coins, 15);
    assert.equal(pm.get(d)!.xp, 0);   assert.equal(pm.get(d)!.coins, 0);

    // No champion badge / artifact in non-elimination mode.
    const champBadges = await db.query.playerBadgesTable.findMany({
      where: inArray(playerBadgesTable.playerId, [a, b, c, d]),
    });
    assert.equal(
      champBadges.filter(x => x.badgeKey === "TOURNAMENT_CHAMPION").length,
      0,
      "no champion badge awarded for non-elimination challenge",
    );
    const ownedArtifacts = await db.query.playerArtifactsTable.findMany({
      where: inArray(playerArtifactsTable.playerId, [a, b, c, d]),
    });
    assert.equal(ownedArtifacts.length, 0, "no champion artifact granted");

    // Completion push fan-out: one per participant.
    const completed = capturedPushes.filter(p => p.category === "completed");
    assert.equal(completed.length, 4);
    const ids = new Set(completed.map(p => p.playerId));
    assert.deepEqual(
      [...ids].sort((x, y) => x - y),
      [a, b, c, d].sort((x, y) => x - y),
    );
  });
});
