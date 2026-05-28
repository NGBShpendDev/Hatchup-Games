// Contract + integration tests for the battle history/rivals/detail and
// rematch lifecycle endpoints in `routes/battles.ts`.
//
// The rematch *mechanics* are already exercised by
// `battles.rematch.integration.test.ts`. This file's job is to:
//
//   1. Verify viewer-only access on `GET /battles/history`, `GET
//      /battles/rivals`, and `GET /battles/{id}` so a regression that
//      leaked someone else's battle data would fail loudly.
//   2. Parse every interesting response with the generated Zod schemas
//      from `@workspace/api-zod` so any drift between the OpenAPI
//      contract and the actual route output trips the test runner.
//   3. Walk a full rematch invite lifecycle (create → accept by recipient
//      only → 409 on re-accept → decline branch covering either party)
//      with Zod parsing at each step.
//
// Auth is mocked at the middleware boundary so we can stand up the real
// `battles` router against the shared `@workspace/db` Postgres pool.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response, NextFunction } from "express";

// ── Auth mock: header-driven impersonation ───────────────────────────────────
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

// Subscription guards are only wired onto POST /battles/queue/join, which
// these tests don't exercise. Stub them anyway so importing battles.ts
// doesn't pull in the real entitlement/DB checks.
mock.module("../../services/subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: Request, _res: Response, next: NextFunction) => next(),
    enforceBattleDailyCap: (_req: Request, _res: Response, next: NextFunction) => next(),
    checkAndConsumeBattleCap: async () => ({ ok: true }),
  },
});

const { db } = await import("@workspace/db");
const {
  playersTable,
  hatchlingsTable,
  battlesTable,
  notificationsTable,
  rematchInvitesTable,
} = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const battlesRouter = (await import("../battles.ts")).default;
const {
  ListBattleHistoryResponse,
  ListBattleRivalsResponse,
  GetBattleResponse,
  GetBattleRematchResponse,
  ListPendingBattleRematchesResponse,
  AcceptBattleRematchResponse,
  DeclineBattleRematchResponse,
} = await import("@workspace/api-zod");

// Orval emits `BattleRematchInvite` per-operation; `createBattleRematch`
// returns the same shape as `getBattleRematch`, so we reuse that schema
// for the create response too.
const CreateBattleRematchResponse = GetBattleRematchResponse;

// ── Test data tagging ────────────────────────────────────────────────────────
const TAG = `battles-contract-${process.pid}-${Date.now()}`;

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

async function seedBattle(
  p1: number,
  p2: number | null,
  h1: number,
  h2: number | null,
  opts: {
    winnerId?: number | null;
    mode?: "casual" | "ranked";
    eloChange?: number;
    xpAwarded?: number;
    coinsAwarded?: number;
  } = {},
): Promise<number> {
  const [row] = await db.insert(battlesTable).values({
    player1Id: p1,
    player2Id: p2,
    hatchling1Id: h1,
    hatchling2Id: h2,
    winnerId: opts.winnerId ?? null,
    battleMode: opts.mode ?? "casual",
    eloChange: opts.eloChange ?? 0,
    xpAwarded: opts.xpAwarded ?? 0,
    coinsAwarded: opts.coinsAwarded ?? 0,
  }).returning();
  createdBattleIds.push(row!.id);
  return row!.id;
}

async function cleanup() {
  if (createdInviteIds.length > 0) {
    await db.delete(rematchInvitesTable).where(inArray(rematchInvitesTable.id, createdInviteIds));
  }
  if (createdPlayerIds.length > 0) {
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

// ── HTTP helper ──────────────────────────────────────────────────────────────
type JsonResp = { status: number; body: unknown };

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
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

// ── GET /battles/history ─────────────────────────────────────────────────────
describe("GET /battles/history", () => {
  it("returns only the viewer's battles and matches the Zod contract", async () => {
    const viewer = await seedPlayer("h_viewer");
    const opp = await seedPlayer("h_opp");
    const stranger = await seedPlayer("h_stranger");
    const stranger2 = await seedPlayer("h_stranger2");

    const hViewer = await seedHatchling(viewer, "Sparky");
    const hOpp = await seedHatchling(opp, "Blaze");
    const hStranger = await seedHatchling(stranger, "Ghost");
    const hStranger2 = await seedHatchling(stranger2, "Phantom");

    // Two battles the viewer is in (one as p1 win, one as p2 loss).
    await seedBattle(viewer, opp, hViewer, hOpp, { winnerId: viewer, eloChange: 12 });
    await seedBattle(opp, viewer, hOpp, hViewer, { winnerId: opp, eloChange: -8 });

    // One battle between two strangers — must NOT appear in viewer's history.
    await seedBattle(stranger, stranger2, hStranger, hStranger2, { winnerId: stranger });

    const res = await asPlayer(viewer, "GET", "/battles/history");
    assert.equal(res.status, 200);

    const parsed = ListBattleHistoryResponse.parse(res.body);
    assert.equal(parsed.length, 2, "viewer sees only their own battles");

    // Viewer-perspective fields are correct on both rows.
    for (const row of parsed) {
      assert.ok(row.player1Id === viewer || row.player2Id === viewer);
      assert.equal(row.opponentPlayerId, opp);
      const opponentSide = row.isViewer1 ? row.player2Id : row.player1Id;
      assert.equal(opponentSide, opp);
    }
    // The win row reports viewerWon=true; the loss row reports false.
    const winRow = parsed.find(r => r.winnerId === viewer);
    const lossRow = parsed.find(r => r.winnerId === opp);
    assert.ok(winRow && winRow.viewerWon === true);
    assert.ok(lossRow && lossRow.viewerWon === false);
  });

  it("returns an empty array for a player with no battles", async () => {
    const lonely = await seedPlayer("h_lonely");
    const res = await asPlayer(lonely, "GET", "/battles/history");
    assert.equal(res.status, 200);
    const parsed = ListBattleHistoryResponse.parse(res.body);
    assert.deepEqual(parsed, []);
  });

  it("respects the limit query parameter (capped at 20)", async () => {
    const viewer = await seedPlayer("h_limit");
    const opp = await seedPlayer("h_limit_opp");
    const hViewer = await seedHatchling(viewer, "S");
    const hOpp = await seedHatchling(opp, "B");
    for (let i = 0; i < 4; i++) {
      await seedBattle(viewer, opp, hViewer, hOpp, { winnerId: viewer });
    }
    const res = await asPlayer(viewer, "GET", "/battles/history?limit=2");
    assert.equal(res.status, 200);
    const parsed = ListBattleHistoryResponse.parse(res.body);
    assert.equal(parsed.length, 2);
  });
});

// ── GET /battles/rivals ──────────────────────────────────────────────────────
describe("GET /battles/rivals", () => {
  it("only lists human opponents faced 2+ times and matches the Zod contract", async () => {
    const viewer = await seedPlayer("r_viewer");
    const opp = await seedPlayer("r_opp");
    const oneShot = await seedPlayer("r_one_shot");

    const hViewer = await seedHatchling(viewer, "Sparky");
    const hOpp = await seedHatchling(opp, "Blaze");
    const hOne = await seedHatchling(oneShot, "Mist");

    // 2 battles vs `opp` → qualifies as a rival.
    await seedBattle(viewer, opp, hViewer, hOpp, { winnerId: viewer, eloChange: 10 });
    await seedBattle(opp, viewer, hOpp, hViewer, { winnerId: viewer, eloChange: -7 });

    // 1 battle vs `oneShot` → below the 2-battle floor.
    await seedBattle(viewer, oneShot, hViewer, hOne, { winnerId: viewer });

    // A bot battle (player2Id null) — must be skipped entirely.
    await seedBattle(viewer, null, hViewer, null, { winnerId: viewer });
    await seedBattle(viewer, null, hViewer, null, { winnerId: null });

    const res = await asPlayer(viewer, "GET", "/battles/rivals");
    assert.equal(res.status, 200);

    const parsed = ListBattleRivalsResponse.parse(res.body);
    assert.equal(parsed.length, 1, "only opp should appear; oneShot and bots excluded");
    const rival = parsed[0]!;
    assert.equal(rival.opponentId, opp);
    assert.equal(rival.totalBattles, 2);
    assert.equal(rival.wins, 2);
    assert.equal(rival.losses, 0);
    assert.equal(rival.draws, 0);
    assert.equal(rival.lastBattleId > 0, true);
  });
});

// ── GET /battles/{id} ────────────────────────────────────────────────────────
describe("GET /battles/{id}", () => {
  it("returns the row to a participant and parses against the Zod contract", async () => {
    const p1 = await seedPlayer("d_p1");
    const p2 = await seedPlayer("d_p2");
    const h1 = await seedHatchling(p1, "Sparky");
    const h2 = await seedHatchling(p2, "Blaze");
    const id = await seedBattle(p1, p2, h1, h2, {
      winnerId: p1,
      mode: "ranked",
      eloChange: 17,
      xpAwarded: 50,
      coinsAwarded: 10,
    });

    for (const viewer of [p1, p2]) {
      const res = await asPlayer(viewer, "GET", `/battles/${id}`);
      assert.equal(res.status, 200);
      const parsed = GetBattleResponse.parse(res.body);
      assert.equal(parsed.id, id);
      assert.equal(parsed.winnerId, p1);
      assert.equal(parsed.battleMode, "ranked");
      assert.equal(parsed.eloChange, 17);
    }
  });

  it("returns 403 for a non-participant viewer", async () => {
    const p1 = await seedPlayer("d_p1_b");
    const p2 = await seedPlayer("d_p2_b");
    const outsider = await seedPlayer("d_outsider");
    const h1 = await seedHatchling(p1, "S");
    const h2 = await seedHatchling(p2, "B");
    const id = await seedBattle(p1, p2, h1, h2, { winnerId: p1 });

    const res = await asPlayer(outsider, "GET", `/battles/${id}`);
    assert.equal(res.status, 403);
  });

  it("returns 404 for an unknown battle id", async () => {
    const viewer = await seedPlayer("d_missing");
    const res = await asPlayer(viewer, "GET", `/battles/99999999`);
    assert.equal(res.status, 404);
  });
});

// ── Rematch lifecycle with Zod parsing ───────────────────────────────────────
describe("rematch lifecycle (Zod-parsed)", () => {
  it("walks create → accept (recipient only) → 409 on re-accept", async () => {
    const inviter = await seedPlayer("l_inviter");
    const recipient = await seedPlayer("l_recipient");
    const h1 = await seedHatchling(inviter, "Sparky");
    const h2 = await seedHatchling(recipient, "Blaze");
    const battleId = await seedBattle(inviter, recipient, h1, h2);

    // CREATE — parse with the BattleRematchInvite schema.
    const created = await asPlayer(inviter, "POST", "/battles/rematch", {
      battleId,
      hatchlingId: h1,
    });
    assert.equal(created.status, 201);
    const createdInvite = CreateBattleRematchResponse.parse(created.body);
    assert.equal(createdInvite.status, "pending");
    assert.equal(createdInvite.fromPlayerId, inviter);
    assert.equal(createdInvite.toPlayerId, recipient);
    createdInviteIds.push(createdInvite.id);

    // GET single — same schema, must succeed for both sides.
    for (const viewer of [inviter, recipient]) {
      const got = await asPlayer(viewer, "GET", `/battles/rematch/${createdInvite.id}`);
      assert.equal(got.status, 200);
      const parsed = GetBattleRematchResponse.parse(got.body);
      assert.equal(parsed.id, createdInvite.id);
    }

    // /pending list parses against ListPendingBattleRematchesResponse for both parties.
    for (const viewer of [inviter, recipient]) {
      const pending = await asPlayer(viewer, "GET", "/battles/rematch/pending");
      assert.equal(pending.status, 200);
      const parsed = ListPendingBattleRematchesResponse.parse(pending.body);
      assert.ok(parsed.some(i => i.id === createdInvite.id));
    }

    // Only the recipient may accept.
    const wrong = await asPlayer(inviter, "POST", `/battles/rematch/${createdInvite.id}/accept`);
    assert.equal(wrong.status, 403);

    const ok = await asPlayer(recipient, "POST", `/battles/rematch/${createdInvite.id}/accept`);
    assert.equal(ok.status, 200);
    const okBody = AcceptBattleRematchResponse.parse(ok.body);
    assert.equal(okBody.ok, true);
    assert.equal(okBody.inviteId, createdInvite.id);

    // Re-accepting an already-accepted invite returns 409 (status != pending).
    const dup = await asPlayer(recipient, "POST", `/battles/rematch/${createdInvite.id}/accept`);
    assert.equal(dup.status, 409);
  });

  it("either party can decline; only recipient declines notify the inviter", async () => {
    const inviter = await seedPlayer("l_dec_inv");
    const recipient = await seedPlayer("l_dec_rec");
    const h1 = await seedHatchling(inviter, "S");
    const h2 = await seedHatchling(recipient, "B");
    const battleId = await seedBattle(inviter, recipient, h1, h2);

    // Recipient declines.
    const c1 = await asPlayer(inviter, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    const inv1 = CreateBattleRematchResponse.parse(c1.body);
    createdInviteIds.push(inv1.id);

    const decByRecipient = await asPlayer(recipient, "POST", `/battles/rematch/${inv1.id}/decline`);
    assert.equal(decByRecipient.status, 200);
    DeclineBattleRematchResponse.parse(decByRecipient.body);

    // Inviter declines (cancels) a fresh invite.
    const c2 = await asPlayer(inviter, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    const inv2 = CreateBattleRematchResponse.parse(c2.body);
    createdInviteIds.push(inv2.id);

    const decByInviter = await asPlayer(inviter, "POST", `/battles/rematch/${inv2.id}/decline`);
    assert.equal(decByInviter.status, 200);
    DeclineBattleRematchResponse.parse(decByInviter.body);

    // Stranger can't decline a third invite.
    const stranger = await seedPlayer("l_dec_stranger");
    const c3 = await asPlayer(inviter, "POST", "/battles/rematch", { battleId, hatchlingId: h1 });
    const inv3 = CreateBattleRematchResponse.parse(c3.body);
    createdInviteIds.push(inv3.id);

    const decByStranger = await asPlayer(stranger, "POST", `/battles/rematch/${inv3.id}/decline`);
    assert.equal(decByStranger.status, 403);
  });

  it("GET /:id on a past-expiry pending invite flips it to expired and 404s after consumption", async () => {
    const inviter = await seedPlayer("l_exp_inv");
    const recipient = await seedPlayer("l_exp_rec");
    const h1 = await seedHatchling(inviter, "S");
    const h2 = await seedHatchling(recipient, "B");
    const battleId = await seedBattle(inviter, recipient, h1, h2);

    // Insert a pending invite that's just past expiry (within the 60s
    // grace window so the purge job won't hard-delete it before we look).
    const inviteId = `${TAG}_exp_${Math.random().toString(36).slice(2)}`;
    const now = new Date();
    await db.insert(rematchInvitesTable).values({
      id: inviteId,
      fromPlayerId: inviter,
      toPlayerId: recipient,
      mode: "casual",
      fromHatchlingId: h1,
      fromHatchlingName: "Sparky",
      fromBattleId: battleId,
      status: "pending",
      createdAt: new Date(now.getTime() - 6 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 5_000),
    });
    createdInviteIds.push(inviteId);

    const got = await asPlayer(inviter, "GET", `/battles/rematch/${inviteId}`);
    assert.equal(got.status, 200);
    const parsed = GetBattleRematchResponse.parse(got.body);
    assert.equal(parsed.status, "expired");

    // Once expired, accept must NOT succeed — status is no longer "pending".
    const accept = await asPlayer(recipient, "POST", `/battles/rematch/${inviteId}/accept`);
    assert.equal(accept.status, 409);
  });
});
