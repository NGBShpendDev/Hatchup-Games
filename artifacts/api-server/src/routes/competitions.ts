import { Router } from "express";
import { db } from "@workspace/db";
import { competitionsTable, gameModesTable, hatchlingsTable, playersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ListCompetitionsQueryParams,
  CreateCompetitionBody,
  GetCompetitionParams,
  SubmitCompetitionResultParams,
  SubmitCompetitionResultBody,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth.ts";
import { applyHatchlingXp } from "../services/hatchlingXp.ts";

const router = Router();

router.get("/competitions/game-modes", async (req, res) => {
  const modes = await db.query.gameModesTable.findMany();
  res.json(modes.map(m => ({ ...m, isLive: m.isLive === "true" })));
});

router.get("/competitions", async (req, res) => {
  const query = ListCompetitionsQueryParams.safeParse({
    status: req.query.status as string | undefined,
    mode: req.query.mode as string | undefined,
    limit: req.query.limit ? Number(req.query.limit) : 20,
  });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let comps = await db.query.competitionsTable.findMany({
    orderBy: [desc(competitionsTable.createdAt)],
    limit: query.data.limit ?? 20,
  });
  if (query.data.status) comps = comps.filter(c => c.status === query.data.status);
  if (query.data.mode) comps = comps.filter(c => c.mode === query.data.mode);

  const players = await db.query.playersTable.findMany();
  const hatchlings = await db.query.hatchlingsTable.findMany();

  const result = comps.map(c => ({
    ...c,
    playerName: players.find(p => p.id === c.playerId)?.username ?? null,
    hatchlingName: hatchlings.find(h => h.id === c.hatchlingId)?.name ?? null,
  }));

  res.json(result);
});

router.post("/competitions", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = CreateCompetitionBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const comp = await db.insert(competitionsTable).values({
    mode: body.data.mode,
    playerId: body.data.playerId,
    hatchlingId: body.data.hatchlingId,
    status: "active",
    score: 0,
  }).returning();

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, body.data.playerId) });
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, body.data.hatchlingId) });

  res.status(201).json({
    ...comp[0],
    playerName: player?.username ?? null,
    hatchlingName: hatchling?.name ?? null,
  });
});

router.get("/competitions/:id", async (req, res) => {
  const params = GetCompetitionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const comp = await db.query.competitionsTable.findFirst({ where: eq(competitionsTable.id, params.data.id) });
  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, comp.playerId) });
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, comp.hatchlingId) });
  res.json({ ...comp, playerName: player?.username ?? null, hatchlingName: hatchling?.name ?? null });
});

router.post("/competitions/:id/result", requireAuth, attachPlayer, async (req, res) => {
  const params = SubmitCompetitionResultParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = SubmitCompetitionResultBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const comp = await db.query.competitionsTable.findFirst({ where: eq(competitionsTable.id, params.data.id) });
  if (!comp) { res.status(404).json({ error: "Competition not found" }); return; }
  if (comp.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const xpEarned = body.data.score * 2 + (body.data.rank === 1 ? 200 : body.data.rank === 2 ? 100 : 50);
  const coinsEarned = body.data.rank === 1 ? 50 : body.data.rank === 2 ? 30 : 15;

  const updated = await db.update(competitionsTable).set({
    score: body.data.score,
    duration: body.data.duration,
    rank: body.data.rank,
    status: "completed",
    xpEarned,
    coinsEarned,
  }).where(eq(competitionsTable.id, params.data.id)).returning();

  if (body.data.rank === 1) {
    await db.update(playersTable).set({ totalWins: (await db.query.playersTable.findFirst({ where: eq(playersTable.id, comp.playerId) }))?.totalWins ?? 0 + 1, totalMatches: (await db.query.playersTable.findFirst({ where: eq(playersTable.id, comp.playerId) }))?.totalMatches ?? 0 + 1 }).where(eq(playersTable.id, comp.playerId));
  }

  // Award XP to the participating hatchling so level-ups can cross
  // the evolution thresholds (5 and 15) that trigger the share prompt.
  await applyHatchlingXp(comp.hatchlingId, xpEarned).catch(() => undefined);

  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, comp.playerId) });
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, comp.hatchlingId) });
  res.json({ ...updated[0], playerName: player?.username ?? null, hatchlingName: hatchling?.name ?? null });
});

export default router;
