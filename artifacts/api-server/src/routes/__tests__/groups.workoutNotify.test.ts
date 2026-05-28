// Channel-matrix tests for the group-workout notification fan-out in `routes/groups.ts`.
//
// POST /groups/:id/workout fans out three distinct notification types:
//
//   group_workout             → all members EXCEPT the actor who logged the workout
//   group_challenge_completed → ALL members when an active challenge finishes
//   group_raid_defeated       → ALL members when the raid boss HP reaches zero
//
// For each type we verify:
//   - inbox / push / email can each be toggled off independently.
//   - All-channels-off suppresses every side effect for that player.
//   - The actor is excluded from workout notifications but included in
//     challenge-completion and raid-defeat notifications.
//   - Multiple recipients each use their own per-player channel settings.
//
// Push-count isolation note: the assertChannelMatrix helper counts ALL pushes
// to a given player ID (the spy has no type dimension). To keep exactly one
// push per fire() call we use ACTOR_ID as the matrix recipient for
// group_challenge_completed and group_raid_defeated — the actor is filtered
// out of the workout fan-out so only the one target event contributes.
// For group_workout we use MEMBER_A with no active challenges/raids.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-workout-notify-secret-12345";

// ── Types ────────────────────────────────────────────────────────────────────

interface Channels { inbox: boolean; push: boolean; email: boolean }

interface InboxInsert {
  playerId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  sourceId?: number;
}

interface PushCall { playerId: number; title: string; body: string; category: string }
interface EmailCall { playerId: number; title: string; body: string }

// ── Constants ────────────────────────────────────────────────────────────────

const GROUP_ID = 99;
const ACTOR_ID = 1;
const MEMBER_A  = 2;
const MEMBER_B  = 3;

// ── Shared test state ────────────────────────────────────────────────────────

const state = {
  channelsByPlayerType: new Map<string, Channels>(),
  inboxInserts: [] as InboxInsert[],
  pushCalls:    [] as PushCall[],
  emailCalls:   [] as EmailCall[],
  authPlayerId: ACTOR_ID as number,
  // DB scenario controls (set per test)
  activeChallenges: [] as any[],
  activeRaid:       null as any,
};

function chKey(playerId: number, type: string) { return `${playerId}:${type}`; }

function setChannels(playerId: number, type: string, ch: Channels) {
  state.channelsByPlayerType.set(chKey(playerId, type), ch);
}

function resetState() {
  state.channelsByPlayerType = new Map();
  state.inboxInserts = [];
  state.pushCalls    = [];
  state.emailCalls   = [];
  state.authPlayerId = ACTOR_ID;
  state.activeChallenges = [];
  state.activeRaid       = null;
}

function resetSideEffects() {
  state.inboxInserts = [];
  state.pushCalls    = [];
  state.emailCalls   = [];
}

// ── Mocks: auth + middlewares ────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: "u_actor" }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth:     () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (req: { playerId?: number | null }, _res: unknown, next: () => void) => {
      req.playerId = state.authPlayerId;
      next();
    },
  },
});

mock.module("../../middlewares/minorGuard.ts", {
  namedExports: { blockMinorSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next() },
});

mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: { blockSuspendedSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next() },
});

mock.module("../../middlewares/rateLimiters.ts", {
  namedExports: {
    socialWriteLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
    postViewLimiter:    (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// ── Mocks: services ──────────────────────────────────────────────────────────

mock.module("../../services/fitnessLog.ts", {
  namedExports: {
    logFitnessActivity: async () => ({ fitnessXpEarned: 0, activity: null, updatedPlayer: null }),
  },
});

mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => [],
    filterDiscoverableCandidates: async (_v: unknown, rows: any[]) => rows,
  },
});

mock.module("../../services/mentions.ts", {
  namedExports: { resolveMentionedPlayers: async () => [] },
});

mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    sendPushToPlayer: async (playerId: number, payload: { title: string; body: string; category: string }) => {
      state.pushCalls.push({ playerId, title: payload.title, body: payload.body, category: payload.category });
    },
  },
});

mock.module("../../services/socialEmail.ts", {
  namedExports: {
    sendSocialEmail: async (playerId: number, payload: { title: string; body: string }) => {
      state.emailCalls.push({ playerId, title: payload.title, body: payload.body });
    },
  },
});

// The batch channel resolver is mocked to return per-(player, type) overrides
// or a sensible default; it works for ANY notification type including the new
// group_workout / group_challenge_completed / group_raid_defeated types.
mock.module("../../services/socialNotifyPrefs.ts", {
  namedExports: {
    socialChannelsForType: async (playerId: number, type: string): Promise<Channels | null> => {
      return state.channelsByPlayerType.get(chKey(playerId, type)) ?? { inbox: true, push: true, email: false };
    },
    socialChannelsForPlayers: async (playerIds: number[], type: string): Promise<Map<number, Channels>> => {
      const map = new Map<number, Channels>();
      for (const pid of playerIds) {
        map.set(pid, state.channelsByPlayerType.get(chKey(pid, type)) ?? { inbox: true, push: true, email: false });
      }
      return map;
    },
    isSocialNotificationAllowed: async () => true,
    socialPrefBaseForType: () => null,
    SOCIAL_NOTIFY_PREF_KEYS: [],
  },
});

const stubSchema = { safeParse: (data: unknown) => ({ success: true, data }) };
mock.module("@workspace/api-zod", {
  namedExports: {
    CreateGroupBody:       stubSchema,
    JoinGroupBody:         stubSchema,
    LogGroupWorkoutBody:   stubSchema,
    SendGroupMessageBody:  stubSchema,
    GetGroupParams:        stubSchema,
    ListMyGroupsQueryParams: stubSchema,
  },
});

// ── drizzle predicate stubs ──────────────────────────────────────────────────

mock.module("drizzle-orm", {
  namedExports: {
    eq:        () => ({}),
    and:       () => ({}),
    or:        () => ({}),
    ne:        () => ({}),
    desc:      () => ({}),
    gt:        () => ({}),
    gte:       () => ({}),
    lt:        () => ({}),
    inArray:   () => ({}),
    notInArray: () => ({}),
    ilike:     () => ({}),
    isNull:    () => ({}),
    isNotNull: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: (t: unknown) => t },
});

// ── Table sentinels ──────────────────────────────────────────────────────────

const notificationsTable       = { __t: "notificationsTable" };
const playersTable             = { __t: "playersTable" };
const groupsTable              = { __t: "groupsTable" };
const groupMembersTable        = { __t: "groupMembersTable" };
const groupChallengesTable     = { __t: "groupChallengesTable" };
const groupRaidsTable          = { __t: "groupRaidsTable" };
const groupMessagesTable       = { __t: "groupMessagesTable" };
const groupNotificationMutesTable = { __t: "groupNotificationMutesTable", groupId: {}, playerId: {} };

// ── Static fixtures ──────────────────────────────────────────────────────────

const BASE_GROUP = {
  id: GROUP_ID, name: "Test Squad", teamEnergy: 0, totalTeamEnergy: 0,
  maxMembers: 10, creatorPlayerId: ACTOR_ID, inviteCode: "TTTTT1",
  type: "fitness_party", createdAt: new Date("2026-01-01"),
};

const GROUP_MEMBERS = [
  { id: 1, groupId: GROUP_ID, playerId: ACTOR_ID, coWorkoutCount: 0, friendshipLevel: 1, lastWorkoutTogether: null, joinedAt: new Date("2026-01-01") },
  { id: 2, groupId: GROUP_ID, playerId: MEMBER_A,  coWorkoutCount: 0, friendshipLevel: 1, lastWorkoutTogether: null, joinedAt: new Date("2026-01-01") },
  { id: 3, groupId: GROUP_ID, playerId: MEMBER_B,  coWorkoutCount: 0, friendshipLevel: 1, lastWorkoutTogether: null, joinedAt: new Date("2026-01-01") },
];

const PLAYERS: Record<number, any> = {
  [ACTOR_ID]: { id: ACTOR_ID, clerkId: "u_actor",    displayName: "Actor",   username: "actor"   },
  [MEMBER_A]:  { id: MEMBER_A,  clerkId: "u_member_a", displayName: "MemberA", username: "member_a" },
  [MEMBER_B]:  { id: MEMBER_B,  clerkId: "u_member_b", displayName: "MemberB", username: "member_b" },
};

// ── Fake DB ──────────────────────────────────────────────────────────────────

const fakeDb = {
  query: new Proxy({}, {
    get: (_t, name: string) => {
      if (name === "groupMembersTable") {
        return {
          // checkMembership: actor is always a member
          findFirst: async () => GROUP_MEMBERS.find(m => m.playerId === ACTOR_ID),
          findMany:  async () => GROUP_MEMBERS,
        };
      }
      if (name === "groupsTable") {
        return { findFirst: async () => ({ ...BASE_GROUP }) };
      }
      if (name === "playersTable") {
        return {
          findFirst: async () => PLAYERS[ACTOR_ID],
          findMany:  async () => Object.values(PLAYERS),
        };
      }
      if (name === "groupChallengesTable") {
        return { findMany: async () => [...state.activeChallenges] };
      }
      if (name === "groupRaidsTable") {
        return { findFirst: async () => state.activeRaid ? { ...state.activeRaid } : undefined };
      }
      if (name === "groupNotificationMutesTable") {
        return { findFirst: async () => null };
      }
      return { findFirst: async () => undefined, findMany: async () => [] };
    },
  }),

  insert: (table: unknown) => ({
    values: (vals: any) => {
      if (table === notificationsTable) {
        state.inboxInserts.push({
          playerId: vals.playerId,
          type:     vals.type,
          title:    vals.title,
          body:     vals.body   ?? null,
          link:     vals.link   ?? null,
          sourceId: vals.sourceId,
        });
        return {
          returning: async () => [{ id: state.inboxInserts.length }],
          onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }),
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
      }
      if (table === groupMessagesTable) {
        return {
          returning: async () => [{ id: 1, groupId: GROUP_ID, playerId: ACTOR_ID, playerName: "Actor", content: "", isFiltered: false, createdAt: new Date("2026-01-01") }],
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
      }
      return {
        returning: async () => [{ id: 1 }],
        onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }),
        then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
      };
    },
  }),

  // update().set().where() — supports plain await AND .returning()
  update: (table: unknown) => ({
    set: (setValues: any) => ({
      where: () => ({
        returning: async () => {
          if (table === groupChallengesTable) {
            const base = state.activeChallenges[0] ?? {};
            return [{ id: 1, groupId: GROUP_ID, title: "Steps Challenge", description: null, targetValue: 50, currentValue: 0, rewardType: null, rewardAmount: null, isCompleted: false, createdAt: new Date("2026-01-01"), expiresAt: new Date("2026-12-31"), ...base, ...setValues }];
          }
          if (table === groupRaidsTable && state.activeRaid) {
            return [{ ...state.activeRaid, ...setValues }];
          }
          return [{}];
        },
        then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
      }),
    }),
  }),

  delete: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }),

  // select().from() chain — mute-check returns empty (no mutes)
  select: () => ({
    from: () => {
      const chain: any = {
        where:   () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit:   () => chain,
        then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
      };
      return chain;
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    notificationsTable,
    playersTable,
    groupsTable,
    groupMembersTable,
    groupChallengesTable,
    groupRaidsTable,
    groupMessagesTable,
    groupNotificationMutesTable,
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable:   { id: {}, scope: {}, key: {}, createdAt: {} },
  },
});

// ── Server harness ───────────────────────────────────────────────────────────

const express     = (await import("express")).default;
const groupsRouter = (await import("../groups.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(groupsRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function postWorkout(steps: number) {
  const res = await fetch(`${baseUrl}/groups/${GROUP_ID}/workout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: ACTOR_ID, steps }),
  });
  let parsed: unknown = null;
  try { parsed = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: parsed };
}

function inboxCount(type: string, recipientId: number) {
  return state.inboxInserts.filter(i => i.type === type && i.playerId === recipientId).length;
}
function pushCount(recipientId: number) {
  return state.pushCalls.filter(p => p.playerId === recipientId).length;
}
function emailCount(recipientId: number) {
  return state.emailCalls.filter(e => e.playerId === recipientId).length;
}

// Scenario helpers
function setupCompletableChallenge() {
  // targetValue=50, currentValue=0. advanceChallenges(steps=200) → 200 >= 50 → completed.
  state.activeChallenges = [{
    id: 10, groupId: GROUP_ID, title: "Steps Challenge", description: null,
    targetValue: 50, currentValue: 0, rewardType: null, rewardAmount: null,
    isCompleted: false, createdAt: new Date("2026-01-01"), expiresAt: new Date("2026-12-31"),
  }];
}

function setupDefeatableRaid() {
  // bossHp=50, currentDamage=0. damage=Math.round(200*0.5)=100 >= 50 → defeated.
  state.activeRaid = {
    id: 20, groupId: GROUP_ID, bossName: "Test Boss", bossHp: 50, currentDamage: 0,
    status: "active", createdAt: new Date("2026-01-01"), unlockedAt: new Date("2026-01-01"),
  };
}

// ── Channel-matrix helper ────────────────────────────────────────────────────
//
// Calls fire() five times with different per-channel combinations and asserts
// that each channel is independently gated.
//
// IMPORTANT: fire() must NOT call resetState() — channel overrides are set
// here before each fire() call and must survive into the handler. The caller
// is responsible for ensuring the DB scenario is already set up before calling
// assertChannelMatrix (since resetSideEffects() is called between fires but
// NOT resetState()).
//
// recipientId must be a player for whom exactly ONE push should arrive per
// fire() (no other notification types should also push to this player):
//   - group_workout           → use MEMBER_A (not actor, no challenge/raid)
//   - group_challenge_completed / group_raid_defeated → use ACTOR_ID (actor
//     excluded from workout fan-out, so only the target event contributes)
async function assertChannelMatrix(
  type: string,
  recipientId: number,
  fire: () => Promise<void>,
) {
  // 1. All ON → all three side effects fire.
  setChannels(recipientId, type, { inbox: true, push: true, email: true });
  await fire();
  assert.equal(inboxCount(type, recipientId), 1, `${type}: all-on → inbox`);
  assert.equal(pushCount(recipientId),         1, `${type}: all-on → push`);
  assert.equal(emailCount(recipientId),        1, `${type}: all-on → email`);
  resetSideEffects();

  // 2. Inbox OFF → push + email still fire.
  setChannels(recipientId, type, { inbox: false, push: true, email: true });
  await fire();
  assert.equal(inboxCount(type, recipientId), 0, `${type}: inbox OFF → no inbox`);
  assert.equal(pushCount(recipientId),         1, `${type}: inbox OFF → push still fires`);
  assert.equal(emailCount(recipientId),        1, `${type}: inbox OFF → email still fires`);
  resetSideEffects();

  // 3. Push OFF → inbox + email still fire.
  setChannels(recipientId, type, { inbox: true, push: false, email: true });
  await fire();
  assert.equal(inboxCount(type, recipientId), 1, `${type}: push OFF → inbox still fires`);
  assert.equal(pushCount(recipientId),         0, `${type}: push OFF → no push`);
  assert.equal(emailCount(recipientId),        1, `${type}: push OFF → email still fires`);
  resetSideEffects();

  // 4. Email OFF → inbox + push still fire.
  setChannels(recipientId, type, { inbox: true, push: true, email: false });
  await fire();
  assert.equal(inboxCount(type, recipientId), 1, `${type}: email OFF → inbox still fires`);
  assert.equal(pushCount(recipientId),         1, `${type}: email OFF → push still fires`);
  assert.equal(emailCount(recipientId),        0, `${type}: email OFF → no email`);
  resetSideEffects();

  // 5. All OFF → zero side effects.
  setChannels(recipientId, type, { inbox: false, push: false, email: false });
  await fire();
  assert.equal(inboxCount(type, recipientId), 0, `${type}: all-off → no inbox`);
  assert.equal(pushCount(recipientId),         0, `${type}: all-off → no push`);
  assert.equal(emailCount(recipientId),        0, `${type}: all-off → no email`);
}

// ── Tests: group_workout ──────────────────────────────────────────────────────

describe("POST /groups/:id/workout — group_workout fan-out", () => {
  it("notifies all non-actor members with default channels (inbox+push, no email)", async () => {
    const { status } = await postWorkout(30);
    assert.equal(status, 200);

    assert.equal(inboxCount("group_workout", MEMBER_A), 1, "MEMBER_A: inbox fires");
    assert.equal(pushCount(MEMBER_A),                   1, "MEMBER_A: push fires");
    assert.equal(emailCount(MEMBER_A),                  0, "MEMBER_A: email off by default");

    assert.equal(inboxCount("group_workout", MEMBER_B), 1, "MEMBER_B: inbox fires");
    assert.equal(pushCount(MEMBER_B),                   1, "MEMBER_B: push fires");
    assert.equal(emailCount(MEMBER_B),                  0, "MEMBER_B: email off by default");
  });

  it("actor does NOT receive a group_workout notification for their own workout", async () => {
    const { status } = await postWorkout(30);
    assert.equal(status, 200);

    assert.equal(inboxCount("group_workout", ACTOR_ID), 0, "actor: no inbox");
    assert.equal(pushCount(ACTOR_ID),                   0, "actor: no push");
    assert.equal(emailCount(ACTOR_ID),                  0, "actor: no email");
  });

  it("each channel toggle independently controls its own side effect for MEMBER_A", async () => {
    // No challenge, no raid — only workout notification fires to MEMBER_A.
    await assertChannelMatrix("group_workout", MEMBER_A, async () => {
      const { status } = await postWorkout(30);
      assert.equal(status, 200);
    });
  });

  it("MEMBER_A and MEMBER_B channels are gated independently", async () => {
    setChannels(MEMBER_A, "group_workout", { inbox: true,  push: true,  email: false });
    setChannels(MEMBER_B, "group_workout", { inbox: false, push: false, email: true  });

    const { status } = await postWorkout(30);
    assert.equal(status, 200);

    assert.equal(inboxCount("group_workout", MEMBER_A), 1, "MEMBER_A: inbox fires");
    assert.equal(pushCount(MEMBER_A),                   1, "MEMBER_A: push fires");
    assert.equal(emailCount(MEMBER_A),                  0, "MEMBER_A: email suppressed");

    assert.equal(inboxCount("group_workout", MEMBER_B), 0, "MEMBER_B: inbox suppressed");
    assert.equal(pushCount(MEMBER_B),                   0, "MEMBER_B: push suppressed");
    assert.equal(emailCount(MEMBER_B),                  1, "MEMBER_B: email fires");
  });

  it("inbox insert carries correct type, link, and sourceId", async () => {
    setChannels(MEMBER_A, "group_workout", { inbox: true, push: false, email: false });
    const { status } = await postWorkout(30);
    assert.equal(status, 200);

    const insert = state.inboxInserts.find(i => i.type === "group_workout" && i.playerId === MEMBER_A);
    assert.ok(insert, "inbox insert must exist for MEMBER_A");
    assert.equal(insert!.type,     "group_workout");
    assert.equal(insert!.link,     `/groups/${GROUP_ID}`);
    assert.equal(insert!.sourceId, ACTOR_ID);
  });
});

// ── Tests: group_challenge_completed ─────────────────────────────────────────

describe("POST /groups/:id/workout — group_challenge_completed fan-out", () => {
  it("all members including actor receive group_challenge_completed when a challenge finishes", async () => {
    setupCompletableChallenge();
    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    for (const memberId of [ACTOR_ID, MEMBER_A, MEMBER_B]) {
      assert.equal(
        inboxCount("group_challenge_completed", memberId),
        1,
        `memberId ${memberId}: challenge inbox fires`,
      );
    }
  });

  it("no group_challenge_completed notifications when no active challenges exist", async () => {
    state.activeChallenges = [];
    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    for (const memberId of [ACTOR_ID, MEMBER_A, MEMBER_B]) {
      assert.equal(inboxCount("group_challenge_completed", memberId), 0, `memberId ${memberId}: no inbox`);
    }
  });

  it("each channel toggle independently controls its own side effect (actor as recipient)", async () => {
    // Use ACTOR_ID: actor is excluded from workout fan-out, so push count is
    // exactly 1 per fire() call (only the challenge notification contributes).
    setupCompletableChallenge();
    await assertChannelMatrix("group_challenge_completed", ACTOR_ID, async () => {
      const { status } = await postWorkout(200);
      assert.equal(status, 200);
    });
  });

  it("inbox insert carries correct type, link, and sourceId", async () => {
    setupCompletableChallenge();
    setChannels(MEMBER_A, "group_challenge_completed", { inbox: true, push: false, email: false });

    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    const insert = state.inboxInserts.find(i => i.type === "group_challenge_completed" && i.playerId === MEMBER_A);
    assert.ok(insert, "inbox insert must exist for MEMBER_A");
    assert.equal(insert!.type,     "group_challenge_completed");
    assert.equal(insert!.link,     `/groups/${GROUP_ID}`);
    assert.equal(insert!.sourceId, ACTOR_ID);
  });

  it("MEMBER_A and MEMBER_B channel settings are applied independently for challenge completion", async () => {
    setupCompletableChallenge();
    setChannels(MEMBER_A, "group_challenge_completed", { inbox: true,  push: false, email: true  });
    setChannels(MEMBER_B, "group_challenge_completed", { inbox: false, push: true,  email: false });

    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    assert.equal(inboxCount("group_challenge_completed", MEMBER_A), 1, "MEMBER_A: inbox fires");
    assert.equal(inboxCount("group_challenge_completed", MEMBER_B), 0, "MEMBER_B: inbox suppressed");
  });
});

// ── Tests: group_raid_defeated ────────────────────────────────────────────────

describe("POST /groups/:id/workout — group_raid_defeated fan-out", () => {
  it("all members including actor receive group_raid_defeated when the boss is defeated", async () => {
    setupDefeatableRaid();
    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    for (const memberId of [ACTOR_ID, MEMBER_A, MEMBER_B]) {
      assert.equal(
        inboxCount("group_raid_defeated", memberId),
        1,
        `memberId ${memberId}: raid inbox fires`,
      );
    }
  });

  it("no group_raid_defeated notifications when there is no active raid", async () => {
    state.activeRaid = null;
    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    for (const memberId of [ACTOR_ID, MEMBER_A, MEMBER_B]) {
      assert.equal(inboxCount("group_raid_defeated", memberId), 0, `memberId ${memberId}: no inbox`);
    }
  });

  it("no group_raid_defeated notifications when the boss survives", async () => {
    // bossHp=1000, steps=1 → damage=Math.round(0.5)=1 < 1000 → active
    state.activeRaid = {
      id: 21, groupId: GROUP_ID, bossName: "Tough Boss", bossHp: 1000, currentDamage: 0,
      status: "active", createdAt: new Date("2026-01-01"), unlockedAt: new Date("2026-01-01"),
    };
    const { status } = await postWorkout(1);
    assert.equal(status, 200);

    for (const memberId of [ACTOR_ID, MEMBER_A, MEMBER_B]) {
      assert.equal(inboxCount("group_raid_defeated", memberId), 0, `memberId ${memberId}: no inbox when boss survives`);
    }
  });

  it("each channel toggle independently controls its own side effect (actor as recipient)", async () => {
    // Use ACTOR_ID: actor is excluded from workout fan-out, so push count is
    // exactly 1 per fire() call (only the raid defeat notification contributes).
    setupDefeatableRaid();
    await assertChannelMatrix("group_raid_defeated", ACTOR_ID, async () => {
      const { status } = await postWorkout(200);
      assert.equal(status, 200);
    });
  });

  it("inbox insert carries correct type, link, and sourceId", async () => {
    setupDefeatableRaid();
    setChannels(MEMBER_B, "group_raid_defeated", { inbox: true, push: false, email: false });

    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    const insert = state.inboxInserts.find(i => i.type === "group_raid_defeated" && i.playerId === MEMBER_B);
    assert.ok(insert, "inbox insert must exist for MEMBER_B");
    assert.equal(insert!.type,     "group_raid_defeated");
    assert.equal(insert!.link,     `/groups/${GROUP_ID}`);
    assert.equal(insert!.sourceId, ACTOR_ID);
  });

  it("MEMBER_A and MEMBER_B channel settings are applied independently for raid defeat", async () => {
    setupDefeatableRaid();
    setChannels(MEMBER_A, "group_raid_defeated", { inbox: true,  push: false, email: false });
    setChannels(MEMBER_B, "group_raid_defeated", { inbox: false, push: true,  email: true  });

    const { status } = await postWorkout(200);
    assert.equal(status, 200);

    assert.equal(inboxCount("group_raid_defeated", MEMBER_A), 1, "MEMBER_A: inbox fires");
    assert.equal(inboxCount("group_raid_defeated", MEMBER_B), 0, "MEMBER_B: inbox suppressed");

    // MEMBER_B has workout push + raid push (non-actor gets both); check raid inbox is suppressed
    const raidEmailB = state.emailCalls.filter(e => e.playerId === MEMBER_B).length;
    assert.equal(raidEmailB, 1, "MEMBER_B: email fires");
  });
});
