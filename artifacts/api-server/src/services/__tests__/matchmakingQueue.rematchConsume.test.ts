// End-to-end test for the live rematch battle consumption path.
//
// The accept/decline endpoints flip a rematch invite from "pending" to
// "accepted"/"declined", but the *consumption* leg — where both players
// re-enter the battle WebSocket with the same rematchInviteId and the
// matchmaker pairs them into a fresh battle while flipping the invite
// to "consumed" exactly once — had no automated coverage.
//
// This test drives the WS handshake for both players against the real
// `attachBattleWss` + `tryMatch` + `startBattle` pipeline (the
// matchmakingQueue module is **not** mocked), and asserts:
//   1. Both sockets receive a `battle_start` envelope with the same
//      `battleId`, in opposite slots, with the expected `slot1PlayerId`
//      and `slot2PlayerId`.
//   2. The chosen hatchling on the inviter side (slot 1) matches the
//      `fromHatchlingId` recorded on the invite.
//   3. `setRematchInviteStatus(id, "consumed")` runs exactly once.
//   4. The invite row's status ends as "consumed".
//
// Heavy collaborators are mocked: `@workspace/db` is replaced by an
// in-memory fake, `subscriptionGuards.checkAndConsumeBattleCap` and
// `artifactLoadoutService.loadActiveLoadoutModifiers` are stubbed, and
// `@clerk/express` is no-op'd. `battleService` is left real because it
// is pure and the WS server's outbound validation needs a real
// `FighterState` shape to round-trip cleanly.

import { describe, it, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";

// ── In-memory fixtures ───────────────────────────────────────────────────────
interface InviteRow {
  id: string;
  fromPlayerId: number;
  toPlayerId: number;
  mode: "casual" | "ranked";
  fromHatchlingId: number;
  fromHatchlingName: string;
  fromBattleId: number;
  status: "pending" | "accepted" | "declined" | "consumed" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

interface HatchlingRow {
  id: number;
  playerId: number;
  name: string;
  level: number;
  realm: string;
}

interface PlayerRow {
  id: number;
  username: string;
  displayName: string;
  fitnessXp: number;
  totalSteps: number;
  totalWorkouts: number;
  currentStreak: number;
  level: number;
  battleElo: number;
  xp: number;
  coins: number;
  totalBattleWins: number;
}

const state = {
  invites: new Map<string, InviteRow>(),
  hatchlings: new Map<number, HatchlingRow>(),
  players: new Map<number, PlayerRow>(),
  // The auto-incrementing id we hand back from `insert(battlesTable).returning()`.
  nextBattleId: 9000,
  // Track every status mutation against the invite so we can assert
  // "consumed exactly once".
  statusUpdates: [] as Array<{ id: string; status: InviteRow["status"] }>,
};

function resetState() {
  state.invites = new Map();
  state.hatchlings = new Map();
  state.players = new Map();
  state.nextBattleId = 9000;
  state.statusUpdates = [];
}

// ── Module mocks ─────────────────────────────────────────────────────────────
mock.module("@clerk/express", {
  namedExports: {
    getAuth: () => ({ userId: null }),
    clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    requireAuth: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  },
});

// Stub subscription guards so the daily-cap consume is a no-op pass.
mock.module("../subscriptionGuards.ts", {
  namedExports: {
    attachEntitlement: (_req: unknown, _res: unknown, next: () => void) => next(),
    enforceBattleDailyCap: (_req: unknown, _res: unknown, next: () => void) => next(),
    checkAndConsumeBattleCap: async () => ({ ok: true as const }),
  },
});

// Stub artifact loadout so we don't need the artifacts subsystem in DB.
mock.module("../artifactLoadoutService.ts", {
  namedExports: {
    loadActiveLoadoutModifiers: async () => ({
      hpBonus: 0,
      speedBonus: 0,
      energyBonus: 0,
      powerScore: 0,
      equippedArtifacts: [],
    }),
    awardArtifactBattleXp: async () => [],
  },
});

// `drizzle-orm`'s operators are only used by matchmakingQueue to construct
// where-clauses that our fake db introspects shallowly. We carry the bound
// column + value through `eq` so the fake can route lookups by id.
type EqMarker = { __op: "eq"; col: unknown; val: unknown };
mock.module("drizzle-orm", {
  namedExports: {
    eq: (col: unknown, val: unknown): EqMarker => ({ __op: "eq", col, val }),
    and: (...args: unknown[]) => ({ __op: "and", args }),
    or: (...args: unknown[]) => ({ __op: "or", args }),
    lt: () => ({ __op: "lt" }),
    desc: () => ({}),
    inArray: () => ({}),
    sql: Object.assign(
      (_s: TemplateStringsArray, ..._v: unknown[]) => ({}),
      { raw: () => ({}) },
    ),
  },
});

// Column markers — `__t` lets the fake update/insert routes identify the
// target table without us inspecting drizzle internals.
const REMATCH_T = { __t: "rematch_invites" };
const HATCH_T = { __t: "hatchlings" };
const PLAYERS_T = { __t: "players" };
const BATTLES_T = { __t: "battles" };
const NOTIF_T = { __t: "notifications" };

const rematchInvitesTable = {
  ...REMATCH_T,
  id: { __c: "rematch.id" },
  status: { __c: "rematch.status" },
  expiresAt: { __c: "rematch.expiresAt" },
  toPlayerId: { __c: "rematch.toPlayerId" },
  fromPlayerId: { __c: "rematch.fromPlayerId" },
  $inferSelect: undefined as unknown as InviteRow,
};
const hatchlingsTable = { ...HATCH_T, id: { __c: "hatchlings.id" } };
const playersTable = { ...PLAYERS_T, id: { __c: "players.id" } };
const battlesTable = { ...BATTLES_T, id: { __c: "battles.id" } };
const notificationsTable = { ...NOTIF_T };

function valFromEq(where: unknown): unknown {
  if (!where || typeof where !== "object") return undefined;
  const w = where as { __op?: string; val?: unknown; args?: unknown[] };
  if (w.__op === "eq") return w.val;
  if (w.__op === "and" && Array.isArray(w.args)) {
    // For the rematch invite lookup we only care about the id eq.
    for (const a of w.args) {
      const v = valFromEq(a);
      if (typeof v === "string" || typeof v === "number") return v;
    }
  }
  return undefined;
}

const fakeDb = {
  query: {
    rematchInvitesTable: {
      findFirst: async ({ where }: { where?: unknown }) => {
        const id = valFromEq(where) as string | undefined;
        if (!id) return undefined;
        return state.invites.get(id);
      },
      findMany: async () => [],
    },
    hatchlingsTable: {
      findFirst: async ({ where }: { where?: unknown }) => {
        const id = valFromEq(where) as number | undefined;
        if (id === undefined) return undefined;
        return state.hatchlings.get(id);
      },
    },
    playersTable: {
      findFirst: async ({ where }: { where?: unknown }) => {
        const id = valFromEq(where) as number | undefined;
        if (id === undefined) return undefined;
        return state.players.get(id);
      },
    },
    battlesTable: { findFirst: async () => undefined },
  },
  insert: (table: { __t: string }) => ({
    values: (vals: Record<string, unknown>) => {
      const out = {
        async returning() {
          if (table.__t === "battles") {
            const id = state.nextBattleId++;
            return [{ id, ...vals }];
          }
          if (table.__t === "rematch_invites") {
            const row = vals as unknown as InviteRow;
            state.invites.set(row.id, { ...row });
            return [row];
          }
          if (table.__t === "notifications") {
            return [{}];
          }
          return [];
        },
      };
      // Some callsites don't chain `.returning()` (notifications).
      if (table.__t === "notifications") {
        return Promise.resolve();
      }
      return out;
    },
  }),
  update: (table: { __t: string }) => ({
    set: (vals: Record<string, unknown>) => ({
      where: (where: unknown) => ({
        async returning() {
          if (table.__t === "rematch_invites") {
            const id = valFromEq(where) as string | undefined;
            const status = vals.status as InviteRow["status"] | undefined;
            if (id && status) {
              state.statusUpdates.push({ id, status });
              const row = state.invites.get(id);
              if (row) {
                row.status = status;
                return [{ ...row }];
              }
            }
            return [];
          }
          return [];
        },
        // No-await update path (e.g. purgeExpiredRematches, finalize).
        then(resolve: (v: unknown) => void) {
          if (table.__t === "rematch_invites") {
            // No-op: don't touch invites on broad purge updates because
            // they target "pending && expiresAt < now" rows.
          }
          resolve(undefined);
        },
      }),
    }),
  }),
  delete: (_table: unknown) => ({
    where: () => Promise.resolve(),
  }),
};

mock.module("@workspace/db", {
  namedExports: {
    db: fakeDb,
    rematchInvitesTable,
    hatchlingsTable,
    playersTable,
    battlesTable,
    notificationsTable,
  },
});

// ── Imports (must come AFTER mock.module calls) ──────────────────────────────
const { attachBattleWss, issueWsToken } = await import("../matchmakingQueue.ts");

// ── Server setup ─────────────────────────────────────────────────────────────
let server: http.Server;
let baseWsUrl: string;

before(async () => {
  server = http.createServer();
  attachBattleWss(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseWsUrl = `ws://127.0.0.1:${port}/api/ws/battle`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  resetState();
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const INVITER_ID = 101;
const RECIPIENT_ID = 202;
const INVITER_HATCHLING_ID = 1001;
const RECIPIENT_HATCHLING_ID = 2002;
const FROM_BATTLE_ID = 555;
const INVITE_ID = "rematch-invite-xyz";

function seedFixtures() {
  state.players.set(INVITER_ID, {
    id: INVITER_ID, username: "inviter", displayName: "Inviter",
    fitnessXp: 0, totalSteps: 0, totalWorkouts: 0, currentStreak: 0,
    level: 5, battleElo: 1000, xp: 0, coins: 0, totalBattleWins: 0,
  });
  state.players.set(RECIPIENT_ID, {
    id: RECIPIENT_ID, username: "recip", displayName: "Recip",
    fitnessXp: 0, totalSteps: 0, totalWorkouts: 0, currentStreak: 0,
    level: 5, battleElo: 1000, xp: 0, coins: 0, totalBattleWins: 0,
  });
  state.hatchlings.set(INVITER_HATCHLING_ID, {
    id: INVITER_HATCHLING_ID, playerId: INVITER_ID,
    name: "Sparky", level: 5, realm: "balance",
  });
  state.hatchlings.set(RECIPIENT_HATCHLING_ID, {
    id: RECIPIENT_HATCHLING_ID, playerId: RECIPIENT_ID,
    name: "Blaze", level: 5, realm: "balance",
  });
  const now = new Date();
  state.invites.set(INVITE_ID, {
    id: INVITE_ID,
    fromPlayerId: INVITER_ID,
    toPlayerId: RECIPIENT_ID,
    mode: "casual",
    fromHatchlingId: INVITER_HATCHLING_ID,
    fromHatchlingName: "Sparky",
    fromBattleId: FROM_BATTLE_ID,
    // Recipient already accepted via REST — we're picking up at the
    // re-queue step where both sides now reconnect via WS.
    status: "accepted",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
  });
}

interface ConnectedClient {
  ws: WebSocket;
  messages: unknown[];
  waitFor(predicate: (m: any) => boolean, timeoutMs?: number): Promise<any>;
  close(): void;
}

async function connect(playerId: number): Promise<ConnectedClient> {
  const token = issueWsToken(playerId);
  const ws = new WebSocket(`${baseWsUrl}?token=${token}`);
  const messages: unknown[] = [];
  const waiters: Array<{ predicate: (m: any) => boolean; resolve: (m: any) => void }> = [];

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    messages.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.predicate(msg)) {
        waiters[i]!.resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  return {
    ws,
    messages,
    waitFor(predicate, timeoutMs = 3000) {
      const existing = messages.find((m) => predicate(m as any));
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timed out waiting for WS message after ${timeoutMs}ms. Got: ${JSON.stringify(messages)}`));
        }, timeoutMs);
        waiters.push({
          predicate,
          resolve: (m) => { clearTimeout(timer); resolve(m); },
        });
      });
    },
    close() { ws.close(); },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("matchmakingQueue — live rematch consumption via WS", () => {
  it("pairs both players carrying the same rematchInviteId into one battle and flips the invite to consumed exactly once", async () => {
    seedFixtures();

    const inviter = await connect(INVITER_ID);
    const recipient = await connect(RECIPIENT_ID);

    try {
      // Inviter joins first — should land in the queue with no pairing yet.
      inviter.ws.send(JSON.stringify({
        type: "join_queue",
        hatchlingId: INVITER_HATCHLING_ID,
        mode: "casual",
        rematchInviteId: INVITE_ID,
      }));
      const inviterJoined = await inviter.waitFor((m) => m.type === "queue_joined");
      assert.equal(inviterJoined.rematchInviteId, INVITE_ID);

      // Sanity: nothing should have been consumed yet — we're alone in the queue.
      assert.equal(state.statusUpdates.length, 0);
      assert.equal(state.invites.get(INVITE_ID)!.status, "accepted");

      // Recipient joins with the SAME rematchInviteId — pairing fires.
      recipient.ws.send(JSON.stringify({
        type: "join_queue",
        hatchlingId: RECIPIENT_HATCHLING_ID,
        mode: "casual",
        rematchInviteId: INVITE_ID,
      }));

      const [inviterStart, recipientStart] = await Promise.all([
        inviter.waitFor((m) => m.type === "battle_start"),
        recipient.waitFor((m) => m.type === "battle_start"),
      ]);

      // Both sockets are in the SAME battle.
      assert.equal(
        inviterStart.battleId,
        recipientStart.battleId,
        "both rematch participants must land in the same battleId",
      );

      // Slot assignment matches the invite (inviter == fromPlayerId == slot 1).
      assert.equal(inviterStart.slot1PlayerId, INVITER_ID);
      assert.equal(inviterStart.slot2PlayerId, RECIPIENT_ID);
      assert.equal(inviterStart.yourSlot, 1);
      assert.equal(recipientStart.yourSlot, 2);

      // The fighter1 hatchling on the broadcast state matches the
      // hatchling stored on the invite (the inviter's chosen creature).
      const invite = state.invites.get(INVITE_ID)!;
      assert.equal(
        inviterStart.state.fighter1.hatchlingId,
        invite.fromHatchlingId,
        "slot 1 hatchling must match invite.fromHatchlingId",
      );
      assert.equal(inviterStart.state.fighter2.hatchlingId, RECIPIENT_HATCHLING_ID);
      assert.equal(inviterStart.state.fighter1.isBot, false);
      assert.equal(inviterStart.state.fighter2.isBot, false);

      // Invite transitioned accepted → consumed EXACTLY once.
      const consumedUpdates = state.statusUpdates.filter((u) => u.status === "consumed");
      assert.equal(
        consumedUpdates.length,
        1,
        `expected one consumed update, got: ${JSON.stringify(state.statusUpdates)}`,
      );
      assert.equal(consumedUpdates[0]!.id, INVITE_ID);
      assert.equal(state.invites.get(INVITE_ID)!.status, "consumed");
    } finally {
      inviter.close();
      recipient.close();
    }
  });
});
