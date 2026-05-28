import { Router } from "express";
import { db } from "@workspace/db";
import { battlesTable, hatchlingsTable, notificationsTable, playersTable } from "@workspace/db";
import { eq, desc, or, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import { attachEntitlement, enforceBattleDailyCap } from "../services/subscriptionGuards.ts";
import {
  issueWsToken,
  createRematchInvite,
  getRematchInvite,
  listPendingRematchInvitesFor,
  setRematchInviteStatus,
  REMATCH_ACCEPT_EXTENSION_MS,
  type RematchInvite,
} from "../services/matchmakingQueue.ts";
import { pushForNotification } from "../services/notificationFanout.ts";

function serializeInvite(inv: RematchInvite, fromName: string | null, toName: string | null) {
  return {
    id: inv.id,
    fromPlayerId: inv.fromPlayerId,
    toPlayerId: inv.toPlayerId,
    fromDisplayName: fromName,
    toDisplayName: toName,
    mode: inv.mode,
    fromHatchlingId: inv.fromHatchlingId,
    fromHatchlingName: inv.fromHatchlingName,
    fromBattleId: inv.fromBattleId,
    status: inv.status,
    createdAt: new Date(inv.createdAt).toISOString(),
    expiresAt: new Date(inv.expiresAt).toISOString(),
  };
}

const router = Router();

// ── POST /battles/queue/join (REST fallback — primary join is via WS) ─────────
router.post("/battles/queue/join", requireAuth, attachPlayer, attachEntitlement, enforceBattleDailyCap, async (req, res) => {
  const body = z.object({ hatchlingId: z.number(), mode: z.enum(["casual", "ranked"]).default("casual") }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const playerId = req.playerId!;
  const { hatchlingId, mode } = body.data;

  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, hatchlingId) });
  if (!hatchling || hatchling.playerId !== playerId) { res.status(403).json({ error: "Invalid hatchling" }); return; }

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (mode === "ranked" && (player?.level ?? 0) < 10) {
    res.status(403).json({ error: "Ranked mode requires player level 10+" });
    return;
  }

  res.json({ ok: true, message: "Connect via WebSocket at /api/ws/battle?playerId=" + playerId });
});

// ── POST /battles/ws-token ────────────────────────────────────────────────────
// Issues a short-lived (60 s) one-time token tied to the authenticated player.
// Frontend uses this token as ?token=<uuid> on the WS handshake so the server
// can verify identity without trusting a client-supplied ?playerId= parameter.
router.post("/battles/ws-token", requireAuth, attachPlayer, (req, res) => {
  const token = issueWsToken(req.playerId!);
  res.json({ token });
});

// ── DELETE /battles/queue/leave ──────────────────────────────────────────────
router.delete("/battles/queue/leave", requireAuth, attachPlayer, async (req, res) => {
  res.json({ ok: true }); // actual queue removal is handled by WS close event
});

// ── GET /battles/history ─────────────────────────────────────────────────────
router.get("/battles/history", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const limit = Math.min(Number(req.query.limit ?? 10), 20);

  const battles = await db.query.battlesTable.findMany({
    where: or(eq(battlesTable.player1Id, playerId), eq(battlesTable.player2Id, playerId)),
    orderBy: [desc(battlesTable.createdAt)],
    limit,
  });

  const allPlayerIds = [...new Set(battles.flatMap(b => [b.player1Id, b.player2Id].filter(Boolean) as number[]))];
  const allHatchlingIds = [...new Set(battles.flatMap(b => [b.hatchling1Id, b.hatchling2Id].filter(Boolean) as number[]))];

  const [players, hatchlings] = await Promise.all([
    allPlayerIds.length ? db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, allPlayerIds) }) : Promise.resolve([]),
    allHatchlingIds.length ? db.query.hatchlingsTable.findMany({ where: (t, { inArray }) => inArray(t.id, allHatchlingIds) }) : Promise.resolve([]),
  ]);

  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));
  const hatchlingMap = Object.fromEntries(hatchlings.map(h => [h.id, h]));

  res.json(battles.map(b => {
    const opponentDbId = b.player1Id === playerId
      ? (b.player2Id ?? null)
      : (b.player1Id ?? null);
    const opponentPlayer = opponentDbId ? playerMap[opponentDbId] : null;
    return {
      ...b,
      createdAt: b.createdAt.toISOString(),
      isViewer1: b.player1Id === playerId,
      viewerWon: b.winnerId === playerId,
      opponent: opponentPlayer?.username ?? "Bot",
      opponentPlayerId: opponentDbId,
      opponentUsername: opponentPlayer?.username ?? null,
      opponentDisplayName: opponentPlayer?.displayName ?? opponentPlayer?.username ?? null,
      myHatchling: b.player1Id === playerId
        ? (b.hatchling1Id ? hatchlingMap[b.hatchling1Id]?.name : null)
        : (b.hatchling2Id ? hatchlingMap[b.hatchling2Id]?.name : null),
      opponentHatchling: b.player1Id === playerId
        ? (b.hatchling2Id ? hatchlingMap[b.hatchling2Id]?.name ?? "Bot" : "Bot")
        : (b.hatchling1Id ? hatchlingMap[b.hatchling1Id]?.name : null),
    };
  }));
});

// ── GET /battles/rivals ──────────────────────────────────────────────────────
// Head-to-head record vs each opponent (only humans) you've faced 2+ times.
router.get("/battles/rivals", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);

  const battles = await db.query.battlesTable.findMany({
    where: or(eq(battlesTable.player1Id, playerId), eq(battlesTable.player2Id, playerId)),
    orderBy: [desc(battlesTable.createdAt)],
  });

  type RivalAgg = {
    opponentId: number;
    totalBattles: number;
    wins: number;
    losses: number;
    draws: number;
    lastBattleAt: Date;
    lastBattleId: number;
    lastEloChange: number;       // most recent battle's ELO delta, from viewer's perspective
    streakType: "W" | "L" | "D"; // outcome type of the current streak
    streakCount: number;         // length of the current streak (most recent run of same outcome)
    streakBuilding: boolean;     // internal: still extending the streak while iterating
  };
  const byOpponent = new Map<number, RivalAgg>();

  // `battles` is ordered desc by createdAt — so the first time we see an opponent
  // is their most-recent battle, and the streak is the leading run of same outcomes.
  for (const b of battles) {
    const opponentId = b.player1Id === playerId ? b.player2Id : b.player1Id;
    if (!opponentId) continue; // skip bots

    const outcome: "W" | "L" | "D" =
      b.winnerId == null ? "D" : b.winnerId === playerId ? "W" : "L";
    const viewerEloDelta = b.player1Id === playerId ? b.eloChange : -b.eloChange;

    let agg = byOpponent.get(opponentId);
    if (!agg) {
      agg = {
        opponentId,
        totalBattles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        lastBattleAt: b.createdAt,
        lastBattleId: b.id,
        lastEloChange: viewerEloDelta,
        streakType: outcome,
        streakCount: 0,
        streakBuilding: true,
      };
      byOpponent.set(opponentId, agg);
    }
    agg.totalBattles += 1;
    if (outcome === "D") agg.draws += 1;
    else if (outcome === "W") agg.wins += 1;
    else agg.losses += 1;

    if (agg.streakBuilding) {
      if (outcome === agg.streakType) agg.streakCount += 1;
      else agg.streakBuilding = false;
    }
  }

  const rivals = [...byOpponent.values()]
    .filter(r => r.totalBattles >= 2)
    .sort((a, b) => {
      if (b.totalBattles !== a.totalBattles) return b.totalBattles - a.totalBattles;
      return b.lastBattleAt.getTime() - a.lastBattleAt.getTime();
    })
    .slice(0, limit);

  if (rivals.length === 0) { res.json([]); return; }

  const opponentIds = rivals.map(r => r.opponentId);
  const players = await db.query.playersTable.findMany({
    where: (t, { inArray }) => inArray(t.id, opponentIds),
  });
  const playerMap = new Map(players.map(p => [p.id, p]));

  res.json(rivals.map(r => {
    const opp = playerMap.get(r.opponentId);
    return {
      opponentId: r.opponentId,
      opponentUsername: opp?.username ?? null,
      opponentDisplayName: opp?.displayName ?? opp?.username ?? null,
      totalBattles: r.totalBattles,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      lastBattleAt: r.lastBattleAt.toISOString(),
      lastBattleId: r.lastBattleId,
      lastEloChange: r.lastEloChange,
      streakType: r.streakType,
      streakCount: r.streakCount,
    };
  }));
});

// ── GET /battles/rivals/:opponentId ──────────────────────────────────────────
// Full head-to-head battle log between the viewer and a specific opponent.
// Reverse-chronological. Includes hatchling names, outcome, mode, ELO change.
router.get("/battles/rivals/:opponentId", requireAuth, attachPlayer, async (req, res) => {
  const playerId = req.playerId!;
  const opponentId = Number(req.params.opponentId);
  if (!Number.isFinite(opponentId) || opponentId <= 0 || opponentId === playerId) {
    res.status(400).json({ error: "Invalid opponentId" });
    return;
  }

  const battles = await db.query.battlesTable.findMany({
    where: or(
      and(eq(battlesTable.player1Id, playerId), eq(battlesTable.player2Id, opponentId)),
      and(eq(battlesTable.player1Id, opponentId), eq(battlesTable.player2Id, playerId)),
    ),
    orderBy: [desc(battlesTable.createdAt)],
  });

  const opponent = await db.query.playersTable.findFirst({ where: eq(playersTable.id, opponentId) });
  if (!opponent) { res.status(404).json({ error: "Opponent not found" }); return; }

  const hatchlingIds = [...new Set(
    battles.flatMap(b => [b.hatchling1Id, b.hatchling2Id].filter(Boolean) as number[])
  )];
  const hatchlings = hatchlingIds.length
    ? await db.query.hatchlingsTable.findMany({ where: (t, { inArray }) => inArray(t.id, hatchlingIds) })
    : [];
  const hatchlingMap = new Map(hatchlings.map(h => [h.id, h]));

  let wins = 0, losses = 0, draws = 0;
  let viewerEloDelta = 0;
  for (const b of battles) {
    if (b.winnerId == null) draws += 1;
    else if (b.winnerId === playerId) wins += 1;
    else losses += 1;
    // eloChange is stored from player1's perspective; flip if viewer is player2.
    viewerEloDelta += b.player1Id === playerId ? b.eloChange : -b.eloChange;
  }

  const log = battles.map(b => {
    const viewerIs1 = b.player1Id === playerId;
    const myHatchlingId = viewerIs1 ? b.hatchling1Id : b.hatchling2Id;
    const oppHatchlingId = viewerIs1 ? b.hatchling2Id : b.hatchling1Id;
    const viewerWon = b.winnerId != null && b.winnerId === playerId;
    const opponentWon = b.winnerId != null && b.winnerId === opponentId;
    return {
      id: b.id,
      createdAt: b.createdAt.toISOString(),
      battleMode: b.battleMode,
      outcome: b.winnerId == null ? "draw" : viewerWon ? "win" : opponentWon ? "loss" : "loss",
      viewerWon,
      myHatchlingId: myHatchlingId ?? null,
      myHatchlingName: myHatchlingId ? hatchlingMap.get(myHatchlingId)?.name ?? null : null,
      opponentHatchlingId: oppHatchlingId ?? null,
      opponentHatchlingName: oppHatchlingId ? hatchlingMap.get(oppHatchlingId)?.name ?? null : null,
      eloChange: viewerIs1 ? b.eloChange : -b.eloChange,
      xpAwarded: b.xpAwarded,
      coinsAwarded: b.coinsAwarded,
    };
  });

  res.json({
    opponentId,
    opponentUsername: opponent.username,
    opponentDisplayName: opponent.displayName ?? opponent.username ?? null,
    opponentBattleElo: opponent.battleElo,
    totalBattles: battles.length,
    wins,
    losses,
    draws,
    viewerEloDelta,
    lastBattleId: battles[0]?.id ?? null,
    lastBattleAt: battles[0]?.createdAt.toISOString() ?? null,
    battles: log,
  });
});

// ── GET /battles/:id ─────────────────────────────────────────────────────────
router.get("/battles/:id", requireAuth, attachPlayer, async (req, res) => {
  const battleId = Number(req.params.id);
  const battle = await db.query.battlesTable.findFirst({ where: eq(battlesTable.id, battleId) });
  if (!battle) { res.status(404).json({ error: "Battle not found" }); return; }

  const playerId = req.playerId!;
  if (battle.player1Id !== playerId && battle.player2Id !== playerId) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  res.json({ ...battle, createdAt: battle.createdAt.toISOString() });
});

// ── POST /battles/rematch — send a rematch challenge to a previous opponent ─
router.post("/battles/rematch", requireAuth, attachPlayer, async (req, res) => {
  const parsed = z.object({
    battleId: z.number().int().positive(),
    hatchlingId: z.number().int().positive(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const me = req.playerId!;
  const { battleId, hatchlingId } = parsed.data;

  const battle = await db.query.battlesTable.findFirst({ where: eq(battlesTable.id, battleId) });
  if (!battle) { res.status(404).json({ error: "Battle not found" }); return; }
  if (battle.player1Id !== me && battle.player2Id !== me) {
    res.status(403).json({ error: "Not a participant in that battle" });
    return;
  }
  const opponentId = battle.player1Id === me ? battle.player2Id : battle.player1Id;
  if (!opponentId) { res.status(400).json({ error: "Cannot rematch a bot" }); return; }

  // Verify the chosen hatchling belongs to the caller.
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, hatchlingId) });
  if (!hatchling || hatchling.playerId !== me) {
    res.status(403).json({ error: "Invalid hatchling" });
    return;
  }

  const [me_, opp] = await Promise.all([
    db.query.playersTable.findFirst({ where: eq(playersTable.id, me) }),
    db.query.playersTable.findFirst({ where: eq(playersTable.id, opponentId) }),
  ]);
  if (!opp) { res.status(404).json({ error: "Opponent not found" }); return; }

  const mode = (battle.battleMode === "ranked" ? "ranked" : "casual") as "casual" | "ranked";

  const invite = await createRematchInvite({
    fromPlayerId: me,
    toPlayerId: opponentId,
    mode,
    fromHatchlingId: hatchlingId,
    fromHatchlingName: hatchling.name,
    fromBattleId: battleId,
  });

  const fromName = me_?.displayName ?? me_?.username ?? `Player #${me}`;
  // Drop a persistent in-app notification so the opponent sees it in their inbox.
  try {
    const notif = {
      playerId: opponentId,
      type: "rematch_invite",
      title: `${fromName} wants a rematch!`,
      body: `${mode === "ranked" ? "Ranked" : "Casual"} battle · expires in 5 minutes`,
      link: `/compete/battle?rematch=${invite.id}`,
      sourceId: battleId,
    };
    await db.insert(notificationsTable).values(notif);
    void pushForNotification(notif, { tag: `rematch-invite-${invite.id}` });
  } catch {
    // Non-fatal: invite still exists and can be polled from the pending list.
  }

  res.status(201).json(serializeInvite(invite, fromName, opp.displayName ?? opp.username ?? null));
});

// ── GET /battles/rematch/pending — pending rematch invites involving me ──────
router.get("/battles/rematch/pending", requireAuth, attachPlayer, async (req, res) => {
  const me = req.playerId!;
  const invites = await listPendingRematchInvitesFor(me);
  const playerIds = [...new Set(invites.flatMap(i => [i.fromPlayerId, i.toPlayerId]))];
  const players = playerIds.length
    ? await db.query.playersTable.findMany({ where: (t, { inArray }) => inArray(t.id, playerIds) })
    : [];
  const nameById = new Map(players.map(p => [p.id, p.displayName ?? p.username ?? `Player #${p.id}`]));
  res.json(invites.map(i => serializeInvite(i, nameById.get(i.fromPlayerId) ?? null, nameById.get(i.toPlayerId) ?? null)));
});

// ── GET /battles/rematch/:id — fetch a single invite by id ───────────────────
router.get("/battles/rematch/:id", requireAuth, attachPlayer, async (req, res) => {
  const me = req.playerId!;
  const inv = await getRematchInvite(String(req.params.id ?? ""));
  if (!inv) { res.status(404).json({ error: "Invite not found or expired" }); return; }
  if (inv.fromPlayerId !== me && inv.toPlayerId !== me) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  const players = await db.query.playersTable.findMany({
    where: (t, { inArray }) => inArray(t.id, [inv.fromPlayerId, inv.toPlayerId]),
  });
  const nameById = new Map(players.map(p => [p.id, p.displayName ?? p.username ?? `Player #${p.id}`]));
  res.json(serializeInvite(inv, nameById.get(inv.fromPlayerId) ?? null, nameById.get(inv.toPlayerId) ?? null));
});

// ── POST /battles/rematch/:id/accept ─────────────────────────────────────────
router.post("/battles/rematch/:id/accept", requireAuth, attachPlayer, async (req, res) => {
  const me = req.playerId!;
  const inv = await getRematchInvite(String(req.params.id ?? ""));
  if (!inv) { res.status(404).json({ error: "Invite not found or expired" }); return; }
  if (inv.toPlayerId !== me) { res.status(403).json({ error: "Only the recipient can accept" }); return; }
  if (inv.status !== "pending") { res.status(409).json({ error: `Invite is ${inv.status}` }); return; }

  // Extend expiry on accept so the pair has a full window to actually meet
  // in the matchmaking queue. Without this, a recipient who accepts at
  // ~4:59 into the 5-minute TTL would see the row hard-deleted before the
  // inviter could finish joining the WS queue. (Task #355)
  await setRematchInviteStatus(inv.id, "accepted", {
    extendExpiresByMs: REMATCH_ACCEPT_EXTENSION_MS,
  });

  // Notify the inviter so they can hop into the queue.
  const me_ = await db.query.playersTable.findFirst({ where: eq(playersTable.id, me) });
  const acceptorName = me_?.displayName ?? me_?.username ?? `Player #${me}`;
  try {
    const notif = {
      playerId: inv.fromPlayerId,
      type: "rematch_invite",
      title: `${acceptorName} accepted your rematch!`,
      body: "Tap to enter the arena.",
      link: `/compete/battle?rematch=${inv.id}`,
      sourceId: inv.fromBattleId,
    };
    await db.insert(notificationsTable).values(notif);
    void pushForNotification(notif, { tag: `rematch-accept-${inv.id}` });
  } catch { /* non-fatal */ }

  res.json({ ok: true, inviteId: inv.id });
});

// ── POST /battles/rematch/:id/decline ────────────────────────────────────────
router.post("/battles/rematch/:id/decline", requireAuth, attachPlayer, async (req, res) => {
  const me = req.playerId!;
  const inv = await getRematchInvite(String(req.params.id ?? ""));
  if (!inv) { res.status(404).json({ error: "Invite not found or expired" }); return; }
  if (inv.toPlayerId !== me && inv.fromPlayerId !== me) {
    res.status(403).json({ error: "Not a participant" });
    return;
  }
  if (inv.status === "pending" || inv.status === "accepted") {
    await setRematchInviteStatus(inv.id, "declined");
    if (inv.toPlayerId === me) {
      // Tell the inviter their challenge was declined.
      const me_ = await db.query.playersTable.findFirst({ where: eq(playersTable.id, me) });
      const declinerName = me_?.displayName ?? me_?.username ?? `Player #${me}`;
      try {
        const notif = {
          playerId: inv.fromPlayerId,
          type: "rematch_invite",
          title: `${declinerName} declined your rematch`,
          body: "Maybe next time.",
          link: `/compete`,
          sourceId: inv.fromBattleId,
        };
        await db.insert(notificationsTable).values(notif);
        void pushForNotification(notif, { tag: `rematch-decline-${inv.id}` });
      } catch { /* non-fatal */ }
    }
  }
  res.json({ ok: true });
});

// ── GET /leaderboards/battle-elo ─────────────────────────────────────────────
router.get("/leaderboards/battle-elo", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 100);
  const players = await db.query.playersTable.findMany({
    orderBy: [desc(playersTable.battleElo)],
    limit,
  });

  res.json(players.map((p, i) => ({
    rank: i + 1,
    playerId: p.id,
    username: p.username,
    displayName: p.displayName,
    battleElo: p.battleElo,
    totalBattleWins: p.totalBattleWins,
    level: p.level,
  })));
});

export default router;
