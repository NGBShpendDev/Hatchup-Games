// Tests for POST /nutrition/recap/preview.
//
// Unlike the broader nutrition contract tests, this file exercises the
// preview route end-to-end with:
//   - the REAL `recapPreviewLimiter` (so we can verify the 1/hour cap)
//   - the REAL `computeWeeklyRecap` + `sendWeeklyRecapNotification` services
//     (so we can prove that preview notifications live in a separate sourceId
//     space from the actual weekly recap and don't suppress each other)
//
// Database, auth, AI, and external delivery channels are stubbed via
// `mock.module` so the routes run in isolation against in-memory state.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// ── In-memory state ─────────────────────────────────────────────────────────
type Player = {
  id: number;
  clerkId: string;
  physiqueGoal: string | null;
  email?: string | null;
  notifyRecapEmail?: boolean;
  notifyRecapPush?: boolean;
  recapEmailLastSentWeek?: number | null;
  recapPushLastSentWeek?: number | null;
  displayName?: string | null;
  username?: string | null;
};
type MealPost = {
  playerId: number;
  name: string;
  emoji: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  createdAt: Date;
};
type Notification = {
  id?: number;
  playerId: number;
  type: string;
  title: string;
  body: string;
  link: string;
  sourceId: number;
};

const state = {
  players: new Map<number, Player>(),
  posts: [] as MealPost[],
  notifications: [] as Notification[],
};

// Each test gets a unique default player so the per-player rate limiter
// (module singleton) doesn't bleed state across tests. Tests that need
// additional players (e.g. shared-IP scenarios) can add more to `state.players`
// and pass the matching `userId` to `postJson`.
let nextPlayerSeq = 0;
let defaultPlayerId = 1;
let defaultClerkId = "u_1";

function reset() {
  state.players.clear();
  state.posts = [];
  state.notifications = [];
  nextPlayerSeq += 1;
  defaultPlayerId = nextPlayerSeq;
  defaultClerkId = `u_${nextPlayerSeq}`;
  state.players.set(defaultPlayerId, {
    id: defaultPlayerId,
    clerkId: defaultClerkId,
    physiqueGoal: "lean_athlete",
    email: null,
    notifyRecapEmail: false,
    notifyRecapPush: false,
    displayName: "Ash",
    username: "ash",
  });
}

// ── Column stubs + drizzle helper mocks ─────────────────────────────────────
const col = (name: string) => ({ __col: name }) as const;

const playersTable = {
  id: col("players.id"),
  clerkId: col("players.clerkId"),
};
const mealPostsTable = {
  playerId: col("mealPosts.playerId"),
  createdAt: col("mealPosts.createdAt"),
};
const notificationsTable = {
  playerId: col("notifications.playerId"),
  type: col("notifications.type"),
  sourceId: col("notifications.sourceId"),
};

type Predicate = Record<string, unknown> & { __sinceIso?: string };

function mergePredicates(parts: Predicate[]): Predicate {
  return Object.assign({}, ...parts);
}

const fakeDb = {
  query: {
    playersTable: {
      findFirst: async (args: { where: Predicate }) => {
        const id = args.where["players.id"] as number | undefined;
        if (id != null) return state.players.get(id);
        const clerkId = args.where["players.clerkId"] as string | undefined;
        if (clerkId != null) {
          for (const p of state.players.values()) {
            if (p.clerkId === clerkId) return p;
          }
        }
        return undefined;
      },
    },
    mealPostsTable: {
      findMany: async (args: { where: Predicate; orderBy?: unknown }) => {
        const pid = args.where["mealPosts.playerId"] as number | undefined;
        const sinceIso = args.where.__sinceIso;
        const since = sinceIso ? new Date(sinceIso) : new Date(0);
        return state.posts.filter(
          (p) => (pid == null || p.playerId === pid) && p.createdAt >= since,
        );
      },
    },
    notificationsTable: {
      findFirst: async (args: { where: Predicate; columns?: unknown }) => {
        const pid = args.where["notifications.playerId"];
        const type = args.where["notifications.type"];
        const src = args.where["notifications.sourceId"];
        return state.notifications.find(
          (n) => n.playerId === pid && n.type === type && n.sourceId === src,
        );
      },
    },
  },
  insert: (_table: unknown) => ({
    values: async (vals: Omit<Notification, "id">) => {
      state.notifications.push({ id: state.notifications.length + 1, ...vals });
    },
  }),
  update: (_table: unknown) => ({
    set: (_vals: unknown) => ({
      where: async (_pred: Predicate) => {},
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    emailResendAttemptsTable: { id: {}, key: {}, createdAt: {} },
    db: fakeDb,
    mealPostsTable,
    playersTable,
    notificationsTable,
    // Touched only as opaque table markers by the route imports
    mealLikesTable: {},
    mealCommentsTable: {},
    nutritionChallengeProgressTable: {},
    nutritionDailyStreaksTable: {},
    groupMembersTable: {},
    hatchlingsTable: {},
  },
});

mock.module("drizzle-orm", {
  namedExports: {
    lt: () => ({}),
    and: (...parts: Predicate[]) => mergePredicates(parts),
    desc: (c: unknown) => ({ __desc: c }),
    eq: (c: { __col: string }, val: unknown): Predicate => ({ [c.__col]: val }),
    or: () => ({}),
    inArray: () => ({}),
    notInArray: () => ({}),
    sql: Object.assign(
      (_strings: TemplateStringsArray, ...values: unknown[]): Predicate => {
        // The recap only uses sql`` once: `${mealPostsTable.createdAt} >= ${sinceISO}`.
        const last = values[values.length - 1];
        return { __sinceIso: typeof last === "string" ? last : undefined };
      },
      { raw: (_s: string) => ({}) },
    ),
  },
});

// Auth: read the clerk user from an `x-test-user` header so individual tests
// can simulate multiple authenticated players sharing one IP. Defaults to u_1.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: (req: { headers: Record<string, string | string[] | undefined> }) => {
      const raw = req.headers["x-test-user"];
      const userId = Array.isArray(raw) ? raw[0] : raw;
      return { userId: userId ?? "u_1" };
    },
  },
});

// Silence the route's req.log.warn fallback path and shared logger.
mock.module("../../lib/logger.ts", {
  namedExports: {
    logger: { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} },
  },
});

// External services for sendWeeklyRecapNotification — off by default.
mock.module("../../services/emailService.ts", {
  namedExports: {
    isEmailConfigured: () => false,
    sendTransactionalEmail: async () => true,
  },
});
mock.module("../../services/nutritionRecapEmail.ts", {
  namedExports: {
    renderRecapEmailHtml: () => "<html></html>",
  },
});
mock.module("../../services/pushNotifications.ts", {
  namedExports: {
    isPushConfigured: () => false,
    sendPushToPlayer: async () => {},
  },
});

// Disable AI tip generation — forces deterministic fallback copy.
mock.module("@workspace/integrations-openai-ai-server", {
  namedExports: {
    openai: {
      chat: {
        completions: {
          create: async () => {
            throw new Error("AI disabled in tests");
          },
        },
      },
    },
  },
});

// Stubs for other route deps not exercised here.
mock.module("../../services/badgeService.ts", {
  namedExports: { awardBadge: async () => null },
});
mock.module("../safety.ts", {
  namedExports: { getHiddenPlayerIds: async () => [] as number[] },
});
mock.module("../storage.ts", {
  namedExports: { verifyUploadToken: () => true },
});
mock.module("../../lib/objectStorage.ts", {
  namedExports: {
    ObjectStorageService: class { async trySetObjectEntityAclPolicy() {} },
  },
});

// ── Imports that depend on the mocks above ───────────────────────────────────
const express = (await import("express")).default;
const nutritionRouter = (await import("../nutrition.ts")).default;
const { isoWeekKey } = await import("../../services/nutritionRecap.ts");

// ── Server setup ─────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

// Each test gets a unique synthetic client IP via X-Forwarded-For so the
// in-memory rate-limit store (shared across tests because the limiter is a
// module singleton) doesn't bleed state between tests. The rate-limit test
// itself reuses the same IP twice on purpose to verify the cap.
let testIp = 0;
function nextIp(): string {
  testIp += 1;
  return `10.0.0.${testIp}`;
}

before(async () => {
  const app = express();
  // Honor X-Forwarded-For so express-rate-limit keys off the per-test IP.
  // 'loopback' (not `true`) keeps express-rate-limit happy — it refuses
  // permissive trust-proxy settings to prevent header spoofing in production.
  app.set("trust proxy", "loopback");
  // Tiny request logger shim so the route's req.log.warn doesn't blow up
  // in the error path. Real server wires this via pino-http.
  app.use((req, _res, next) => {
    (req as unknown as { log: typeof console }).log = {
      warn: () => {}, info: () => {}, error: () => {}, debug: () => {},
    } as unknown as typeof console;
    next();
  });
  app.use(express.json());
  app.use(nutritionRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

beforeEach(() => {
  reset();
});

async function postJson(
  path: string,
  body: unknown = {},
  ip?: string,
  userId?: string,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": ip ?? nextIp(),
  };
  headers["x-test-user"] = userId ?? defaultClerkId;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : null };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("POST /nutrition/recap/preview", () => {
  it("inserts a notification with type=nutrition_recap_preview and a negative sourceId", async () => {
    state.posts.push({
      playerId: defaultPlayerId,
      name: "Oatmeal",
      emoji: "🥣",
      calories: 400, proteinG: 20, carbsG: 60, fatG: 10,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    const { res, body } = await postJson("/nutrition/recap/preview");
    assert.equal(res.status, 200);
    assert.ok(body.title, "response includes a title");
    assert.ok(body.body, "response includes a body");
    assert.ok(body.recap, "response includes the computed recap payload");

    assert.equal(state.notifications.length, 1);
    const n = state.notifications[0]!;
    assert.equal(n.playerId, defaultPlayerId);
    assert.equal(n.type, "nutrition_recap_preview");
    assert.equal(n.link, "/nutrition");
    assert.ok(n.title.startsWith("Preview: "), "notification title is prefixed with 'Preview: '");
    assert.ok(n.sourceId < 0, `sourceId should be negative, got ${n.sourceId}`);
  });

  it("does NOT suppress (or get suppressed by) the real weekly recap — they use different sourceId spaces", async () => {
    state.posts.push({
      playerId: defaultPlayerId,
      name: "Salad",
      emoji: "🥗",
      calories: 350, proteinG: 25, carbsG: 30, fatG: 12,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // 1. Sending a preview inserts a preview notification.
    const previewRes = await postJson("/nutrition/recap/preview");
    assert.equal(previewRes.res.status, 200);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0]!.type, "nutrition_recap_preview");

    // 2. The real weekly recap is still delivered — it keys off the positive
    //    ISO-week sourceId, which can never collide with the preview's
    //    negative epoch-second sourceId.
    const sendRes = await postJson("/nutrition/recap/send");
    assert.equal(sendRes.res.status, 200);
    assert.equal(sendRes.body.sent, true, "real recap should still be sent after a preview");

    assert.equal(state.notifications.length, 2);
    const real = state.notifications.find((n) => n.type === "nutrition_recap");
    assert.ok(real, "real recap notification should exist");
    assert.equal(real!.sourceId, isoWeekKey(new Date()));
    assert.ok(real!.sourceId > 0, "real recap sourceId is the positive ISO-week key");

    const preview = state.notifications.find((n) => n.type === "nutrition_recap_preview");
    assert.ok(preview, "preview notification should still exist");
    assert.ok(preview!.sourceId < 0, "preview sourceId stays in the negative epoch-second space");
  });

  it("lets two different players sharing one IP each preview once within the hour", async () => {
    // beforeEach already seeded the default player. Add a second one so we
    // have two distinct authenticated identities behind the same IP.
    const playerA = defaultPlayerId;
    const clerkA = defaultClerkId;
    nextPlayerSeq += 1;
    const playerB = nextPlayerSeq;
    const clerkB = `u_${nextPlayerSeq}`;
    state.players.set(playerB, {
      id: playerB,
      clerkId: clerkB,
      physiqueGoal: "lean_athlete",
      email: null,
      notifyRecapEmail: false,
      notifyRecapPush: false,
      displayName: "Misty",
      username: "misty",
    });

    state.posts.push({
      playerId: playerA,
      name: "Eggs",
      emoji: "🥚",
      calories: 300, proteinG: 20, carbsG: 5, fatG: 18,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    state.posts.push({
      playerId: playerB,
      name: "Yogurt",
      emoji: "🥛",
      calories: 200, proteinG: 18, carbsG: 22, fatG: 4,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Both players are behind the same NAT'd IP (shared corporate Wi-Fi).
    const sharedIp = nextIp();

    const p1 = await postJson("/nutrition/recap/preview", {}, sharedIp, clerkA);
    assert.equal(p1.res.status, 200, "player A's first preview should succeed");

    const p2 = await postJson("/nutrition/recap/preview", {}, sharedIp, clerkB);
    assert.equal(
      p2.res.status,
      200,
      "player B must NOT be blocked by player A's preview on the same IP",
    );

    assert.equal(state.notifications.length, 2);
    const owners = state.notifications.map((n) => n.playerId).sort((a, b) => a - b);
    assert.deepEqual(owners, [playerA, playerB].sort((a, b) => a - b));
  });

  it("still caps a single player at 1 preview per hour even on a fresh IP", async () => {
    state.posts.push({
      playerId: defaultPlayerId,
      name: "Bagel",
      emoji: "🥯",
      calories: 280, proteinG: 10, carbsG: 55, fatG: 2,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Different IPs on purpose — the per-player key must still trip.
    const first = await postJson("/nutrition/recap/preview", {}, nextIp(), defaultClerkId);
    assert.equal(first.res.status, 200);

    const second = await postJson("/nutrition/recap/preview", {}, nextIp(), defaultClerkId);
    assert.equal(
      second.res.status,
      429,
      "same player must be rate-limited even when their IP changes",
    );
    assert.equal(state.notifications.length, 1);
  });

  it("rate-limits the second preview call within the hour", async () => {
    state.posts.push({
      playerId: defaultPlayerId,
      name: "Toast",
      emoji: "🍞",
      calories: 200, proteinG: 6, carbsG: 30, fatG: 5,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    // Same player both times — the per-player key trips regardless of IP.
    const sharedIp = nextIp();
    const first = await postJson("/nutrition/recap/preview", {}, sharedIp);
    assert.equal(first.res.status, 200, "first call within the hour should succeed");
    assert.equal(state.notifications.length, 1);

    const second = await postJson("/nutrition/recap/preview", {}, sharedIp);
    assert.equal(second.res.status, 429, "second call within the hour should be rate-limited");
    assert.equal(
      state.notifications.length,
      1,
      "rate-limited call must NOT insert a second preview notification",
    );
  });
});
