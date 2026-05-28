// Endpoint tests for the per-channel social notification fan-out.
//
// Every social write endpoint (reactions, comments, mentions, follows)
// fans out a notification along three independent channels: in-app inbox,
// web push, email. The wiring in `routes/social.ts` resolves the channels
// via `socialChannelsForType` and then conditionally:
//   - inserts a row into `notificationsTable` when `ch.inbox`
//   - calls `sendPushToPlayer` when `ch.push`
//   - calls `sendSocialEmail` when `ch.email`
//
// We exercise each endpoint with channel matrices and assert that turning
// any single channel off suppresses only that channel's side effect — and
// that turning the whole bundle off (legacy master toggle) yields zero
// side effects. This locks in the behavior so a future refactor can't
// silently re-enable a channel the user opted out of (or skip one they
// opted into).

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

// ── Spies / state ───────────────────────────────────────────────────────────

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
  // playerId -> per-type channels override. Falls back to all-on (with
  // email default off) when no override is set.
  channelsByPlayerType: new Map<string, Channels>(),
  inboxInserts: [] as InboxInsert[],
  pushCalls: [] as PushCall[],
  emailCalls: [] as EmailCall[],
  authPlayerId: 1 as number | null,
  authClerkId: "u_actor" as string | null,
  mentioned: [] as Array<{ id: number }>,
  existingFollow: false,
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
  state.existingFollow = false;
}

// ── Mocks: auth + middlewares + peripherals ─────────────────────────────────

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

mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    requirePremium: (_req: unknown, _res: unknown, next: () => void) => next(),
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
mock.module("../../middlewares/adminPanel.ts", {
  namedExports: { requireAdminPanel: (_req: unknown, _res: unknown, next: () => void) => next() },
});
mock.module("../../services/postPurgeJob.ts", {
  namedExports: { hardDeletePosts: async () => 0, RETENTION_DAYS: 30 },
});
mock.module("../safety.ts", {
  namedExports: {
    getHiddenPlayerIds: async () => [],
    filterDiscoverableCandidates: async (_v: unknown, rows: any[]) => rows,
  },
});

// Drive the mention loops via this stub.
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

// Inject channels per (recipient, type).
mock.module("../../services/socialNotifyPrefs.ts", {
  namedExports: {
    socialChannelsForType: async (playerId: number, type: string): Promise<Channels | null> => {
      const override = state.channelsByPlayerType.get(chKey(playerId, type));
      if (override) return override;
      return { inbox: true, push: true, email: false };
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
    CreatePostBody: stubSchema,
    ReactToPostBody: stubSchema,
    AddPostCommentBody: stubSchema,
    EditPostCommentBody: stubSchema,
    FollowPlayerBody: stubSchema,
    RepostPostBody: stubSchema,
  },
});

// ── drizzle predicate stubs ─────────────────────────────────────────────────
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

// ── Table sentinels + fake db ───────────────────────────────────────────────
const notificationsTable = { __t: "notificationsTable" };
const postsTable = { __t: "postsTable", id: { __col: "id" }, playerId: { __col: "playerId" } };
const postReactionsTable = { __t: "postReactionsTable" };
const postCommentsTable = { __t: "postCommentsTable" };
const postRepostsTable = { __t: "postRepostsTable" };
const postCommentReactionsTable = { __t: "postCommentReactionsTable" };
const postCommentRevisionsTable = { __t: "postCommentRevisionsTable" };
const postNotificationMutesTable = { __t: "postNotificationMutesTable" };
const playerFollowsTable = { __t: "playerFollowsTable" };
const playersTable = { __t: "playersTable" };
const hatchlingsTable = { __t: "hatchlingsTable" };
const groupsTable = { __t: "groupsTable" };
const groupMembersTable = { __t: "groupMembersTable" };
const userReportsTable = { __t: "userReportsTable" };
const challengesTable = { __t: "challengesTable" };
const challengeParticipantsTable = { __t: "challengeParticipantsTable" };
const postViewsTable = { __t: "postViewsTable" };

// Fixture: actor (the auth'd player) + target (the post author / followee).
const ACTOR_ID = 1;
const TARGET_ID = 2;
const MENTION_ID = 3;

const players: Record<number, any> = {
  [ACTOR_ID]: { id: ACTOR_ID, clerkId: "u_actor", displayName: "Actor", username: "actor" },
  [TARGET_ID]: { id: TARGET_ID, clerkId: "u_target", displayName: "Target", username: "target" },
  [MENTION_ID]: { id: MENTION_ID, clerkId: "u_mention", displayName: "Mention", username: "mention" },
};

const POST_ID = 100;
const post = {
  id: POST_ID,
  playerId: TARGET_ID,
  content: "hello @mention check this",
  mediaUrl: null,
  postType: "general",
  creatureId: null,
  xpEarned: 0,
  energyEarned: 0,
  isFlagged: false,
  engagementScore: 0,
  viewCount: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
  metadata: null,
};

const COMMENT_ID = 500;
const comment = {
  id: COMMENT_ID,
  postId: POST_ID,
  playerId: TARGET_ID, // someone else's comment — actor's like targets TARGET
  content: "great post",
  createdAt: new Date("2026-01-02T00:00:00Z"),
};

const queryHandlers: Record<string, any> = {
  postsTable: {
    findFirst: async () => ({ ...post }),
    findMany: async () => [{ ...post }],
  },
  playersTable: {
    findFirst: async () => players[ACTOR_ID],
    findMany: async () => Object.values(players),
  },
  postReactionsTable: { findFirst: async () => undefined, findMany: async () => [] },
  postCommentsTable: {
    findFirst: async () => ({ ...comment }),
    findMany: async () => [],
  },
  postCommentReactionsTable: { findFirst: async () => undefined, findMany: async () => [] },
  postCommentRevisionsTable: { findFirst: async () => undefined, findMany: async () => [] },
  postRepostsTable: { findFirst: async () => undefined, findMany: async () => [] },
  postNotificationMutesTable: { findFirst: async () => undefined, findMany: async () => [] },
  playerFollowsTable: {
    findFirst: async () => (state.existingFollow ? { id: 1 } : undefined),
    findMany: async () => [],
  },
  notificationsTable: { findFirst: async () => undefined, findMany: async () => [] },
  hatchlingsTable: { findFirst: async () => undefined, findMany: async () => [] },
};

const fakeDb = {
  query: new Proxy({}, {
    get: (_t, name: string) => queryHandlers[name] ?? {
      findFirst: async () => undefined,
      findMany: async () => [],
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
      if (table === postCommentsTable) {
        return {
          returning: async () => [{
            id: COMMENT_ID,
            postId: vals.postId,
            playerId: vals.playerId,
            content: vals.content,
            createdAt: new Date(),
          }],
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
      }
      if (table === postsTable) {
        return {
          returning: async () => [{ ...post, ...vals, id: POST_ID }],
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
        then: (resolve: any, reject: any) => Promise.resolve([{ count: 0 }]).then(resolve, reject),
      };
      return chain;
    },
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    notificationsTable,
    postsTable,
    postViewsTable,
    postReactionsTable,
    postCommentsTable,
    postCommentReactionsTable,
    postCommentRevisionsTable,
    postNotificationMutesTable,
    postRepostsTable,
    playerFollowsTable,
    playersTable,
    hatchlingsTable,
    groupsTable,
    groupMembersTable,
    userReportsTable,
    challengesTable,
    challengeParticipantsTable,
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    rateLimitAttemptsTable: { id: {}, scope: {}, key: {}, createdAt: {} },
  },
});

// ── Server harness ──────────────────────────────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(socialRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => { await closeServer(); });

beforeEach(() => { resetState(); });

// ── HTTP helpers ────────────────────────────────────────────────────────────
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

// Exercise every channel matrix for a given (endpoint, type, recipient).
// `fire` is the call that should fan out one notification of `type` to
// `recipient` per invocation; channels are flipped between calls.
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

  // 5. All channels OFF (mimics legacy master toggle off) → no side effects.
  setChannels(recipientId, type, { inbox: false, push: false, email: false });
  await fire();
  c = countsFor(type, recipientId);
  assert.equal(c.inbox, 0, `${type}: all-off must skip inbox`);
  assert.equal(c.push, 0, `${type}: all-off must skip push`);
  assert.equal(c.email, 0, `${type}: all-off must skip email`);
}

function resetSideEffects() {
  state.inboxInserts = [];
  state.pushCalls = [];
  state.emailCalls = [];
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /social/posts/:id/react — per-channel notification fan-out", () => {
  it("each channel toggle independently controls its own side effect", async () => {
    await assertChannelMatrix("post_reaction", TARGET_ID, async () => {
      const { status } = await postJson(`/social/posts/${POST_ID}/react`, { reactionType: "like" });
      assert.equal(status, 200);
    });
  });

  it("self-react never produces any notification", async () => {
    // Actor reacts to actor's own post: route short-circuits before
    // socialChannelsForType is consulted.
    state.authPlayerId = TARGET_ID;
    state.authClerkId = "u_target";
    // Even with everything enabled, no notification should fire.
    setChannels(TARGET_ID, "post_reaction", { inbox: true, push: true, email: true });
    const { status } = await postJson(`/social/posts/${POST_ID}/react`, { reactionType: "fire" });
    assert.equal(status, 200);
    assert.equal(countsFor("post_reaction", TARGET_ID).inbox, 0);
    assert.equal(countsFor("post_reaction", TARGET_ID).push, 0);
    assert.equal(countsFor("post_reaction", TARGET_ID).email, 0);
  });
});

describe("POST /social/posts/:id/comments — per-channel notification fan-out", () => {
  it("each channel toggle independently controls the reply notification to the post author", async () => {
    await assertChannelMatrix("post_comment", TARGET_ID, async () => {
      const { status } = await postJson(`/social/posts/${POST_ID}/comments`, { content: "nice" });
      assert.equal(status, 201);
    });
  });
});

describe("POST /social/posts/:id/comments — mention loop fan-out", () => {
  it("comment_mention to a mentioned user honors per-channel toggles independently", async () => {
    // Mention only MENTION_ID. The post author (TARGET) won't be
    // mentioned, so we only verify the mention recipient's channels.
    state.mentioned = [{ id: MENTION_ID }];
    // Silence the post author's reply notification so the matrix below
    // doesn't accidentally count reply-related side effects.
    setChannels(TARGET_ID, "post_comment", { inbox: false, push: false, email: false });

    await assertChannelMatrix("comment_mention", MENTION_ID, async () => {
      const { status } = await postJson(`/social/posts/${POST_ID}/comments`, { content: "hi @mention" });
      assert.equal(status, 201);
    });
  });
});

describe("POST /social/posts — post-mention loop fan-out", () => {
  it("post_mention to a mentioned user honors per-channel toggles independently", async () => {
    state.mentioned = [{ id: MENTION_ID }];

    await assertChannelMatrix("post_mention", MENTION_ID, async () => {
      const { status } = await postJson("/social/posts", {
        content: "hello @mention",
        postType: "general",
      });
      assert.equal(status, 201);
    });
  });
});

describe("POST /social/follow — per-channel notification fan-out", () => {
  it("each channel toggle independently controls the new-follower notification", async () => {
    await assertChannelMatrix("new_follower", TARGET_ID, async () => {
      // Each fire must trigger a *fresh* follow — toggle existingFollow
      // off in the fake db so the route inserts and fans out.
      state.existingFollow = false;
      const { status } = await postJson("/social/follow", { followeeId: TARGET_ID });
      assert.equal(status, 200);
    });
  });
});
