import { drizzle } from "drizzle-orm/node-postgres";
import { inArray } from "drizzle-orm";
import pg from "pg";
import * as schema from "../schema/index.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const REALM_EVOLUTIONS: (typeof schema.evolutionTypesTable.$inferInsert)[] = [
  // ── Strength ──────────────────────────────────────────────────────────────
  { realm: "strength", category: "strength", stage: 1, evolutionPath: "A", name: "Cragborn Pup",         species: "cragborn",    rarity: "common",    isPrestige: false, requiredXp: 0,    description: "A stocky pup forged from stone.",              imageUrl: null, requiredLevel: 1,  fitnessTypes: ["strength"] },
  { realm: "strength", category: "strength", stage: 2, evolutionPath: "A", name: "Ironwall Drake",       species: "ironwall",    rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Its scales deflect heavy blows.",              imageUrl: null, requiredLevel: 5,  fitnessTypes: ["strength"] },
  { realm: "strength", category: "strength", stage: 3, evolutionPath: "A", name: "Titanheart Colossus",  species: "titanheart",  rarity: "legendary", isPrestige: false, requiredXp: 2000, description: "A walking fortress of living rock.",           imageUrl: null, requiredLevel: 15, fitnessTypes: ["strength"] },
  { realm: "strength", category: "strength", stage: 1, evolutionPath: "B", name: "Ashclaw Whelp",        species: "ashclaw",     rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Burning ambition packed into tiny claws.",     imageUrl: null, requiredLevel: 1,  fitnessTypes: ["strength"] },
  { realm: "strength", category: "strength", stage: 2, evolutionPath: "B", name: "Emberstrike Champion", species: "emberstrike", rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Channels pure power into blazing strikes.",    imageUrl: null, requiredLevel: 5,  fitnessTypes: ["strength"] },
  { realm: "strength", category: "strength", stage: 3, evolutionPath: "C", name: "Magmaveil Sovereign",  species: "magmaveil",   rarity: "prestige",  isPrestige: true,  requiredXp: 5000, description: "Draped in living magma. Prestige locked.",     imageUrl: null, requiredLevel: 30, fitnessTypes: ["strength"] },
  // ── Cardio ────────────────────────────────────────────────────────────────
  { realm: "cardio",   category: "cardio",   stage: 1, evolutionPath: "A", name: "Zephyr Fawn",          species: "zephyr",      rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Swift as a spring breeze.",                    imageUrl: null, requiredLevel: 1,  fitnessTypes: ["cardio"] },
  { realm: "cardio",   category: "cardio",   stage: 2, evolutionPath: "A", name: "Stormwing Racer",      species: "stormwing",   rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Rides thermals at breathtaking speed.",        imageUrl: null, requiredLevel: 5,  fitnessTypes: ["cardio"] },
  { realm: "cardio",   category: "cardio",   stage: 3, evolutionPath: "A", name: "Voltmane Strider",     species: "voltmane",    rarity: "legendary", isPrestige: false, requiredXp: 2000, description: "A lightning-trail marathon runner.",           imageUrl: null, requiredLevel: 15, fitnessTypes: ["cardio"] },
  { realm: "cardio",   category: "cardio",   stage: 1, evolutionPath: "B", name: "Crackle Sprite",       species: "crackle",     rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Sparks with restless electric energy.",        imageUrl: null, requiredLevel: 1,  fitnessTypes: ["cardio"] },
  { realm: "cardio",   category: "cardio",   stage: 2, evolutionPath: "B", name: "Blitzclaw Sentinel",   species: "blitzclaw",   rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Guards the pace with crackling speed.",        imageUrl: null, requiredLevel: 5,  fitnessTypes: ["cardio"] },
  { realm: "cardio",   category: "cardio",   stage: 3, evolutionPath: "C", name: "Galestrike Apex",      species: "galestrike",  rarity: "prestige",  isPrestige: true,  requiredXp: 5000, description: "Untouchable velocity. Prestige locked.",       imageUrl: null, requiredLevel: 30, fitnessTypes: ["cardio"] },
  // ── Balance ───────────────────────────────────────────────────────────────
  { realm: "balance",  category: "balance",  stage: 1, evolutionPath: "A", name: "Lumin Seedling",       species: "lumin",       rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Radiates warm inner calm.",                    imageUrl: null, requiredLevel: 1,  fitnessTypes: ["flexibility", "mindfulness"] },
  { realm: "balance",  category: "balance",  stage: 2, evolutionPath: "A", name: "Crystalvine Sage",     species: "crystalvine", rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Grows stronger through deep stillness.",       imageUrl: null, requiredLevel: 5,  fitnessTypes: ["flexibility", "mindfulness"] },
  { realm: "balance",  category: "balance",  stage: 3, evolutionPath: "A", name: "Aurelius Zenith",      species: "aurelius",    rarity: "legendary", isPrestige: false, requiredXp: 2000, description: "Perfect harmony made manifest.",               imageUrl: null, requiredLevel: 15, fitnessTypes: ["flexibility", "mindfulness"] },
  { realm: "balance",  category: "balance",  stage: 1, evolutionPath: "B", name: "Dewdrop Imp",          species: "dewdrop",     rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Playful and impossibly well-balanced.",        imageUrl: null, requiredLevel: 1,  fitnessTypes: ["flexibility", "mindfulness"] },
  { realm: "balance",  category: "balance",  stage: 2, evolutionPath: "B", name: "Mistsong Dancer",      species: "mistsong",    rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Moves gracefully between rain drops.",         imageUrl: null, requiredLevel: 5,  fitnessTypes: ["flexibility", "mindfulness"] },
  { realm: "balance",  category: "balance",  stage: 3, evolutionPath: "C", name: "Prismweave Oracle",    species: "prismweave",  rarity: "prestige",  isPrestige: true,  requiredXp: 5000, description: "Sees all paths at once. Prestige locked.",     imageUrl: null, requiredLevel: 30, fitnessTypes: ["flexibility", "mindfulness"] },
  // ── Beast ─────────────────────────────────────────────────────────────────
  { realm: "beast",    category: "beast",    stage: 1, evolutionPath: "A", name: "Shadowpaw Runt",       species: "shadowpaw",   rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Fierce instincts packed into a small body.",  imageUrl: null, requiredLevel: 1,  fitnessTypes: ["strength", "cardio"] },
  { realm: "beast",    category: "beast",    stage: 2, evolutionPath: "A", name: "Nightfang Prowler",    species: "nightfang",   rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Stalks prey across dark terrain.",             imageUrl: null, requiredLevel: 5,  fitnessTypes: ["strength", "cardio"] },
  { realm: "beast",    category: "beast",    stage: 3, evolutionPath: "A", name: "Void Apex Predator",   species: "voidapex",    rarity: "legendary", isPrestige: false, requiredXp: 2000, description: "No creature hunts as efficiently.",            imageUrl: null, requiredLevel: 15, fitnessTypes: ["strength", "cardio"] },
  { realm: "beast",    category: "beast",    stage: 1, evolutionPath: "B", name: "Tanglewyrm Hatchling", species: "tanglewyrm",  rarity: "common",    isPrestige: false, requiredXp: 0,    description: "Tangled and wild from the moment of birth.",  imageUrl: null, requiredLevel: 1,  fitnessTypes: ["strength", "cardio"] },
  { realm: "beast",    category: "beast",    stage: 2, evolutionPath: "B", name: "Thornback Ravager",    species: "thornback",   rarity: "rare",      isPrestige: false, requiredXp: 500,  description: "Its spines grow sharper with each battle.",    imageUrl: null, requiredLevel: 5,  fitnessTypes: ["strength", "cardio"] },
  { realm: "beast",    category: "beast",    stage: 3, evolutionPath: "C", name: "Crimson Wyrm Eternal", species: "crimsonwyrm", rarity: "prestige",  isPrestige: true,  requiredXp: 5000, description: "Ancient terror reborn. Prestige locked.",      imageUrl: null, requiredLevel: 30, fitnessTypes: ["strength", "cardio"] },
  // ── Mythic ────────────────────────────────────────────────────────────────
  { realm: "mythic",   category: "mythic",   stage: 1, evolutionPath: "A", name: "Starweave Hatchling",  species: "starweave",   rarity: "rare",      isPrestige: false, requiredXp: 0,    description: "Born from woven cosmic thread.",               imageUrl: null, requiredLevel: 1,  fitnessTypes: ["all"] },
  { realm: "mythic",   category: "mythic",   stage: 2, evolutionPath: "A", name: "Nebula Drifter",       species: "nebula",      rarity: "epic",      isPrestige: false, requiredXp: 500,  description: "Floats serenely between star clusters.",       imageUrl: null, requiredLevel: 5,  fitnessTypes: ["all"] },
  { realm: "mythic",   category: "mythic",   stage: 3, evolutionPath: "A", name: "Celestial Archon",     species: "celestial",   rarity: "legendary", isPrestige: false, requiredXp: 2000, description: "Commands the laws of the cosmos.",             imageUrl: null, requiredLevel: 15, fitnessTypes: ["all"] },
  { realm: "mythic",   category: "mythic",   stage: 1, evolutionPath: "B", name: "Prism Wisp",           species: "prismwisp",   rarity: "rare",      isPrestige: false, requiredXp: 0,    description: "Fractures light into pure magic.",             imageUrl: null, requiredLevel: 1,  fitnessTypes: ["all"] },
  { realm: "mythic",   category: "mythic",   stage: 2, evolutionPath: "B", name: "Voidchime Specter",    species: "voidchime",   rarity: "epic",      isPrestige: false, requiredXp: 500,  description: "Resonates with power across dimensions.",      imageUrl: null, requiredLevel: 5,  fitnessTypes: ["all"] },
  { realm: "mythic",   category: "mythic",   stage: 3, evolutionPath: "C", name: "Etherion Prime",       species: "etherion",    rarity: "prestige",  isPrestige: true,  requiredXp: 5000, description: "The first and last of its kind. Prestige locked.", imageUrl: null, requiredLevel: 30, fitnessTypes: ["all"] },
];

const REALM_NAMES = ["strength", "cardio", "balance", "beast", "mythic"];

async function main() {
  console.log("Seeding realm evolutions — clearing existing entries for 5 realms...");
  await db.delete(schema.evolutionTypesTable).where(
    inArray(schema.evolutionTypesTable.realm, REALM_NAMES)
  );
  console.log("Inserting", REALM_EVOLUTIONS.length, "realm evolution entries...");
  for (const entry of REALM_EVOLUTIONS) {
    await db.insert(schema.evolutionTypesTable).values(entry);
  }
  console.log("Done. 30 realm evolution entries seeded (6 per realm, 5 prestige).");
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
