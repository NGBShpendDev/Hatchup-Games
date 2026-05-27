import { Router } from "express";
import { db } from "@workspace/db";
import { evolutionTypesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ListEvolutionsQueryParams, GetEvolutionParams } from "@workspace/api-zod";

const router = Router();

router.get("/evolutions", async (req, res) => {
  const query = ListEvolutionsQueryParams.safeParse({ category: req.query.category as string | undefined, rarity: req.query.rarity as string | undefined });
  if (!query.success) { res.status(400).json({ error: "Invalid query" }); return; }

  let results = await db.query.evolutionTypesTable.findMany();
  if (query.data.category) results = results.filter(e => e.category === query.data.category);
  if (query.data.rarity) results = results.filter(e => e.rarity === query.data.rarity);
  res.json(results);
});

router.get("/evolutions/categories", async (req, res) => {
  const all = await db.query.evolutionTypesTable.findMany();
  const categoryMap: Record<string, { count: number; rarest: string; color: string | null }> = {};
  const rarityOrder = ["Mythic", "Legendary", "Epic", "Rare", "Common"];

  for (const e of all) {
    if (!categoryMap[e.category]) {
      categoryMap[e.category] = { count: 0, rarest: "Common", color: e.color };
    }
    categoryMap[e.category].count++;
    if (rarityOrder.indexOf(e.rarity) < rarityOrder.indexOf(categoryMap[e.category].rarest)) {
      categoryMap[e.category].rarest = e.rarity;
    }
  }

  const result = Object.entries(categoryMap).map(([category, data]) => ({ category, ...data }));
  res.json(result);
});

router.get("/evolutions/:id", async (req, res) => {
  const params = GetEvolutionParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const evo = await db.query.evolutionTypesTable.findFirst({ where: eq(evolutionTypesTable.id, params.data.id) });
  if (!evo) { res.status(404).json({ error: "Evolution not found" }); return; }
  res.json(evo);
});

export default router;
