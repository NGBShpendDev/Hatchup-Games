// Integration test for the rematch invite flow.
//
// Task #240 moved rematch invites from an in-memory Map onto the
// `rematch_invites` table. This test exercises the full HTTP surface against
// a real Postgres so we catch regressions on persistence, expiry transitions,
// and the cleanup grace window. It also re-imports the matchmakingQueue
// service mid-test to prove that rows survive a "fresh import" — a proxy for
// a server restart since the prior in-memory Map would have been lost.
//
// Auth is mocked at the middleware boundary so we can stand up the real
// `battles` router with the shared `@workspace/db` pool. Notification rows
// are written for real so we incidentally cover the inbox side effect too.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

// ── Auth mock: header-driven impersonation ───────────────────────────────────
// Tests pass `x-test-player-id` on each request; requireAuth is a no-op and
// attachPlayer pulls the id off the header. We must also stub @clerk/express
// because the real auth middleware imports it.
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: null }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

mock.module("../../middlewares/auth.ts", {
  namedExports: {
    requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
    attachPlayer: (req: Request, res: Response, next: NextFunction) => {
      const raw = req.header("x-test-player-id");
      const id = raw ? Number(raw) : NaN;
      if (!raw || Number.isNaN(id)) {
        res.status(401).json({ error: "Missing x-test-player-id" });
        return;
      }
      req.playerId = id;
      next();
    },
  },
});

// Subscription guards do extra DB lookups we don't need exercised here.
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: Request, _res: Response, next: NextFunction) => next(),
    enforceBattleDailyCap: (_req: Request, _res: Response, next: NextFunction) => next(),
    checkAndConsumeBattleCap: async () => ({ ok: true }),
  },
});

// Imports must come AFTER mock.module so the mocked specifiers are wired in.
const { db } = await import("@workspace/db");
const {
  playersTable,
  hatchlingsTable,
  battlesTable,
  notificationsTable,
  rematchInvitesTable,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const battlesRouter = (await import("../battles.ts")).default;

// ── Test data tagging for isolation ──────────────────────────────────────────
const TAG = `rematch-int-${process.pid}-${Date.now()}`;

const createdPlayerIds: number[] = [];
const createdHatchlingIds: number[] = [];
const createdBattleIds: number[] = [];
const createdInviteIds: string[] = [];

async function seedPlayer(suffix: string): Promise<number> {
  const [row] = await db.insert(playersTable).values({
    clerkId: `clerk_${TAG}_${suffix}`,
    username: `${TAG}_${suffix}`,
    displayName: `Test ${suffix}`,
  }).returning();
  createdPlayerIds.push(row!.id);
  return row!.id;
}

async function seedHatchling(playerId: number, name: string): Promise<number> {
  const [row] = await db.insert(hatchlingsTable).values({
    playerId,
    name,
    species: "TestSpecies",
  }).returning();
  createdHatchlingIds.push(row!.id);
  return row!.id;
}

async function seedBattle(p1: number, p2: number, h1: number, h2: number, mode: "casual" | "ranked" = "casual"): Promise<number> {
  const [row] = await db.insert(battlesTable).values({
    player1Id: p1,
    player2Id: p2,
    hatchling1Id: h1,
    hatchling2Id: h2,
    battleMode: mode,
  }).returning();
  createdBattleIds.push(row!.id);
  return row!.id;
}

async function cleanup() {
  if (createdInviteIds.length > 0) {
    await db.delete(rematchInvitesTable).where(inArray(rematchInvitesTable.id, createdInviteIds));
  }
  if (createdPlayerIds.length > 0) {
    // Belt-and-braces: also clear invites referencing our players in case
    // tests created them via the route handler without registering the id.
    await db.delete(rematchInvitesTable).where(inArray(rematchInvitesTable.fromPlayerId, createdPlayerIds));
    await db.delete(rematchInvitesTable).where(inArray(rematchInvitesTable.toPlayerId, createdPlayerIds));
    await db.delete(notificationsTable).where(inArray(notificationsTable.playerId, createdPlayerIds));
  }
  if (createdBattleIds.length > 0) {
    await db.delete(battlesTable).where(inArray(battlesTable.id, createdBattleIds));
  }
  if (createdHatchlingIds.length > 0) {
    await db.delete(hatchlingsTable).where(inArray(hatchlingsTable.id, createdHatchlingIds));
  }
  if (createdPlayerIds.length > 0) {
    await db.delete(playersTable).where(inArray(playersTable.id, createdPlayerIds));
  }
  createdInviteIds.length = 0;
  createdBattleIds.length = 0;
  createdHatchlingIds.length = 0;
  createdPlayerIds.length = 0;
}

// ── Server ───────────────────────────────────────────────────────────────────
let baseUrl: string;
let closeServer: () => Promise<void>;

before(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request).log = {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      debug: () => undefined,
    } as never;
    next();
  });
  app.use(battlesRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  closeServer = () => new Promise<void>((resolve) => server.close(() => resolve()));
});

after(async () => {
  await cleanup();
  await closeServer();
});

beforeEach(async () => {
  await cleanup();
});

// ── HTTP helpers ─────────────────────────────────────────────────────────────
type JsonResp = { status: number; body: any };

async function asPlayer(playerId: number, method: string, path: string, body?: unknown): Promise<JsonResp> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-test-player-id": String(playerId),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("rematch invites — POST /battles/rematch", () => {
  it("creates a pending row, returns it serialized, and drops an inbox notification", async () => {
    const p1 = await seedPlayer("a1");
    const p2 = await seedPlayer("a2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2, "casual");

    const res = await asPlayer(p1, "POST", "/battles/rematch", {
      battleId,
      hatchlingId: h1,
    });

    assert.equal(res.status, 201);
    assert.equal(typeof res.body.id, "string");
    assert.equal(res.body.fromPlayerId, p1);
    assert.equal(res.body.toPlayerId, p2);
    assert.equal(res.body.mode, "casual");
    assert.equal(res.body.fromHatchlingId, h1);
    assert.equal(res.body.fromHatchlingName, "Sparky");
    assert.equal(res.body.fromBattleId, battleId);
    assert.equal(res.body.status, "pending");
    assert.ok(new Date(res.body.expiresAt).getTime() > Date.now());

    createdInviteIds.push(res.body.id);

    // Row exists in DB
    const row = await db.query.rematchInvitesTable.findFirst({
      where: eq(rematchInvitesTable.id, res.body.id),
    });
    assert.ok(row, "rematch invite row was persisted");
    assert.equal(row!.status, "pending");
    assert.equal(row!.fromPlayerId, p1);
    assert.equal(row!.toPlayerId, p2);

    // Notification fan-out to opponent
    const notifs = await db.query.notificationsTable.findMany({
      where: eq(notificationsTable.playerId, p2),
    });
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0]!.type, "rematch_invite");
    assert.match(notifs[0]!.title, /wants a rematch/);
  });

  it("rejects non-participants with 403 and never creates a row", async () => {
    const p1 = await seedPlayer("b1");
    const p2 = await seedPlayer("b2");
    const intruder = await seedPlayer("b3");
    const h1 = await seedHatchling(p1, "S");
    const h2 = await seedHatchling(p2, "B");
    const hIntruder = await seedHatchling(intruder, "Sneak");
    const battleId = await seedBattle(p1, p2, h1, h2);

    const res = await asPlayer(intruder, "POST", "/battles/rematch", {
      battleId,
      hatchlingId: hIntruder,
    });
    assert.equal(res.status, 403);

    const rows = await db.query.rematchInvitesTable.findMany({
      where: eq(rematchInvitesTable.fromBattleId, battleId),
    });
    assert.equal(rows.length, 0);
  });
});

describe("rematch invites — GET /battles/rematch/:id and /pending", () => {
  it("GET /:id returns the invite to either participant and 403s outsiders", async () => {
    const p1 = await seedPlayer("c1");
    const p2 = await seedPlayer("c2");
    const outsider = await seedPlayer("c3");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    assert.equal(create.status, 201);
    const inviteId: string = create.body.id;
    createdInviteIds.push(inviteId);

    const asInviter = await asPlayer(p1, "GET", `/battles/rematch/${inviteId}`);
    assert.equal(asInviter.status, 200);
    assert.equal(asInviter.body.id, inviteId);
    assert.equal(asInviter.body.status, "pending");

    const asRecipient = await asPlayer(p2, "GET", `/battles/rematch/${inviteId}`);
    assert.equal(asRecipient.status, 200);
    assert.equal(asRecipient.body.id, inviteId);

    const asOutsider = await asPlayer(outsider, "GET", `/battles/rematch/${inviteId}`);
    assert.equal(asOutsider.status, 403);

    const missing = await asPlayer(p1, "GET", `/battles/rematch/does-not-exist`);
    assert.equal(missing.status, 404);
  });

  it("GET /pending lists pending invites involving the caller (both directions)", async () => {
    const p1 = await seedPlayer("d1");
    const p2 = await seedPlayer("d2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    createdInviteIds.push(create.body.id);

    for (const viewer of [p1, p2]) {
      const pending = await asPlayer(viewer, "GET", "/battles/rematch/pending");
      assert.equal(pending.status, 200);
      assert.ok(Array.isArray(pending.body));
      const found = pending.body.find((i: any) => i.id === create.body.id);
      assert.ok(found, `viewer ${viewer} sees the invite in /pending`);
      assert.equal(found.status, "pending");
    }
  });
});

describe("rematch invites — accept and decline transitions", () => {
  it("accept flips status to accepted and notifies the inviter", async () => {
    const p1 = await seedPlayer("e1");
    const p2 = await seedPlayer("e2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    const inviteId: string = create.body.id;
    createdInviteIds.push(inviteId);

    // Only the recipient may accept.
    const wrong = await asPlayer(p1, "POST", `/battles/rematch/${inviteId}/accept`);
    assert.equal(wrong.status, 403);

    const ok = await asPlayer(p2, "POST", `/battles/rematch/${inviteId}/accept`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);

    const row = await db.query.rematchInvitesTable.findFirst({
      where: eq(rematchInvitesTable.id, inviteId),
    });
    assert.equal(row!.status, "accepted");

    // Double-accept now returns 409 because status !== "pending".
    const dup = await asPlayer(p2, "POST", `/battles/rematch/${inviteId}/accept`);
    assert.equal(dup.status, 409);

    // Inviter received an "accepted" notification (in addition to the
    // initial "wants a rematch" sent to the recipient).
    const inviterNotifs = await db.query.notificationsTable.findMany({
      where: eq(notificationsTable.playerId, p1),
    });
    assert.ok(inviterNotifs.some(n => /accepted your rematch/.test(n.title)));
  });

  it("decline flips status to declined for both inviter and recipient", async () => {
    const p1 = await seedPlayer("f1");
    const p2 = await seedPlayer("f2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    // Recipient declines.
    {
      const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
      const inviteId: string = create.body.id;
      createdInviteIds.push(inviteId);

      const decl = await asPlayer(p2, "POST", `/battles/rematch/${inviteId}/decline`);
      assert.equal(decl.status, 200);
      const row = await db.query.rematchInvitesTable.findFirst({
        where: eq(rematchInvitesTable.id, inviteId),
      });
      assert.equal(row!.status, "declined");

      // Inviter got a "declined" notification when the recipient declined.
      const inviterNotifs = await db.query.notificationsTable.findMany({
        where: eq(notificationsTable.playerId, p1),
      });
      assert.ok(inviterNotifs.some(n => /declined your rematch/.test(n.title)));
    }

    // Inviter can also decline (cancel) their own invite.
    {
      const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
      const inviteId: string = create.body.id;
      createdInviteIds.push(inviteId);

      const decl = await asPlayer(p1, "POST", `/battles/rematch/${inviteId}/decline`);
      assert.equal(decl.status, 200);
      const row = await db.query.rematchInvitesTable.findFirst({
        where: eq(rematchInvitesTable.id, inviteId),
      });
      assert.equal(row!.status, "declined");
    }
  });
});

describe("rematch invites — expiry & cleanup", () => {
  it("GET /:id lazily flips expired pending invites to status=expired", async () => {
    const p1 = await seedPlayer("g1");
    const p2 = await seedPlayer("g2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    // Insert an already-past-expiry pending invite directly. We use a
    // 5-second past expiry so it's within the cleanup grace window (60s)
    // and won't be hard-deleted before we observe the lazy flip.
    const inviteId = `${TAG}_expired_${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() - 5_000);
    await db.insert(rematchInvitesTable).values({
      id: inviteId,
      fromPlayerId: p1,
      toPlayerId: p2,
      mode: "casual",
      fromHatchlingId: h1,
      fromHatchlingName: "Sparky",
      fromBattleId: battleId,
      status: "pending",
      createdAt: new Date(now.getTime() - 6 * 60 * 1000),
      expiresAt,
    });
    createdInviteIds.push(inviteId);

    const res = await asPlayer(p1, "GET", `/battles/rematch/${inviteId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "expired");

    const row = await db.query.rematchInvitesTable.findFirst({
      where: eq(rematchInvitesTable.id, inviteId),
    });
    assert.equal(row!.status, "expired", "DB row was updated, not just the response");
  });

  it("rows expired past the grace window are hard-deleted by purge", async () => {
    const p1 = await seedPlayer("h1");
    const p2 = await seedPlayer("h2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    // expiresAt well past the 60s grace window.
    const inviteId = `${TAG}_purgeable_${Math.random().toString(36).slice(2)}`;
    await db.insert(rematchInvitesTable).values({
      id: inviteId,
      fromPlayerId: p1,
      toPlayerId: p2,
      mode: "casual",
      fromHatchlingId: h1,
      fromHatchlingName: "Sparky",
      fromBattleId: battleId,
      status: "expired",
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    createdInviteIds.push(inviteId);

    // GET /pending triggers purgeExpiredRematches() before listing.
    const res = await asPlayer(p1, "GET", "/battles/rematch/pending");
    assert.equal(res.status, 200);

    const row = await db.query.rematchInvitesTable.findFirst({
      where: eq(rematchInvitesTable.id, inviteId),
    });
    assert.equal(row, undefined, "stale invite row was hard-deleted after grace window");
  });
});

describe("rematch invites — survive a fresh matchmakingQueue import (restart proxy)", () => {
  it("a pending invite created before the re-import is still readable after it", async () => {
    const p1 = await seedPlayer("i1");
    const p2 = await seedPlayer("i2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const battleId = await seedBattle(p1, p2, h1, h2);

    const create = await asPlayer(p1, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    assert.equal(create.status, 201);
    const inviteId: string = create.body.id;
    createdInviteIds.push(inviteId);

    // Bust the module cache and re-import — proxy for a server restart.
    // Under the old in-memory Map this would have lost the invite; with the
    // table-backed implementation, the freshly-imported service must still
    // see it.
    const fresh = await import(`../../services/matchmakingQueue.ts?fresh=${Date.now()}`);

    const after = await fresh.getRematchInvite(inviteId);
    assert.ok(after, "freshly-imported service still finds the invite");
    assert.equal(after.id, inviteId);
    assert.equal(after.status, "pending");
    assert.equal(after.fromPlayerId, p1);
    assert.equal(after.toPlayerId, p2);

    const pending = await fresh.listPendingRematchInvitesFor(p2);
    assert.ok(pending.some((i: any) => i.id === inviteId));
  });
});
