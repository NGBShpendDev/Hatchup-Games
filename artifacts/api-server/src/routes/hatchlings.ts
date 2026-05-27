import { Router } from "express";
import { db } from "@workspace/db";
import { hatchlingsTable, evolutionTypesTable, playersTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  ListHatchlingsQueryParams,
  CreateHatchlingBody,
  GetHatchlingParams,
  UpdateHatchlingParams,
  UpdateHatchlingBody,
  DeleteHatchlingParams,
  EvolveHatchlingParams,
  EvolveHatchlingBody,
} from "@workspace/api-zod";

const router = Router();

const PERSONALITIES = ["chaotic", "playful", "sleepy", "shy", "energetic", "mischievous", "heroic", "emotional", "competitive"];
const CATEGORIES = ["dragons", "phoenix", "sharks", "wolves", "dinosaurs", "angels", "demons", "cyber", "cosmic", "slimes", "candy", "shadow", "jungle", "robotic", "crystal"];
const RARITIES = ["Common", "Rare", "Epic", "Legendary", "Mythic"];

router.get("/hatchlings", async (req, res) => {
  const query = ListHatchlingsQueryParams.safeParse({ playerId: req.query.playerId ? Number(req.query.playerId) : undefined, limit: req.query.limit ? Number(req.query.limit) : 20 });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }
  const results = await db.query.hatchlingsTable.findMany({
    where: query.data.playerId ? eq(hatchlingsTable.playerId, query.data.playerId) : undefined,
    limit: query.data.limit ?? 20,
    orderBy: [desc(hatchlingsTable.createdAt)],
  });
  res.json(results);
});

router.post("/hatchlings", async (req, res) => {
  const body = CreateHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
  const rarity = Math.random() < 0.05 ? "Legendary" : Math.random() < 0.15 ? "Epic" : Math.random() < 0.35 ? "Rare" : "Common";

  const hatchling = await db.insert(hatchlingsTable).values({
    playerId: body.data.playerId,
    name: body.data.name,
    species: body.data.species ?? "Mystery Egg",
    personality,
    category,
    rarity,
    mood: "excited",
    happiness: 90,
    hunger: 50,
    energy: 100,
  }).returning();
  res.status(201).json(hatchling[0]);
});

router.get("/hatchlings/showcase", async (req, res) => {
  const results = await db.query.hatchlingsTable.findMany({
    orderBy: [desc(hatchlingsTable.level), desc(hatchlingsTable.xp)],
    limit: 8,
  });
  res.json(results);
});

router.get("/hatchlings/:id", async (req, res) => {
  const params = GetHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!hatchling) { res.status(404).json({ error: "Hatchling not found" }); return; }
  res.json(hatchling);
});

router.patch("/hatchlings/:id", async (req, res) => {
  const params = UpdateHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = UpdateHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const updated = await db.update(hatchlingsTable).set(body.data).where(eq(hatchlingsTable.id, params.data.id)).returning();
  if (!updated.length) { res.status(404).json({ error: "Hatchling not found" }); return; }
  res.json(updated[0]);
});

router.delete("/hatchlings/:id", async (req, res) => {
  const params = DeleteHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(hatchlingsTable).where(eq(hatchlingsTable.id, params.data.id));
  res.status(204).send();
});

router.post("/hatchlings/:id/evolve", async (req, res) => {
  const params = EvolveHatchlingParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = EvolveHatchlingBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, params.data.id) });
  if (!hatchling) { res.status(404).json({ error: "Hatchling not found" }); return; }

  const evolutionType = await db.query.evolutionTypesTable.findFirst({ where: eq(evolutionTypesTable.id, body.data.triggerId) });
  if (!evolutionType) { res.status(404).json({ error: "Evolution type not found" }); return; }

  const updated = await db.update(hatchlingsTable).set({
    evolutionStage: hatchling.evolutionStage + 1,
    evolutionType: evolutionType.name,
    category: evolutionType.category,
    rarity: evolutionType.rarity,
    abilityName: evolutionType.abilityName,
    abilityDesc: evolutionType.abilityDesc,
    imageUrl: evolutionType.imageUrl,
    color: evolutionType.color,
    level: hatchling.level + 2,
    xp: hatchling.xp + 500,
  }).where(eq(hatchlingsTable.id, params.data.id)).returning();

  await db.update(evolutionTypesTable).set({ unlockedCount: evolutionType.unlockedCount + 1 }).where(eq(evolutionTypesTable.id, evolutionType.id));

  res.json(updated[0]);
});

export default router;
