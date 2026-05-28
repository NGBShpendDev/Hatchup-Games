import { Router } from "express";
import { db } from "@workspace/db";
import { clubsTable, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListClubsQueryParams,
  CreateClubBody,
  GetClubParams,
  JoinClubParams,
  JoinClubBody,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer } from "../middlewares/auth.ts";
import type { RequestHandler } from "express";

const router = Router();

router.get("/clubs", async (req, res) => {
  const query = ListClubsQueryParams.safeParse({ limit: req.query.limit ? Number(req.query.limit) : 20 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const results = await db.query.clubsTable.findMany({ limit: query.data.limit ?? 20 });
  res.json(results.map(c => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

router.post("/clubs", requireAuth as RequestHandler, async (req, res) => {
  const body = CreateClubBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const club = await db.insert(clubsTable).values({ ...body.data, description: body.data.description ?? "" }).returning();
  res.status(201).json({ ...club[0], createdAt: club[0].createdAt.toISOString() });
});

router.get("/clubs/:id", async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  res.json({ ...club, createdAt: club.createdAt.toISOString() });
});

router.get("/clubs/:id/members", async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }
  const members = await db.query.playersTable.findMany({
    where: eq(playersTable.clubId, params.data.id),
    columns: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      level: true,
      rank: true,
      totalWins: true,
      clubRole: true,
    },
  });
  res.json(members);
});

router.post("/clubs/:id/join", requireAuth, attachPlayer, async (req, res) => {
  const params = GetClubParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = JoinClubBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  if (body.data.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  const club = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  if (!club) { res.status(404).json({ error: "Club not found" }); return; }

  await db.update(clubsTable).set({ memberCount: club.memberCount + 1 }).where(eq(clubsTable.id, params.data.id));
  await db.update(playersTable).set({ clubId: params.data.id }).where(eq(playersTable.id, req.playerId!));

  const updated = await db.query.clubsTable.findFirst({ where: eq(clubsTable.id, params.data.id) });
  res.json({ ...updated!, createdAt: updated!.createdAt.toISOString() });
});

export default router;
