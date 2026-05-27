import { Router } from "express";
import { db } from "@workspace/db";
import { itemsTable, hatchlingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListItemsQueryParams, UseItemBody, UseItemParams } from "@workspace/api-zod";

const router = Router();

router.get("/items", async (req, res) => {
  const query = ListItemsQueryParams.safeParse({ category: req.query.category as string | undefined });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let results = await db.query.itemsTable.findMany();
  if (query.data.category) results = results.filter(i => i.category === query.data.category);
  res.json(results);
});

router.post("/items/:id/use", async (req, res) => {
  const id = Number(req.params.id);
  const body = UseItemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const item = await db.query.itemsTable.findFirst({ where: eq(itemsTable.id, id) });
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const hatchling = await db.query.hatchlingsTable.findFirst({ where: eq(hatchlingsTable.id, body.data.hatchlingId) });
  if (!hatchling) { res.status(404).json({ error: "Hatchling not found" }); return; }

  const updates: Partial<typeof hatchling> = {};
  if (item.effectType === "happiness") updates.happiness = Math.min(100, hatchling.happiness + item.effectValue);
  if (item.effectType === "hunger") updates.hunger = Math.min(100, hatchling.hunger + item.effectValue);
  if (item.effectType === "energy") updates.energy = Math.min(100, hatchling.energy + item.effectValue);
  if (item.effectType === "xp") updates.xp = hatchling.xp + item.effectValue;

  const updated = await db.update(hatchlingsTable).set(updates).where(eq(hatchlingsTable.id, body.data.hatchlingId)).returning();
  res.json(updated[0]);
});

export default router;
