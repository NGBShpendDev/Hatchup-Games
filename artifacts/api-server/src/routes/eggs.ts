import { Router } from "express";
import { db } from "@workspace/db";
import { eggsTable, hatchlingsTable } from "@workspace/db";
import { eq, and, count, gte, sql, inArray } from "drizzle-orm";
import {
  ListEggsQueryParams,
  GetEggParams,
  HatchEggParams,
  HatchEggBody,
  AddEggBody,
} from "@workspace/api-zod";
import { requireAuth, attachPlayer, requirePlayerOwnership } from "../middlewares/auth.ts";
import { z } from "zod/v4";

const router = Router();

// ── Realm mapping ──────────────────────────────────────────────────────────────
const EGG_TYPE_TO_REALM: Record<string, string> = {
  strength: "strength",
  cardio: "cardio",
  balance: "balance",
  beast: "beast",
  balanced: "balance",
  legendary: "mythic",
  mythic: "mythic",
};

const EGG_TYPE_CONFIG: Record<string, {
  stepsRequired: number; name: string; description: string;
  fitnessType: string; color: string;
}> = {
  strength: {
    stepsRequired: 10000, name: "Titan Egg", fitnessType: "strength", color: "#ef4444",
    description: "A heavy, magma-veined egg that pulses with raw power. Cracks glow orange-red. Hatches Strength Pals.",
  },
  cardio: {
    stepsRequired: 15000, name: "Storm Egg", fitnessType: "cardio", color: "#06b6d4",
    description: "A crackling egg that arcs with electric energy. Lightning veins pulse in cyan. Hatches Cardio Pals.",
  },
  balance: {
    stepsRequired: 8000, name: "Celestial Egg", fitnessType: "balance", color: "#8b5cf6",
    description: "A glowing orb wrapped in soft auroras and stardust particles. Hatches Balance Pals.",
  },
  beast: {
    stepsRequired: 20000, name: "Shadowrage Egg", fitnessType: "beast", color: "#22c55e",
    description: "A cracked, shadow-pulsing egg that barely contains the primal creature inside. Hatches Beast Pals.",
  },
  balanced: {
    stepsRequired: 5000, name: "Prism Egg", fitnessType: "balanced", color: "#10b981",
    description: "A shimmering prismatic egg that shifts colors. The easiest egg to hatch.",
  },
  legendary: {
    stepsRequired: 50000, name: "Legendary Egg", fitnessType: "strength", color: "#fbbf24",
    description: "An ancient egg radiating mythic cosmic power. Only the most dedicated trainers can hatch this.",
  },
};

// ── Species catalog per realm ──────────────────────────────────────────────────
const SPECIES_BY_REALM: Record<string, string[]> = {
  strength: ["Cragborn Pup", "Ashclaw Whelp", "Ironwall Hatchling", "Emberstrike Cub", "Lavahide Grunt"],
  cardio:   ["Zephyr Fawn", "Crackle Sprite", "Stormwing Chick", "Blitzclaw Runt", "Tailwind Pup"],
  balance:  ["Lumin Seedling", "Dewdrop Imp", "Crescent Wisp", "Auraveil Hatchling", "Starbloom Fae"],
  beast:    ["Shadowpaw Runt", "Tanglewyrm Hatchling", "Razorback Cub", "Predator Whelp", "Grimfang Pup"],
  mythic:   ["Starweave Hatchling", "Prism Wisp", "Nebula Pup", "Paradox Sprite", "Cosmicborn Runt"],
};

// ── Abilities per realm ────────────────────────────────────────────────────────
const ABILITIES_BY_REALM: Record<string, { name: string; desc: string }[]> = {
  strength: [
    { name: "Stone Fist", desc: "Slams the ground causing shockwaves that stagger opponents." },
    { name: "Seismic Slam", desc: "Channels raw strength for a devastating ground strike dealing 3x damage." },
    { name: "Iron Fortress", desc: "Hardens shell to block 60% of incoming damage." },
  ],
  cardio: [
    { name: "Quick Dash", desc: "Surges forward at lightning speed leaving a trail of sparks." },
    { name: "Tailwind Surge", desc: "Generates a powerful gust that accelerates ally speed by 40%." },
    { name: "Static Shock", desc: "Releases a burst of static that stuns opponents for 2 seconds." },
  ],
  balance: [
    { name: "Aura Flare", desc: "Emits a calming aura that reduces opponent aggression by 30%." },
    { name: "Celestial Mend", desc: "Radiates starlight energy restoring 25% HP to all allies." },
    { name: "Mist Veil", desc: "Wraps allies in protective mist reducing incoming damage." },
  ],
  beast: [
    { name: "Feral Lunge", desc: "Leaps from shadows with primal ferocity doubling strike speed." },
    { name: "Shadow Strike", desc: "Vanishes into darkness then strikes with lethal precision dealing 5x damage." },
    { name: "Tangle Bind", desc: "Wraps opponents in muscular coils preventing escape for 3 seconds." },
  ],
  mythic: [
    { name: "Stardust Veil", desc: "Wraps in stardust reducing all damage and dazzling opponents." },
    { name: "Prismatic Burst", desc: "Explodes in a rainbow of energy hitting opponents of every type." },
    { name: "Quantum Strike", desc: "Strikes from 5 dimensions at once making it impossible to dodge." },
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateGenetics() {
  return {
    temperament:   Math.floor(Math.random() * 100),
    energyType:    Math.floor(Math.random() * 100),
    auraColor:     Math.floor(Math.random() * 100),
    physique:      Math.floor(Math.random() * 100),
    loyalty:       Math.floor(Math.random() * 100),
    aggression:    Math.floor(Math.random() * 100),
    mutationChance: Math.floor(Math.random() * 10),
  };
}

function derivePersonality(genetics: ReturnType<typeof generateGenetics>): string {
  const { energyType, loyalty, aggression } = genetics;
  if (energyType < 20) return "Sleepy";
  if (energyType > 80) return "Hyper";
  if (loyalty > 70)   return "Loyal";
  if (aggression > 70) return "Competitive";
  return "Calm";
}

function serializeEgg(e: typeof eggsTable.$inferSelect) {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    hatchedAt: e.hatchedAt?.toISOString() ?? null,
    progressPct: Math.min(100, Math.round((e.stepsProgress / e.stepsRequired) * 100)),
    isReady: e.stepsProgress >= e.stepsRequired && !e.isHatched,
  };
}

// ── Daily egg variety pool ─────────────────────────────────────────────────────
// Weighted: balanced(40%) | strength(20%) | cardio(20%) | balance(10%) | beast(10%)
const DAILY_EGG_TYPE_POOL = [
  "balanced", "balanced", "balanced", "balanced",
  "strength", "strength",
  "cardio", "cardio",
  "balance",
  "beast",
];

function pickDailyRarity(): string {
  const roll = Math.random();
  if (roll < 0.05) return "Epic";
  if (roll < 0.15) return "Rare";
  if (roll < 0.40) return "Uncommon";
  return "Common";
}

const DAILY_CAP = 10;
const INCUBATOR_CAP = 3;

// ── GET /eggs ──────────────────────────────────────────────────────────────────
router.get("/eggs", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const query = ListEggsQueryParams.safeParse({
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
    hatched: req.query.hatched !== undefined ? req.query.hatched === "true" : undefined,
    status: req.query.status as string | undefined,
  });
  if (!query.success || !query.data.playerId) {
    res.status(400).json({ error: "playerId is required" }); return;
  }

  const conditions: ReturnType<typeof eq>[] = [eq(eggsTable.playerId, query.data.playerId)];
  if (query.data.hatched !== undefined) {
    conditions.push(eq(eggsTable.isHatched, query.data.hatched));
  }
  if ((query.data as any).status) {
    conditions.push(eq(eggsTable.status, (query.data as any).status as string));
  }

  const eggs = await db.query.eggsTable.findMany({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  res.json(eggs.map(serializeEgg));
});

// GET /eggs/:id
router.get("/eggs/:id", requireAuth, attachPlayer, async (req, res) => {
  const params = GetEggParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const egg = await db.query.eggsTable.findFirst({ where: eq(eggsTable.id, params.data.id) });
  if (!egg) { res.status(404).json({ error: "Egg not found" }); return; }
  if (egg.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }

  res.json(serializeEgg(egg));
});

// POST /eggs/:id/hatch
router.post("/eggs/:id/hatch", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const params = HatchEggParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = HatchEggBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const egg = await db.query.eggsTable.findFirst({ where: eq(eggsTable.id, params.data.id) });
  if (!egg) { res.status(404).json({ error: "Egg not found" }); return; }
  if (egg.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (egg.isHatched) { res.status(400).json({ error: "Egg already hatched" }); return; }
  if (egg.status === "available") {
    res.status(400).json({ error: "Egg must be incubating before it can hatch. Place it in the incubator first." });
    return;
  }
  if (egg.stepsProgress < egg.stepsRequired) {
    res.status(400).json({ error: `Egg needs ${egg.stepsRequired - egg.stepsProgress} more steps to hatch` });
    return;
  }

  const realm = EGG_TYPE_TO_REALM[egg.eggType] ?? "balance";
  const speciesList = SPECIES_BY_REALM[realm] ?? SPECIES_BY_REALM["balance"];
  const species = pickRandom(speciesList);
  const abilitiesList = ABILITIES_BY_REALM[realm] ?? ABILITIES_BY_REALM["balance"];
  const ability = pickRandom(abilitiesList);
  const config = EGG_TYPE_CONFIG[egg.eggType] ?? EGG_TYPE_CONFIG["balanced"];

  const rarityRoll = Math.random();
  const rarity = egg.rarity === "Celestial" ? "Celestial"
    : egg.rarity === "Ancient" ? "Ancient"
    : egg.rarity === "Legendary" ? "Legendary"
    : egg.eggType === "legendary" ? "Legendary"
    : rarityRoll < 0.001 ? "Celestial"
    : rarityRoll < 0.006 ? "Ancient"
    : rarityRoll < 0.02 ? "Mythic"
    : rarityRoll < 0.08 ? "Legendary"
    : rarityRoll < 0.20 ? "Epic"
    : rarityRoll < 0.40 ? "Rare"
    : rarityRoll < 0.65 ? "Uncommon"
    : "Common";

  const isShiny = Math.random() < 0.05;
  const genetics = generateGenetics();
  const personality = derivePersonality(genetics);

  const hatchling = await db.insert(hatchlingsTable).values({
    playerId: body.data.playerId,
    name: body.data.name,
    species,
    rarity,
    realm,
    category: egg.eggType,
    personality,
    mood: "excited",
    moodState: "happy",
    fitnessType: egg.eggType,
    eggId: egg.id,
    isShiny,
    happiness: 90,
    hunger: 50,
    energy: 100,
    abilityName: ability.name,
    abilityDesc: ability.desc,
    evolutionType: realm,
    color: config.color,
    genetics,
    friendshipLevel: 0,
    evolutionStage: 1,
  }).returning();

  const updatedEgg = await db.update(eggsTable)
    .set({ isHatched: true, status: "hatched", hatchlingId: hatchling[0].id, hatchedAt: new Date() })
    .where(eq(eggsTable.id, egg.id))
    .returning();

  res.json({
    egg: serializeEgg(updatedEgg[0]),
    hatchling: {
      ...hatchling[0],
      createdAt: hatchling[0].createdAt.toISOString(),
    },
  });
});

// POST /eggs/incubate  (legacy — direct-to-incubator, still used by special/reward eggs)
router.post("/eggs/incubate", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = AddEggBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [{ value: activeEggCount }] = await db
    .select({ value: count() })
    .from(eggsTable)
    .where(and(eq(eggsTable.playerId, body.data.playerId), eq(eggsTable.status, "incubating")));
  if (activeEggCount >= INCUBATOR_CAP) {
    res.status(400).json({ error: "incubator_full", message: "Your incubator is full. Hatch an egg to make room." });
    return;
  }

  const eggType = body.data.eggType ?? "balanced";
  const config = EGG_TYPE_CONFIG[eggType] ?? EGG_TYPE_CONFIG["balanced"];
  const realm = EGG_TYPE_TO_REALM[eggType] ?? "balance";

  const rarityOverride = body.data.rarity;
  const rarity = rarityOverride ?? (Math.random() < 0.05 ? "Epic" : Math.random() < 0.20 ? "Rare" : "Common");
  const stepsRequired = rarity === "Celestial" ? 100000
    : rarity === "Ancient" ? 75000
    : rarity === "Legendary" ? 50000
    : rarity === "Epic" ? 20000
    : config.stepsRequired;

  const egg = await db.insert(eggsTable).values({
    playerId: body.data.playerId,
    rarity,
    eggType,
    realm,
    status: "incubating",
    stepsRequired,
    stepsProgress: 0,
    name: config.name,
    description: config.description,
  }).returning();

  res.status(201).json(serializeEgg(egg[0]));
});

// POST /eggs/daily-refill  ── grant up to DAILY_CAP eggs per UTC day
router.post("/eggs/daily-refill", requireAuth, attachPlayer, requirePlayerOwnership, async (req, res) => {
  const body = z.object({ playerId: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const playerId = body.data.playerId;

  // Count daily eggs already granted today (UTC day boundary)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [{ value: alreadyGotToday }] = await db
    .select({ value: count() })
    .from(eggsTable)
    .where(and(
      eq(eggsTable.playerId, playerId),
      eq(eggsTable.source, "daily"),
      gte(eggsTable.createdAt, todayStart),
    ));

  const canGet = Math.max(0, DAILY_CAP - alreadyGotToday);

  const MAX_INCUBATOR_SLOTS = 3;

  // Count how many incubator slots are currently occupied
  const [{ value: incubatingNow }] = await db
    .select({ value: count() })
    .from(eggsTable)
    .where(and(eq(eggsTable.playerId, playerId), eq(eggsTable.status, "incubating")));

  const freeSlots = Math.max(0, MAX_INCUBATOR_SLOTS - incubatingNow);

  let placedInIncubator = 0;

  if (canGet > 0) {
    const newEggs = Array.from({ length: canGet }, (_, i) => {
      const eggType = pickRandom(DAILY_EGG_TYPE_POOL);
      const config = EGG_TYPE_CONFIG[eggType] ?? EGG_TYPE_CONFIG["balanced"];
      const realm = EGG_TYPE_TO_REALM[eggType] ?? "balance";
      const rarity = pickDailyRarity();
      const stepsRequired = rarity === "Epic" ? 20000 : rarity === "Rare" ? 12000 : config.stepsRequired;
      // Auto-place into incubator for the first freeSlots eggs
      const status: "incubating" | "available" = i < freeSlots ? "incubating" : "available";
      return {
        playerId,
        eggType,
        realm,
        rarity,
        stepsRequired,
        stepsProgress: 0,
        name: config.name,
        description: config.description,
        source: "daily" as const,
        status,
      };
    });

    await db.insert(eggsTable).values(newEggs);
    placedInIncubator = Math.min(canGet, freeSlots);
  }

  // Return all available eggs for the player (any unplaced from today + previous days)
  const availableEggs = await db.query.eggsTable.findMany({
    where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.status, "available")),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  res.json({
    eggsGranted: canGet,
    alreadyGotToday: alreadyGotToday,
    remainingToday: 0,
    placedInIncubator,
    availableEggs: availableEggs.map(serializeEgg),
  });
});

// POST /eggs/:id/place  ── move an available egg into the incubator
router.post("/eggs/:id/place", requireAuth, attachPlayer, async (req, res) => {
  const params = GetEggParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }

  const egg = await db.query.eggsTable.findFirst({ where: eq(eggsTable.id, params.data.id) });
  if (!egg) { res.status(404).json({ error: "Egg not found" }); return; }
  if (egg.playerId !== req.playerId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (egg.status !== "available") {
    res.status(400).json({ error: "egg_not_available", message: "This egg is not in your bag." });
    return;
  }

  const [{ value: incubating }] = await db
    .select({ value: count() })
    .from(eggsTable)
    .where(and(eq(eggsTable.playerId, req.playerId!), eq(eggsTable.status, "incubating")));

  if (incubating >= INCUBATOR_CAP) {
    res.status(400).json({ error: "incubator_full", message: "Your incubator is full. Hatch an egg first." });
    return;
  }

  const updated = await db.update(eggsTable)
    .set({ status: "incubating" })
    .where(eq(eggsTable.id, egg.id))
    .returning();

  res.json(serializeEgg(updated[0]));
});

export default router;
