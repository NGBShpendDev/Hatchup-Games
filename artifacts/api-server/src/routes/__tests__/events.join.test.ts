// Integration tests for POST /events/:id/join — XP grant path.
//
// Covers:
//   - First join of an active event awards EVENT_JOIN_XP (100) to the
//     player's active hatchling and persists the updated xp + level to the DB.
//   - Level-up fires correctly when the XP grant crosses the level threshold.
//   - A second join by the same player is idempotent: xpEarned returns 0 and
//     the hatchling row is unchanged.
//   - Joining a non-existent or non-active event returns the right error codes.
//
// Auth is mocked at the middleware boundary (header-driven impersonation)
// so the real events router runs against the shared Postgres pool.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

// ── Auth mock: header-driven impersonation ────────────────────────────────────
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

const { db } = await import("@workspace/db");
const {
  playersTable,
  hatchlingsTable,
  liveEventsTable,
  eventParticipantsTable,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const eventsRouter = (await import("../events.ts")).default;

// ── Tag for test isolation ────────────────────────────────────────────────────
const TAG = `events-join-${process.pid}-${Date.now()}`;

const createdPlayerIds: number[] = [];
const createdHatchlingIds: number[] = [];
const createdEventIds: number[] = [];
const createdParticipantEventIds: number[] = [];

async function seedPlayer(): Promise<number> {
  const [row] = await db.insert(playersTable).values({
    clerkId: `clerk_${TAG}`,
    username: `player_${TAG}`,
    displayName: "Test Player",
  }).returning();
  createdPlayerIds.push(row!.id);
  return row!.id;
}

async function seedHatchling(playerId: number, opts: { xp?: number; level?: number } = {}): Promise<number> {
  const [row] = await db.insert(hatchlingsTable).values({
    playerId,
    name: `Pal_${TAG}`,
    species: "TestDragon",
    xp: opts.xp ?? 0,
    level: opts.level ?? 1,
  }).returning();
  createdHatchlingIds.push(row!.id);
  return row!.id;
}

async function setActiveHatchling(playerId: number, hatchlingId: number): Promise<void> {
  await db
    .update(playersTable)
    .set({ activeHatchlingId: hatchlingId })
    .where(eq(playersTable.id, playerId));
}

async function seedActiveEvent(): Promise<number> {
  const now = new Date();
  const [row] = await db.insert(liveEventsTable).values({
    name: `TestEvent_${TAG}`,
    description: "Test event for integration tests",
    type: "fitness",
    status: "active",
    startsAt: new Date(now.getTime() - 60_000),
    endsAt: new Date(now.getTime() + 3_600_000),
  }).returning();
  createdEventIds.push(row!.id);
  return row!.id;
}

async function seedUpcomingEvent(): Promise<number> {
  const now = new Date();
  const [row] = await db.insert(liveEventsTable).values({
    name: `TestEvent_upcoming_${TAG}`,
    description: "Upcoming event",
    type: "fitness",
    status: "upcoming",
    startsAt: new Date(now.getTime() + 3_600_000),
    endsAt: new Date(now.getTime() + 7_200_000),
  }).returning();
  createdEventIds.push(row!.id);
  return row!.id;
}

async function seedEndedEvent(endsAt: Date): Promise<number> {
  const [row] = await db.insert(liveEventsTable).values({
    name: `TestEvent_ended_${TAG}`,
    description: "Ended event",
    type: "fitness",
    status: "ended",
    startsAt: new Date(endsAt.getTime() - 3_600_000),
    endsAt,
  }).returning();
  createdEventIds.push(row!.id);
  return row!.id;
}

async function cleanup() {
  if (createdParticipantEventIds.length > 0) {
    await db.delete(eventParticipantsTable).where(
      inArray(eventParticipantsTable.eventId, createdParticipantEventIds),
    );
  }
  if (createdEventIds.length > 0) {
    await db.delete(liveEventsTable).where(inArray(liveEventsTable.id, createdEventIds));
  }
  if (createdHatchlingIds.length > 0) {
    await db.delete(hatchlingsTable).where(inArray(hatchlingsTable.id, createdHatchlingIds));
  }
  if (createdPlayerIds.length > 0) {
    await db.delete(playersTable).where(inArray(playersTable.id, createdPlayerIds));
  }
  createdParticipantEventIds.length = 0;
  createdEventIds.length = 0;
  createdHatchlingIds.length = 0;
  createdPlayerIds.length = 0;
}

// ── Server setup ──────────────────────────────────────────────────────────────
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
  app.use(eventsRouter);
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

// ── HTTP helper ───────────────────────────────────────────────────────────────
interface JsonResp<T = unknown> { status: number; body: T }

async function asPlayer<T = unknown>(playerId: number, path: string): Promise<JsonResp<T>> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-player-id": String(playerId),
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed as T };
}

// ── Shared response shape ─────────────────────────────────────────────────────
interface JoinResp {
  eventId: number;
  joinedAt: string;
  xpEarned: number;
  coinsEarned: number;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("POST /events/:id/join — XP grant on first join", () => {
  it("awards EVENT_JOIN_XP (100) and returns it in the response", async () => {
    const playerId = await seedPlayer();
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    const res = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);

    assert.equal(res.status, 200);
    assert.equal(res.body.eventId, eventId);
    assert.equal(res.body.xpEarned, 100, "xpEarned must equal EVENT_JOIN_XP");
    assert.equal(res.body.coinsEarned, 0);
    assert.ok(typeof res.body.joinedAt === "string", "joinedAt must be an ISO string");
  });

  it("persists the updated XP and level on the active hatchling in the DB", async () => {
    const playerId = await seedPlayer();
    // Start at xp=0, level=1 — 100 XP crosses the first threshold → level 2
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    const res = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);
    assert.equal(res.status, 200);
    assert.equal(res.body.xpEarned, 100);

    const hatchling = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, hatchlingId),
      columns: { xp: true, level: true },
    });
    assert.ok(hatchling, "hatchling row must exist");
    assert.equal(hatchling!.xp, 100, "hatchling xp must be updated to 100");
    // 1 + floor(100 / 100) = 2
    assert.equal(hatchling!.level, 2, "hatchling must have levelled up to 2");
  });

  it("level-up fires correctly when XP crosses a boundary mid-existing total", async () => {
    const playerId = await seedPlayer();
    // Start at xp=90, level=1 — adding 100 → xp=190, level=2 (1+floor(190/100)=2 — already have it; actually 1+1=2)
    // xp=190 → 1 + floor(190/100) = 1 + 1 = 2
    const hatchlingId = await seedHatchling(playerId, { xp: 90, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);

    const hatchling = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, hatchlingId),
      columns: { xp: true, level: true },
    });
    assert.ok(hatchling);
    assert.equal(hatchling!.xp, 190);
    assert.equal(hatchling!.level, 2, "should level up when cumulative XP crosses the 100-point threshold");
  });

  it("targets the activeHatchlingId when set, not just the first hatchling owned", async () => {
    const playerId = await seedPlayer();
    // Seed two hatchlings; set the second as active.
    const firstId = await seedHatchling(playerId, { xp: 0, level: 1 });
    const activeId = await seedHatchling(playerId, { xp: 50, level: 1 });
    await setActiveHatchling(playerId, activeId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);

    const first = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, firstId),
      columns: { xp: true },
    });
    const active = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, activeId),
      columns: { xp: true },
    });

    assert.equal(first!.xp, 0, "non-active hatchling XP must be unchanged");
    assert.equal(active!.xp, 150, "active hatchling must receive the XP grant");
  });
});

describe("POST /events/:id/join — idempotency", () => {
  it("returns xpEarned: 0 on a repeated join attempt (same player, same event)", async () => {
    const playerId = await seedPlayer();
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    // First join — grants XP.
    const first = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);
    assert.equal(first.status, 200);
    assert.equal(first.body.xpEarned, 100);

    // Second join — must be a no-op.
    const second = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);
    assert.equal(second.status, 200);
    assert.equal(second.body.xpEarned, 0, "second join must return xpEarned: 0");
    assert.equal(second.body.eventId, eventId);
  });

  it("does not apply XP a second time — hatchling XP stays at the post-first-join value", async () => {
    const playerId = await seedPlayer();
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    await asPlayer(playerId, `/events/${eventId}/join`);
    await asPlayer(playerId, `/events/${eventId}/join`);

    const hatchling = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, hatchlingId),
      columns: { xp: true, level: true },
    });
    assert.ok(hatchling);
    assert.equal(hatchling!.xp, 100, "XP must only be applied once");
    assert.equal(hatchling!.level, 2, "level must only advance once");
  });
});

describe("POST /events/:id/join — error cases", () => {
  it("returns 404 when the event does not exist", async () => {
    const playerId = await seedPlayer();
    const res = await asPlayer(playerId, "/events/2147483640/join");
    assert.equal(res.status, 404);
  });

  it("returns 409 when the event is not currently active (upcoming)", async () => {
    const playerId = await seedPlayer();
    const eventId = await seedUpcomingEvent();

    const res = await asPlayer(playerId, `/events/${eventId}/join`);
    assert.equal(res.status, 409);
  });

  it("returns 400 for a non-numeric event id", async () => {
    const playerId = await seedPlayer();
    const res = await asPlayer(playerId, "/events/not-an-id/join");
    assert.equal(res.status, 400);
  });

  it("still succeeds (xpEarned: 0) when the player has no hatchlings", async () => {
    // No hatchling seeded — route should complete the join but skip XP.
    const playerId = await seedPlayer();
    const eventId = await seedActiveEvent();
    createdParticipantEventIds.push(eventId);

    const res = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);
    assert.equal(res.status, 200);
    assert.equal(res.body.xpEarned, 0, "no hatchling means no XP, but join must still succeed");
  });
});

describe("POST /events/:id/join — grace-period boundary", () => {
  it("grants XP when the event ended less than 60 seconds ago (within grace window)", async () => {
    const playerId = await seedPlayer();
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    // Event ended 30 seconds ago — still within the 60-second grace window.
    const endsAt = new Date(Date.now() - 30_000);
    const eventId = await seedEndedEvent(endsAt);
    createdParticipantEventIds.push(eventId);

    const res = await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);

    assert.equal(res.status, 200, "join within grace window must succeed");
    assert.equal(res.body.xpEarned, 100, "XP must be granted within grace window");
  });

  it("persists the XP grant to the hatchling when joining within the grace window", async () => {
    const playerId = await seedPlayer();
    const hatchlingId = await seedHatchling(playerId, { xp: 0, level: 1 });
    await setActiveHatchling(playerId, hatchlingId);
    const endsAt = new Date(Date.now() - 30_000);
    const eventId = await seedEndedEvent(endsAt);
    createdParticipantEventIds.push(eventId);

    await asPlayer<JoinResp>(playerId, `/events/${eventId}/join`);

    const hatchling = await db.query.hatchlingsTable.findFirst({
      where: eq(hatchlingsTable.id, hatchlingId),
      columns: { xp: true, level: true },
    });
    assert.ok(hatchling);
    assert.equal(hatchling!.xp, 100, "hatchling XP must be updated after grace-window join");
    assert.equal(hatchling!.level, 2, "hatchling must level up after grace-window XP grant");
  });

  it("returns 409 when the event ended more than 60 seconds ago (beyond grace window)", async () => {
    const playerId = await seedPlayer();
    // Event ended 90 seconds ago — beyond the 60-second grace window.
    const endsAt = new Date(Date.now() - 90_000);
    const eventId = await seedEndedEvent(endsAt);

    const res = await asPlayer(playerId, `/events/${eventId}/join`);

    assert.equal(res.status, 409, "join beyond grace window must be rejected");
  });
});
