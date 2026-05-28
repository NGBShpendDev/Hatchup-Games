// Channel-matrix tests for the club_mention fan-out in `routes/groups.ts`.
//
// When a group message contains an @mention, the handler calls
// `socialChannelsForPlayers` to batch-resolve each recipient's channel
// preferences and then conditionally:
//   - inserts a row into `notificationsTable`  when ch.inbox
//   - calls `sendPushToPlayer`                 when ch.push
//   - calls `sendSocialEmail`                  when ch.email
//
// We verify that toggling any single channel off suppresses only that
// channel's side effect, and that turning all channels off (legacy master
// toggle) produces zero side effects.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

// ── State & spy types ────────────────────────────────────────────────────────

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

const state = {
  channelsByPlayerType: new Map<string, Channels>(),
  inboxInserts: [] as InboxInsert[],
  pushCalls: [] as PushCall[],
  emailCalls: [] as EmailCall[],
  authPlayerId: 1 as number | null,
  authClerkId: "u_actor" as string | null,
  mentioned: [] as Array<{ id: number }>,
};

function chKey(playerId: number, type: string) { return `${playerId}:${type}`; }

function setChannels(playerId: number, type: string, ch: Channels) {
  state.channelsByPlayerType.set(chKey(playerId, type), ch);
}

function resetState() {
  state.channelsByPlayerType = new Map();
  state.inboxInserts = [];
  state.pushCalls = [];
  state.emailCalls = [];
  state.authPlayerId = 1;
  state.authClerkId = "u_actor";
  state.mentioned = [];
}

function resetSideEffects() {
  state.inboxInserts = [];
  state.pushCalls = [];
  state.emailCalls = [];
}

// ── Mocks: auth + middlewares ────────────────────────────────────────────────

mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authClerkId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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
    postViewLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// ── Mocks: services ──────────────────────────────────────────────────────────

mock.module("../../services/fitnessLog.ts", {
  namedExports: {
    logFitnessActivity: async () => ({
      fitnessXpEarned: 0,
      activity: null,
      updatedPlayer: null,
    }),
  },
});

mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => [],
    filterDiscoverableCandidates: async (_v: unknown, rows: any[]) => rows,
  },
});

// Drive the mention resolution via this stub.
mock.module("../../services/mentions.ts", {
  namedExports: {
    resolveMentionedPlayers: async () => state.mentioned,
  },
});

// Spy on the push channel.
mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    sendPushToPlayer: async (playerId: number, payload: { title: string; body: string; category: string }) => {
      state.pushCalls.push({ playerId, title: payload.title, body: payload.body, category: payload.category });
    },
  },
});

// Spy on the email channel.
mock.module("../../services/socialEmail.ts", {
  namedExports: {
    sendSocialEmail: async (playerId: number, payload: { title: string; body: string }) => {
      state.emailCalls.push({ playerId, title: payload.title, body: payload.body });
    },
  },
});

// Inject channels per (recipient, type) using the batch function groups.ts uses.
mock.module("../../services/socialNotifyPrefs.ts", {
  namedExports: {
    socialChannelsForType: async (playerId: number, type: string): Promise<Channels | null> => {
      const override = state.channelsByPlayerType.get(chKey(playerId, type));
      return override ?? { inbox: true, push: true, email: false };
    },
    socialChannelsForPlayers: async (playerIds: number[], type: string): Promise<Map<number, Channels>> => {
      const map = new Map<number, Channels>();
      for (const playerId of playerIds) {
        const override = state.channelsByPlayerType.get(chKey(playerId, type));
        map.set(playerId, override ?? { inbox: true, push: true, email: false });
      }
      return map;
    },
    isSocialNotificationAllowed: async () => true,
    socialPrefBaseForType: () => null,
    SOCIAL_NOTIFY_PREF_KEYS: [],
  },
});

// Validation schemas — passthrough.
const stubSchema = { safeParse: (data: unknown) => ({ success: true, data }) };
mock.module("@workspace/api-zod", {
  namedExports: {
    CreateGroupBody: stubSchema,
    JoinGroupBody: stubSchema,
    LogGroupWorkoutBody: stubSchema,
    SendGroupMessageBody: stubSchema,
    GetGroupParams: stubSchema,
    ListMyGroupsQueryParams: stubSchema,
  },
});

// ── drizzle predicate stubs ──────────────────────────────────────────────────

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    or: () => ({}),
    ne: () => ({}),
    desc: () => ({}),
    gt: () => ({}),
    gte: () => ({}),
    lt: () => ({}),
    inArray: () => ({}),
    notInArray: () => ({}),
    ilike: () => ({}),
    isNull: () => ({}),
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

// ── Table sentinels + fake db ────────────────────────────────────────────────

const notificationsTable = { __t: "notificationsTable" };
const playersTable = { __t: "playersTable" };
const groupsTable = { __t: "groupsTable" };
const groupMembersTable = { __t: "groupMembersTable" };
const groupChallengesTable = { __t: "groupChallengesTable" };
const groupRaidsTable = { __t: "groupRaidsTable" };
const groupMessagesTable = { __t: "groupMessagesTable" };

const GROUP_ID = 42;
const ACTOR_ID = 1;
const MENTION_ID = 3;

const actors: Record<number, any> = {
  [ACTOR_ID]: { id: ACTOR_ID, clerkId: "u_actor", displayName: "Actor", username: "actor" },
  [MENTION_ID]: { id: MENTION_ID, clerkId: "u_mention", displayName: "Mention", username: "mention" },
};

let msgIdCounter = 0;

const fakeDb = {
  query: new Proxy({}, {
    get: (_t, name: string) => {
      if (name === "groupMembersTable") {
        return {
          // checkMembership → returns a row so the actor is always a member
          findFirst: async () => ({ id: 1, groupId: GROUP_ID, playerId: ACTOR_ID }),
          findMany: async () => [{ id: 1, groupId: GROUP_ID, playerId: ACTOR_ID }],
        };
      }
      if (name === "playersTable") {
        return {
          findFirst: async () => actors[ACTOR_ID],
          findMany: async () => Object.values(actors),
        };
      }
      return {
        findFirst: async () => undefined,
        findMany: async () => [],
      };
    },
  }),
  insert: (table: unknown) => ({
    values: (vals: any) => {
      if (table === notificationsTable) {
        state.inboxInserts.push({
          playerId: vals.playerId,
          type: vals.type,
          title: vals.title,
          body: vals.body ?? null,
          link: vals.link ?? null,
          sourceId: vals.sourceId,
        });
        return {
          returning: async () => [{ id: state.inboxInserts.length }],
          onConflictDoNothing: () => ({ returning: async () => [{ id: 1 }] }),
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
      }
      if (table === groupMessagesTable) {
        msgIdCounter += 1;
        const msg = {
          id: msgIdCounter,
          groupId: vals.groupId ?? GROUP_ID,
          playerId: vals.playerId ?? ACTOR_ID,
          playerName: vals.playerName ?? "Actor",
          content: vals.content ?? "",
          isFiltered: vals.isFiltered ?? false,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        };
        return {
          returning: async () => [msg],
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
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  delete: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }),
  select: () => ({
    from: () => {
      const chain: any = {
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit: () => chain,
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
    groupNotificationMutesTable: { __t: "groupNotificationMutesTable", groupId: {}, playerId: {} },
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
  },
});

// ── Server harness ───────────────────────────────────────────────────────────

const express = (await import("express")).default;
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

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try { parsed = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: parsed };
}

function countsFor(type: string, recipientId: number) {
  return {
    inbox: state.inboxInserts.filter(i => i.type === type && i.playerId === recipientId).length,
    push: state.pushCalls.filter(p => p.playerId === recipientId).length,
    email: state.emailCalls.filter(e => e.playerId === recipientId).length,
  };
}

// Exercise every channel toggle for a given (type, recipientId).
// `fire` must trigger exactly one notification of `type` to `recipientId`.
async function assertChannelMatrix(
  type: string,
  recipientId: number,
  fire: () => Promise<void>,
) {
  // 1. All channels ON → all three side effects fire.
  setChannels(recipientId, type, { inbox: true, push: true, email: true });
  await fire();
  let c = countsFor(type, recipientId);
  assert.equal(c.inbox, 1, `${type}: inbox ON should insert one notification`);
  assert.equal(c.push, 1, `${type}: push ON should send one push`);
  assert.equal(c.email, 1, `${type}: email ON should send one email`);
  resetSideEffects();

  // 2. Inbox OFF only → push + email still fire.
  setChannels(recipientId, type, { inbox: false, push: true, email: true });
  await fire();
  c = countsFor(type, recipientId);
  assert.equal(c.inbox, 0, `${type}: inbox OFF must suppress inbox`);
  assert.equal(c.push, 1, `${type}: inbox OFF must NOT silence push`);
  assert.equal(c.email, 1, `${type}: inbox OFF must NOT silence email`);
  resetSideEffects();

  // 3. Push OFF only → inbox + email still fire.
  setChannels(recipientId, type, { inbox: true, push: false, email: true });
  await fire();
  c = countsFor(type, recipientId);
  assert.equal(c.inbox, 1, `${type}: push OFF must NOT silence inbox`);
  assert.equal(c.push, 0, `${type}: push OFF must suppress push`);
  assert.equal(c.email, 1, `${type}: push OFF must NOT silence email`);
  resetSideEffects();

  // 4. Email OFF only → inbox + push still fire.
  setChannels(recipientId, type, { inbox: true, push: true, email: false });
  await fire();
  c = countsFor(type, recipientId);
  assert.equal(c.inbox, 1, `${type}: email OFF must NOT silence inbox`);
  assert.equal(c.push, 1, `${type}: email OFF must NOT silence push`);
  assert.equal(c.email, 0, `${type}: email OFF must suppress email`);
  resetSideEffects();

  // 5. All channels OFF (mimics legacy master toggle off) → zero side effects.
  setChannels(recipientId, type, { inbox: false, push: false, email: false });
  await fire();
  c = countsFor(type, recipientId);
  assert.equal(c.inbox, 0, `${type}: all-off must skip inbox`);
  assert.equal(c.push, 0, `${type}: all-off must skip push`);
  assert.equal(c.email, 0, `${type}: all-off must skip email`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /groups/:id/messages — club_mention channel-matrix fan-out", () => {
  it("each channel toggle independently controls its own side effect for the mentioned player", async () => {
    state.mentioned = [{ id: MENTION_ID }];

    await assertChannelMatrix("club_mention", MENTION_ID, async () => {
      const { status } = await postJson(`/groups/${GROUP_ID}/messages`, {
        playerId: ACTOR_ID,
        content: "hey @mention check this out",
      });
      assert.equal(status, 201);
    });
  });

  it("no mention in message produces zero notification side effects", async () => {
    // mentioned is empty — the fan-out loop never runs.
    state.mentioned = [];
    setChannels(MENTION_ID, "club_mention", { inbox: true, push: true, email: true });

    const { status } = await postJson(`/groups/${GROUP_ID}/messages`, {
      playerId: ACTOR_ID,
      content: "just a regular message with no at-signs",
    });

    assert.equal(status, 201);
    assert.equal(state.inboxInserts.length, 0, "no inbox insert when no mentions");
    assert.equal(state.pushCalls.length, 0, "no push when no mentions");
    assert.equal(state.emailCalls.length, 0, "no email when no mentions");
  });

  it("all-channels-off (legacy master toggle) produces zero side effects even with a mention", async () => {
    state.mentioned = [{ id: MENTION_ID }];
    setChannels(MENTION_ID, "club_mention", { inbox: false, push: false, email: false });

    const { status } = await postJson(`/groups/${GROUP_ID}/messages`, {
      playerId: ACTOR_ID,
      content: "yo @mention what's up",
    });

    assert.equal(status, 201);
    const c = countsFor("club_mention", MENTION_ID);
    assert.equal(c.inbox, 0, "all-off: no inbox insert");
    assert.equal(c.push, 0, "all-off: no push");
    assert.equal(c.email, 0, "all-off: no email");
  });

  it("multiple mentioned players each receive their own independently-gated notification", async () => {
    const MENTION_ID_2 = 4;
    state.mentioned = [{ id: MENTION_ID }, { id: MENTION_ID_2 }];

    // Player MENTION_ID: inbox+push on, email off.
    setChannels(MENTION_ID, "club_mention", { inbox: true, push: true, email: false });
    // Player MENTION_ID_2: only email on.
    setChannels(MENTION_ID_2, "club_mention", { inbox: false, push: false, email: true });

    const { status } = await postJson(`/groups/${GROUP_ID}/messages`, {
      playerId: ACTOR_ID,
      content: "@mention and @mention2 both get pinged",
    });

    assert.equal(status, 201);

    const c1 = countsFor("club_mention", MENTION_ID);
    assert.equal(c1.inbox, 1, "player 1: inbox should fire");
    assert.equal(c1.push, 1, "player 1: push should fire");
    assert.equal(c1.email, 0, "player 1: email should be suppressed");

    const c2 = countsFor("club_mention", MENTION_ID_2);
    assert.equal(c2.inbox, 0, "player 2: inbox should be suppressed");
    assert.equal(c2.push, 0, "player 2: push should be suppressed");
    assert.equal(c2.email, 1, "player 2: email should fire");
  });

  it("inbox notification carries correct type, link, and sourceId", async () => {
    state.mentioned = [{ id: MENTION_ID }];
    setChannels(MENTION_ID, "club_mention", { inbox: true, push: false, email: false });

    const { status } = await postJson(`/groups/${GROUP_ID}/messages`, {
      playerId: ACTOR_ID,
      content: "hey @mention",
    });

    assert.equal(status, 201);
    const insert = state.inboxInserts.find(i => i.playerId === MENTION_ID);
    assert.ok(insert, "inbox insert must exist for the mentioned player");
    assert.equal(insert!.type, "club_mention");
    assert.equal(insert!.link, `/groups/${GROUP_ID}`);
    assert.equal(insert!.sourceId, ACTOR_ID);
  });
});
