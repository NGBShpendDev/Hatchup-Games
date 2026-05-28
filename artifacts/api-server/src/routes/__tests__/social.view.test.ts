// Abuse-protection tests for POST /social/posts/:id/view.
//
// The view endpoint has three layers of defense that this file pins down:
//   1. Per-(post, viewerKey, day) dedup so a viewer refreshing the page
//      doesn't inflate the count.
//   2. HMAC-hashed IP viewerKey so anonymous viewers are stable but raw IPs
//      never hit the database.
//   3. postViewLimiter (120/min/IP) as a second line of defense against
//      bots cycling through posts.
//
// The route is exercised against a real Express server with the DB / auth /
// peripheral modules mocked out, but the rate limiter is the real one from
// `middlewares/rateLimiters.ts` so the threshold is the production threshold.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.SESSION_SECRET = "test-session-secret-1234567890";

interface PostRow { id: number; viewCount: number }
interface ViewInsert { postId: number; viewerKey: string; viewDate: string }

const state = {
  post: { id: 1, viewCount: 0 } as PostRow,
  views: new Set<string>(),
  inserts: [] as ViewInsert[],
  authUserId: null as string | null,
};

function resetState() {
  state.post = { id: 1, viewCount: 0 };
  state.views = new Set();
  state.inserts = [];
  state.authUserId = null;
}

// Anonymous view path by default. Some tests flip state.authUserId to exercise
// the player:<id> viewerKey path.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: state.authUserId }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    attachPlayer: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    requirePremium: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});
mock.module("../../middlewares/minorGuard.ts", {
  namedExports: {
    blockMinorSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});
mock.module("../../middlewares/suspendedGuard.ts", {
  namedExports: {
    blockSuspendedSocialWrite: (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});
mock.module("../../services/pushNotifications.ts", {
  namedExports: { sendPushToPlayer: async () => undefined },
});

mock.module("drizzle-orm", {
  namedExports: {
    eq: () => ({}),
    and: () => ({}),
    or: () => ({}),
    ne: () => ({}),
    desc: () => ({}),
    gte: () => ({}),
    ilike: () => ({}),
    inArray: () => ({}),
    isNull: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});
mock.module("drizzle-orm/pg-core", {
  namedExports: { alias: () => ({}) },
});

const fakeDb = {
  query: {
    postsTable: {
      findFirst: async () => (state.post ? { ...state.post } : undefined),
    },
    playersTable: {
      // Returns a stub player when the route resolves a Clerk session.
      findFirst: async () =>
        state.authUserId ? { id: 42, clerkId: state.authUserId } : undefined,
    },
  },
  insert: (_t: unknown) => ({
    values: (vals: ViewInsert) => {
      state.inserts.push(vals);
      const key = `${vals.postId}|${vals.viewerKey}|${vals.viewDate}`;
      return {
        onConflictDoNothing: (_o: unknown) => ({
          returning: async () => {
            if (state.views.has(key)) return [];
            state.views.add(key);
            return [{ id: state.views.size }];
          },
        }),
      };
    },
  }),
  update: (_t: unknown) => ({
    set: (_v: unknown) => ({
      where: (_w: unknown) => ({
        returning: async () => {
          state.post.viewCount += 1;
          return [{ viewCount: state.post.viewCount }];
        },
      }),
    }),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    postsTable: {},
    postViewsTable: {},
    postReactionsTable: {},
    postCommentsTable: {},
    postCommentReactionsTable: {},
    playerFollowsTable: {},
    postRepostsTable: {},
    playersTable: {},
    hatchlingsTable: {},
    groupMembersTable: {},
    groupsTable: {},
    notificationsTable: {},
  },
});

// ── Imports that depend on the mocks above ───────────────────────────────────
const express = (await import("express")).default;
const socialRouter = (await import("../social.ts")).default;
const { postViewLimiter } = await import("../../middlewares/rateLimiters.ts");

let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const app = express();
  // Trust the test client's X-Forwarded-For so each test can pretend to come
  // from a distinct IP, matching how the real proxy fronts the API.
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(socialRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () =>
    new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await closeServer();
});

// Each test starts with a fresh in-memory state and a fresh rate-limit budget
// for the IPs we use, so ordering between tests doesn't matter.
const TEST_IPS = ["9.9.9.9", "1.2.3.4", "5.6.7.8", "127.0.0.1", "::ffff:127.0.0.1"];
beforeEach(() => {
  resetState();
  const lim = postViewLimiter as unknown as { resetKey?: (key: string) => void };
  for (const ip of TEST_IPS) lim.resetKey?.(ip);
});

async function postView(
  postId: number,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: { viewCount?: number; counted?: boolean; error?: string } }> {
  const res = await fetch(`${baseUrl}/social/posts/${postId}/view`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  });
  const body = (await res.json().catch(() => ({}))) as { viewCount?: number; counted?: boolean; error?: string };
  return { status: res.status, body };
}

describe("POST /social/posts/:id/view — abuse protection", () => {
  it("dedups: the same viewer pinging twice on the same day only counts once", async () => {
    const first = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(first.status, 200);
    assert.equal(first.body.counted, true);
    assert.equal(first.body.viewCount, 1);

    const second = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(second.status, 200);
    assert.equal(second.body.counted, false, "second ping must not inflate the count");
    assert.equal(second.body.viewCount, 1);

    assert.equal(state.inserts.length, 2, "both pings should attempt an insert");
    assert.equal(
      state.inserts[0].viewerKey,
      state.inserts[1].viewerKey,
      "same viewer must produce the same viewerKey",
    );
  });

  it("dedups signed-in viewers by playerId, not by IP", async () => {
    state.authUserId = "user_clerk_xyz";
    const r1 = await postView(1, { "x-forwarded-for": "9.9.9.9" });
    // Same player, different IP — the playerId-based key still dedups.
    const r2 = await postView(1, { "x-forwarded-for": "8.8.8.8" });

    assert.equal(r1.body.counted, true);
    assert.equal(r2.body.counted, false);
    assert.equal(r2.body.viewCount, 1);
    assert.equal(state.inserts[0].viewerKey, "player:42");
    assert.equal(state.inserts[1].viewerKey, "player:42");
  });

  it("hashed IP viewerKey is stable for the same IP and different for different IPs", async () => {
    await postView(1, { "x-forwarded-for": "1.2.3.4" });
    await postView(1, { "x-forwarded-for": "1.2.3.4" });
    await postView(1, { "x-forwarded-for": "5.6.7.8" });

    assert.equal(state.inserts.length, 3);
    const [a1, a2, b] = state.inserts.map((i) => i.viewerKey);

    assert.equal(a1, a2, "same IP must produce the same viewerKey");
    assert.notEqual(a1, b, "different IPs must produce different viewerKeys");
    assert.match(a1, /^ip:[0-9a-f]{32}$/, "anonymous viewerKey must be the hashed form");
    assert.ok(!a1.includes("1.2.3.4"), "raw IP must never appear in viewerKey");
    assert.ok(!b.includes("5.6.7.8"), "raw IP must never appear in viewerKey");
  });

  it("postViewLimiter blocks bursts above the per-minute threshold", async () => {
    // The real limiter allows 120/min/IP. Fire that many serially from the
    // same connection — all should succeed — and then assert the 121st is
    // rejected with 429.
    for (let i = 0; i < 120; i++) {
      const r = await postView(1);
      assert.equal(r.status, 200, `request #${i + 1} should be allowed under the limit`);
    }
    const blocked = await postView(1);
    assert.equal(blocked.status, 429, "request #121 must be rate-limited");
    assert.match(
      blocked.body.error ?? "",
      /view pings/i,
      "limiter should return the configured message",
    );
  });
});
