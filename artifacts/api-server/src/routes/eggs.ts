import { Router } from "express";
import { db } from "@workspace/db";
import { eggsTable, hatchlingsTable, playersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListEggsQueryParams,
  GetEggParams,
  HatchEggParams,
  HatchEggBody,
  AddEggBody,
} from "@workspace/api-zod";

const router = Router();

const EGG_TYPE_CONFIG: Record<string, {
  stepsRequired: number; name: string; description: string;
  fitnessType: string; species: string; evolutionType: string; color: string;
}> = {
  strength: {
    stepsRequired: 10000, name: "Titan Egg", fitnessType: "strength",
    description: "A heavy, armored egg that pulses with raw power. Hatches gym-born creatures.",
    species: "Titan Hatchling", evolutionType: "strength", color: "#ef4444",
  },
  cardio: {
    stepsRequired: 15000, name: "Storm Egg", fitnessType: "cardio",
    description: "A crackling egg that hums with electric energy. Hatches speed and sky creatures.",
    species: "Storm Hatchling", evolutionType: "cardio", color: "#3b82f6",
  },
  balance: {
    stepsRequired: 8000, name: "Mystic Egg", fitnessType: "balance",
    description: "A glowing orb wrapped in auroras. Hatches healer and aura creatures.",
    species: "Mystic Hatchling", evolutionType: "balance", color: "#8b5cf6",
  },
  beast: {
    stepsRequired: 20000, name: "Rage Egg", fitnessType: "beast",
    description: "A cracked, burning egg that barely contains the creature inside. Hatches combat beasts.",
    species: "Beast Hatchling", evolutionType: "beast", color: "#f97316",
  },
  balanced: {
    stepsRequired: 5000, name: "Mystery Egg", fitnessType: "balanced",
    description: "A shimmering egg that could hatch anything. The easiest egg to hatch.",
    species: "Mystery Hatchling", evolutionType: "balanced", color: "#10b981",
  },
  legendary: {
    stepsRequired: 50000, name: "Legendary Egg", fitnessType: "strength",
    description: "An ancient egg radiating mythic power. Only the most dedicated trainers can hatch this.",
    species: "Legendary Hatchling", evolutionType: "strength", color: "#fbbf24",
  },
};

const SPECIES_BY_FITNESS: Record<string, string[]> = {
  strength: ["Iron Golem", "Titan Drake", "Stone Colossus", "Lava Warden", "Armor Gryphon"],
  cardio:   ["Storm Falcon", "Sky Racer", "Thunder Sprite", "Wind Rider", "Lightning Kite"],
  balance:  ["Aura Wisp", "Celestial Fox", "Healing Crane", "Moonborn Fae", "Serenity Dragon"],
  beast:    ["Shadow Raptor", "Rage Chimera", "Dark Berserker", "Combat Hydra", "Feral Titan"],
  balanced: ["Dragon", "Phoenix", "Crystal Wolf", "Cosmic Cat", "Prism Serpent"],
};

const ABILITIES: Record<string, { name: string; desc: string }[]> = {
  strength: [
    { name: "Iron Fortress", desc: "Hardens shell to reduce incoming damage by 40%" },
    { name: "Seismic Slam", desc: "Channels raw strength for a devastating ground strike" },
  ],
  cardio: [
    { name: "Sonic Dash", desc: "Reaches supersonic speeds for 3 seconds" },
    { name: "Tailwind", desc: "Generates a powerful gust that boosts ally speed" },
  ],
  balance: [
    { name: "Aura Heal", desc: "Radiates calming energy that restores 20% HP to allies" },
    { name: "Celestial Shield", desc: "Creates a protective barrier from starlight energy" },
  ],
  beast: [
    { name: "Rage Mode", desc: "Enters berserk state doubling attack for 5 seconds" },
    { name: "Shadow Strike", desc: "Vanishes into darkness then strikes with lethal precision" },
  ],
  balanced: [
    { name: "Adaptive Burst", desc: "Adapts to any situation with a versatile power surge" },
    { name: "Harmony Wave", desc: "Emits balanced energy that empowers all stats equally" },
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// GET /eggs
router.get("/eggs", async (req, res) => {
  const query = ListEggsQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
    hatched: req.query.hatched !== undefined ? req.query.hatched === "true" : undefined,
  });
  if (!query.success || !query.data.playerId) {
    res.status(400).json({ error: "playerId is required" }); return;
  }

  const conditions = [eq(eggsTable.playerId, query.data.playerId)];
  if (query.data.hatched !== undefined) {
    conditions.push(eq(eggsTable.isHatched, query.data.hatched));
  }

  const eggs = await db.query.eggsTable.findMany({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
  });

  res.json(eggs.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    hatchedAt: e.hatchedAt?.toISOString() ?? null,
    progressPct: Math.min(100, Math.round((e.stepsProgress / e.stepsRequired) * 100)),
    isReady: e.stepsProgress >= e.stepsRequired && !e.isHatched,
  })));
});

// GET /eggs/:id
router.get("/eggs/:id", async (req, res) => {
  const params = GetEggParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const egg = await db.query.eggsTable.findFirst({ where: eq(eggsTable.id, params.data.id) });
  if (!egg) { res.status(404).json({ error: "Egg not found" }); return; }

  res.json({
    ...egg,
    createdAt: egg.createdAt.toISOString(),
    hatchedAt: egg.hatchedAt?.toISOString() ?? null,
    progressPct: Math.min(100, Math.round((egg.stepsProgress / egg.stepsRequired) * 100)),
    isReady: egg.stepsProgress >= egg.stepsRequired && !egg.isHatched,
  });
});

// POST /eggs/:id/hatch
router.post("/eggs/:id/hatch", async (req, res) => {
  const params = HatchEggParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = HatchEggBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const egg = await db.query.eggsTable.findFirst({ where: eq(eggsTable.id, params.data.id) });
  if (!egg) { res.status(404).json({ error: "Egg not found" }); return; }
  if (egg.isHatched) { res.status(400).json({ error: "Egg already hatched" }); return; }
  if (egg.stepsProgress < egg.stepsRequired) {
    res.status(400).json({ error: `Egg needs ${egg.stepsRequired - egg.stepsProgress} more steps to hatch` });
    return;
  }

  const config = EGG_TYPE_CONFIG[egg.eggType] ?? EGG_TYPE_CONFIG["balanced"];
  const speciesList = SPECIES_BY_FITNESS[egg.eggType] ?? SPECIES_BY_FITNESS["balanced"];
  const species = pickRandom(speciesList);
  const abilities = ABILITIES[egg.eggType] ?? ABILITIES["balanced"];
  const ability = pickRandom(abilities);

  const rarityRoll = Math.random();
  const rarity = egg.rarity === "Legendary" ? "Legendary"
    : rarityRoll < 0.02 ? "Mythic"
    : rarityRoll < 0.08 ? "Legendary"
    : rarityRoll < 0.20 ? "Epic"
    : rarityRoll < 0.40 ? "Rare"
    : "Common";

  const isShiny = Math.random() < 0.05;
  const personalities = ["fierce", "gentle", "chaotic", "wise", "energetic", "mysterious", "playful", "stoic"];

  const hatchling = await db.insert(hatchlingsTable).values({
    playerId: body.data.playerId,
    name: body.data.name,
    species,
    rarity,
    category: egg.eggType,
    personality: pickRandom(personalities),
    mood: "excited",
    fitnessType: egg.eggType,
    eggId: egg.id,
    isShiny,
    happiness: 90,
    hunger: 50,
    energy: 100,
    abilityName: ability.name,
    abilityDesc: ability.desc,
    evolutionType: config.evolutionType,
    color: config.color,
  }).returning();

  const updatedEgg = await db.update(eggsTable)
    .set({ isHatched: true, hatchlingId: hatchling[0].id, hatchedAt: new Date() })
    .where(eq(eggsTable.id, egg.id))
    .returning();

  res.json({
    egg: {
      ...updatedEgg[0],
      createdAt: updatedEgg[0].createdAt.toISOString(),
      hatchedAt: updatedEgg[0].hatchedAt?.toISOString() ?? null,
      progressPct: 100,
      isReady: false,
    },
    hatchling: hatchling[0],
  });
});

// POST /eggs/incubate
router.post("/eggs/incubate", async (req, res) => {
  const body = AddEggBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const eggType = body.data.eggType ?? "balanced";
  const config = EGG_TYPE_CONFIG[eggType] ?? EGG_TYPE_CONFIG["balanced"];

  const rarityOverride = body.data.rarity;
  const rarity = rarityOverride ?? (Math.random() < 0.05 ? "Epic" : Math.random() < 0.20 ? "Rare" : "Common");
  const stepsRequired = rarity === "Legendary" ? 50000
    : rarity === "Epic" ? 20000
    : config.stepsRequired;

  const egg = await db.insert(eggsTable).values({
    playerId: body.data.playerId,
    rarity,
    eggType,
    stepsRequired,
    stepsProgress: 0,
    name: config.name,
    description: config.description,
  }).returning();

  res.status(201).json({
    ...egg[0],
    createdAt: egg[0].createdAt.toISOString(),
    hatchedAt: null,
    progressPct: 0,
    isReady: false,
  });
});

export default router;
