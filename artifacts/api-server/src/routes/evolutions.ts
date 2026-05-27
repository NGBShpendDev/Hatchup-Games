import { Router } from "express";
import { db } from "@workspace/db";
import { evolutionTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListEvolutionsQueryParams, GetEvolutionParams } from "@workspace/api-zod";

const router = Router();

const REALM_META = [
  {
    id: "strength",
    name: "Strength Realm",
    description: "Forged in iron and volcanic fire. Strength Pals grow powerful through resistance training and heavy lifting.",
    color: "#ef4444",
    auraColor: "#f97316",
    fitnessTypes: ["strength", "weightlifting", "powerlifting", "crossfit"],
  },
  {
    id: "cardio",
    name: "Cardio Realm",
    description: "Born from lightning and wind. Cardio Pals thrive on speed, endurance, and relentless movement.",
    color: "#06b6d4",
    auraColor: "#3b82f6",
    fitnessTypes: ["running", "cycling", "swimming", "hiit", "cardio"],
  },
  {
    id: "balance",
    name: "Balance Realm",
    description: "Woven from starlight and cosmic harmony. Balance Pals heal, protect, and elevate those around them.",
    color: "#8b5cf6",
    auraColor: "#d946ef",
    fitnessTypes: ["yoga", "pilates", "stretching", "meditation", "flexibility"],
  },
  {
    id: "beast",
    name: "Beast Realm",
    description: "Risen from primal shadow and instinct. Beast Pals are untameable hunters who dominate through raw aggression.",
    color: "#22c55e",
    auraColor: "#166534",
    fitnessTypes: ["hiit", "functional", "martial_arts", "sports"],
  },
  {
    id: "mythic",
    name: "Mythic Realm",
    description: "Born at the intersection of all realms. Mythic Pals are impossibly rare — cosmic anomalies that transcend classification.",
    color: "#ec4899",
    auraColor: "#a855f7",
    fitnessTypes: ["all"],
  },
];

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
  const rarityOrder = ["Mythic", "Legendary", "Epic", "Rare", "Uncommon", "Common"];

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

router.get("/evolutions/realms", async (req, res) => {
  const all = await db.query.evolutionTypesTable.findMany();
  const countByRealm: Record<string, number> = {};
  for (const e of all) {
    countByRealm[e.realm] = (countByRealm[e.realm] ?? 0) + 1;
  }
  const result = REALM_META.map(r => ({
    ...r,
    evolutionCount: countByRealm[r.id] ?? 0,
  }));
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
