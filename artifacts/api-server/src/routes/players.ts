import { Router } from "express";
import { db } from "@workspace/db";
import { playersTable, hatchlingsTable, competitionsTable, liveEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  GetPlayerParams,
  UpdatePlayerParams,
  GetPlayerDashboardParams,
} from "@workspace/api-zod";

const router = Router();

router.post("/players", async (req, res) => {
  const body = CreatePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const player = await db
    .insert(playersTable)
    .values({ username: body.data.username, displayName: body.data.displayName, avatarUrl: body.data.avatarUrl })
    .returning();
  res.status(201).json(player[0]);
});

router.get("/players/:id", async (req, res) => {
  const params = GetPlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(player);
});

router.patch("/players/:id", async (req, res) => {
  const params = UpdatePlayerParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdatePlayerBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const updated = await db.update(playersTable).set(body.data).where(eq(playersTable.id, params.data.id)).returning();
  if (!updated.length) { res.status(404).json({ error: "Player not found" }); return; }
  res.json(updated[0]);
});

router.get("/players/:id/dashboard", async (req, res) => {
  const params = GetPlayerDashboardParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, params.data.id) });
  if (!player) { res.status(404).json({ error: "Player not found" }); return; }

  const hatchlings = await db.query.hatchlingsTable.findMany({ where: eq(hatchlingsTable.playerId, params.data.id) });
  const recentComps = await db.query.competitionsTable.findMany({
    where: eq(competitionsTable.playerId, params.data.id),
    orderBy: [desc(competitionsTable.createdAt)],
    limit: 5,
  });
  const activeEvents = await db.query.liveEventsTable.findMany({
    where: eq(liveEventsTable.status, "active"),
    limit: 3,
  });

  const topHatchling = hatchlings.sort((a, b) => b.level - a.level)[0] ?? null;
  const wins = recentComps.filter(c => c.rank === 1).length;
  const winRate = recentComps.length > 0 ? wins / recentComps.length : 0;

  const recentCompsWithNames = recentComps.map(c => ({
    ...c,
    playerName: player.username,
    hatchlingName: hatchlings.find(h => h.id === c.hatchlingId)?.name ?? "Unknown",
  }));

  const activeEventsFormatted = activeEvents.map(e => ({
    ...e,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
  }));

  res.json({
    player,
    hatchlingCount: hatchlings.length,
    totalWins: player.totalWins,
    winRate,
    recentCompetitions: recentCompsWithNames,
    activeEvents: activeEventsFormatted,
    topHatchling,
  });
});

export default router;
