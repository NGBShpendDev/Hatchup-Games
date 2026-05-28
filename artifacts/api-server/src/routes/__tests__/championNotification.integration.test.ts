// Integration test for the tournament-champion notification flow inside
// `finalizeChallenge`. The pure ranking/reward logic is covered by
// `services/challengeRewards.test.ts`, and the broader finalize wiring is
// covered by `finalizeChallenge.integration.test.ts`. This file zeroes in
// on `notifyTournamentChampion`:
//
//   (a) it fires for the rank-1 player when an elimination tournament
//       finalizes,
//   (b) it does NOT fire for non-elimination challenges,
//   (c) the generic "Challenge complete!" push is suppressed for the
//       champion (so they don't get two pushes for the same event),
//   (d) the in-app notification row is inserted with type
//       "tournament_champion".
//
// We stub push + email so we can assert the call shapes precisely, and run
// against the shared dev Postgres for the in-app `notifications` insert.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── Capture push fan-out ──────────────────────────────────────────────────
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

// ── Capture email transport ───────────────────────────────────────────────
type CapturedEmail = { to: string; subject: string; html: string; text: string };
const capturedEmails: CapturedEmail[] = [];
let emailConfigured = true;

mock.module("../../services/emailService.ts", {
  namedExports: {
    isEmailConfigured() {
      return emailConfigured;
    },
    async sendTransactionalEmail(payload: CapturedEmail) {
      capturedEmails.push(payload);
    },
  },
});

const { db } = await import("@workspace/db");
const {
  challengesTable,
  challengeParticipantsTable,
  playersTable,
  playerBadgesTable,
  playerArtifactsTable,
  notificationsTable,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { finalizeChallenge } = await import("../../services/challengeFinalize.ts");

const TAG = `champ-notify-${process.pid}-${Date.now()}`;

const createdPlayerIds: number[] = [];
const createdChallengeIds: number[] = [];

async function seedPlayer(
  suffix: string,
  opts: { email?: string | null; notifyRecapEmail?: boolean } = {},
): Promise<number> {
  const [row] = await db.insert(playersTable).values({
    clerkId: `clerk_${TAG}_${suffix}`,
    username: `${TAG}_${suffix}`,
    displayName: `Test ${suffix}`,
    email: opts.email ?? null,
    notifyRecapEmail: opts.notifyRecapEmail ?? true,
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
  title?: string;
}): Promise<number> {
  const [row] = await db.insert(challengesTable).values({
    creatorId: input.creatorId,
    title: input.title ?? `Champ Tournament ${TAG}`,
    description: "champion-notification integration test",
    metric: "steps",
    targetValue: 10000,
    durationDays: 1,
    type: "public",
    status: "active",
    rewardXp: 100,
    rewardCoins: 50,
    requiresPublicMeetup: false,
    startAt: new Date(input.endAt.getTime() - 24 * 60 * 60 * 1000),
    endAt: input.endAt,
    maxParticipants: 100,
    isElimination: input.isElimination,
    currentRound: 1,
  }).returning();
  createdChallengeIds.push(row.id);
  return row.id;
}

async function seedParticipant(
  challengeId: number,
  playerId: number,
  currentValue: number,
): Promise<number> {
  const [row] = await db.insert(challengeParticipantsTable).values({
    challengeId,
    playerId,
    currentValue,
  }).returning();
  return row.id;
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

before(async () => {});
after(async () => { await cleanup(); });

beforeEach(() => {
  capturedPushes.length = 0;
  capturedEmails.length = 0;
  emailConfigured = true;
});

describe("notifyTournamentChampion (via finalizeChallenge)", () => {
  it("fires for the rank-1 player of an elimination tournament: inserts a 'tournament_champion' notification, sends a champion push, and suppresses the generic completion push for that player only", async () => {
    // Two non-eliminated players → finalize directly resolves a champion
    // without needing an extra round advance.
    const champion = await seedPlayer("champ", { email: null });
    const runnerUp = await seedPlayer("runner", { email: null });

    const past = new Date(Date.now() - 60 * 1000);
    const challengeId = await seedChallenge({
      creatorId: champion,
      isElimination: true,
      endAt: past,
      title: "Bracket Royale",
    });

    await seedParticipant(challengeId, champion, 100);
    await seedParticipant(challengeId, runnerUp, 50);

    await finalizeChallenge(challengeId);

    // (d) In-app notification row exists with type "tournament_champion",
    // is bound to the challenge, and belongs to the champion only.
    const champNotifs = await db.query.notificationsTable.findMany({
      where: inArray(notificationsTable.playerId, [champion, runnerUp]),
    });
    const tcRows = champNotifs.filter(n => n.type === "tournament_champion");
    assert.equal(tcRows.length, 1, "exactly one tournament_champion notification");
    assert.equal(tcRows[0].playerId, champion, "addressed to the rank-1 player");
    assert.equal(tcRows[0].sourceId, challengeId);
    assert.equal(tcRows[0].link, `/challenges/${challengeId}`);
    assert.ok(
      tcRows[0].title.includes("Bracket Royale"),
      "title mentions the challenge name",
    );

    // (a) Champion push fires for the rank-1 player with the dedicated
    // champion tag.
    const champPush = capturedPushes.find(
      p => p.tag === `tournament-champion-${challengeId}`,
    );
    assert.ok(champPush, "champion-specific push was sent");
    assert.equal(champPush!.playerId, champion);
    assert.equal(champPush!.category, "completed");

    // (c) Generic "Challenge complete!" fan-out fires for the runner-up
    // but NOT for the champion (avoids double-notifying them).
    const completionPushes = capturedPushes.filter(
      p => p.tag === `challenge-complete-${challengeId}`,
    );
    assert.equal(
      completionPushes.length, 1,
      "exactly one generic completion push for the non-champion participant",
    );
    assert.equal(completionPushes[0].playerId, runnerUp);
    assert.ok(
      !completionPushes.some(p => p.playerId === champion),
      "champion is excluded from the generic completion push fan-out",
    );
  });

  it("does NOT fire for non-elimination challenges, even though there is a rank-1 finisher", async () => {
    const winner = await seedPlayer("nelim-w", { email: null });
    const second = await seedPlayer("nelim-2", { email: null });
    const third  = await seedPlayer("nelim-3", { email: null });

    const past = new Date(Date.now() - 60 * 1000);
    const challengeId = await seedChallenge({
      creatorId: winner,
      isElimination: false,
      endAt: past,
      title: "Open Steps",
    });

    await seedParticipant(challengeId, winner, 300);
    await seedParticipant(challengeId, second, 200);
    await seedParticipant(challengeId, third, 100);

    await finalizeChallenge(challengeId);

    // (b) No "tournament_champion" notification row anywhere.
    const notifs = await db.query.notificationsTable.findMany({
      where: inArray(notificationsTable.playerId, [winner, second, third]),
    });
    assert.equal(
      notifs.filter(n => n.type === "tournament_champion").length,
      0,
      "no tournament_champion notification for non-elimination challenges",
    );

    // No champion-specific push.
    const champPush = capturedPushes.find(
      p => p.tag === `tournament-champion-${challengeId}`,
    );
    assert.equal(champPush, undefined, "no champion-specific push fired");

    // Generic completion push fans out to every participant (no champion
    // suppression in non-elimination mode).
    const completionPushes = capturedPushes.filter(
      p => p.tag === `challenge-complete-${challengeId}`,
    );
    assert.equal(completionPushes.length, 3);
    const ids = new Set(completionPushes.map(p => p.playerId));
    assert.ok(ids.has(winner) && ids.has(second) && ids.has(third));

    // And no champion email either.
    assert.equal(capturedEmails.length, 0);
  });

  it("sends a champion congratulations email when the player has email on file and notifyRecapEmail=true", async () => {
    const champion = await seedPlayer("email-w", {
      email: `${TAG}-w@example.test`,
      notifyRecapEmail: true,
    });
    const runnerUp = await seedPlayer("email-r", { email: null });

    const past = new Date(Date.now() - 60 * 1000);
    const challengeId = await seedChallenge({
      creatorId: champion,
      isElimination: true,
      endAt: past,
      title: "Email Cup",
    });
    await seedParticipant(challengeId, champion, 100);
    await seedParticipant(challengeId, runnerUp, 25);

    await finalizeChallenge(challengeId);

    // Allow the fire-and-forget email step to settle.
    await new Promise(r => setTimeout(r, 50));

    assert.equal(capturedEmails.length, 1, "champion email sent");
    assert.equal(capturedEmails[0].to, `${TAG}-w@example.test`);
    assert.ok(capturedEmails[0].subject.includes("Email Cup"));
  });

  it("suppresses the champion email when notifyRecapEmail=false or email provider is unconfigured", async () => {
    // notifyRecapEmail=false → no email even though provider is configured.
    const champ1 = await seedPlayer("optout-w", {
      email: `${TAG}-optout@example.test`,
      notifyRecapEmail: false,
    });
    const runner1 = await seedPlayer("optout-r", { email: null });
    const past1 = new Date(Date.now() - 60 * 1000);
    const challenge1 = await seedChallenge({
      creatorId: champ1,
      isElimination: true,
      endAt: past1,
      title: "Opt-Out Cup",
    });
    await seedParticipant(challenge1, champ1, 100);
    await seedParticipant(challenge1, runner1, 25);

    await finalizeChallenge(challenge1);
    await new Promise(r => setTimeout(r, 50));

    assert.equal(
      capturedEmails.length, 0,
      "no email when notifyRecapEmail is false",
    );

    // But the in-app notification + push still fire — only email is gated.
    const champPush = capturedPushes.find(
      p => p.tag === `tournament-champion-${challenge1}`,
    );
    assert.ok(champPush, "champion push still fires when email is opted out");

    // Now flip the provider off and try a fresh challenge with opt-in
    // email — still no email.
    emailConfigured = false;
    const champ2 = await seedPlayer("noprov-w", {
      email: `${TAG}-noprov@example.test`,
      notifyRecapEmail: true,
    });
    const runner2 = await seedPlayer("noprov-r", { email: null });
    const past2 = new Date(Date.now() - 60 * 1000);
    const challenge2 = await seedChallenge({
      creatorId: champ2,
      isElimination: true,
      endAt: past2,
      title: "Unwired Cup",
    });
    await seedParticipant(challenge2, champ2, 100);
    await seedParticipant(challenge2, runner2, 25);

    await finalizeChallenge(challenge2);
    await new Promise(r => setTimeout(r, 50));

    assert.equal(
      capturedEmails.length, 0,
      "no email when transport is not configured",
    );
  });
});
