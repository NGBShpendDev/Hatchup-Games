import { drizzle } from "drizzle-orm/node-postgres";
import { inArray } from "drizzle-orm";
import pg from "pg";
import * as schema from "../schema/index.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type EvoInsert = typeof schema.evolutionTypesTable.$inferInsert;

const REALM_COLORS: Record<string, string> = {
  strength: "#ef4444",
  cardio:   "#06b6d4",
  balance:  "#8b5cf6",
  beast:    "#22c55e",
  mythic:   "#ec4899",
};

const EVOLUTIONS: EvoInsert[] = [
  // ── STRENGTH ──────────────────────────────────────────────────────────────
  {
    realm: "strength", category: "strength", stage: 1, evolutionPath: "A",
    name: "Cragborn Pup",        rarity: "common",    isPrestige: false,
    description: "A stocky pup forged from stone and iron will.",
    unlockHint: "Log 3 strength workouts to unlock.",
    abilityName: "Stone Pounce", abilityDesc: "Launches into a rock-hard tackle. +8 STR.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  {
    realm: "strength", category: "strength", stage: 2, evolutionPath: "A",
    name: "Ironwall Drake",      rarity: "rare",      isPrestige: false,
    description: "Its iron-threaded scales deflect the heaviest blows.",
    unlockHint: "Reach 500 strength XP.",
    abilityName: "Iron Bulwark", abilityDesc: "Raises an impenetrable shield. +15 DEF.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  {
    realm: "strength", category: "strength", stage: 3, evolutionPath: "A",
    name: "Titanheart Colossus", rarity: "legendary", isPrestige: false,
    description: "A walking fortress of living rock. Mountains bow to its steps.",
    unlockHint: "Reach 2000 strength XP.",
    abilityName: "Titan Slam",   abilityDesc: "Shakes the earth with one fist. +40 STR. AoE.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  {
    realm: "strength", category: "strength", stage: 1, evolutionPath: "B",
    name: "Ashclaw Whelp",       rarity: "common",    isPrestige: false,
    description: "Burning ambition crammed into tiny razor claws.",
    unlockHint: "Complete your first strength workout.",
    abilityName: "Ember Rake",   abilityDesc: "Slashes with heated claws. Inflicts Burn.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  {
    realm: "strength", category: "strength", stage: 2, evolutionPath: "B",
    name: "Emberstrike Champion", rarity: "rare",     isPrestige: false,
    description: "Channels raw power into blazing, explosive strikes.",
    unlockHint: "Reach 500 strength XP via Path B.",
    abilityName: "Combustion Blow", abilityDesc: "Ignites on contact. +20 ATK, Burn 3 turns.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  {
    realm: "strength", category: "strength", stage: 3, evolutionPath: "C",
    name: "Magmaveil Sovereign",  rarity: "prestige", isPrestige: true,
    description: "Draped in rivers of living magma. Earned only by elite strength athletes.",
    unlockHint: "Prestige unlock: complete the Magma Trial event.",
    abilityName: "Molten Crown",  abilityDesc: "Wraps enemy in magma. +60 ATK, ignores DEF.",
    color: REALM_COLORS.strength, imageUrl: null,
  },
  // ── CARDIO ────────────────────────────────────────────────────────────────
  {
    realm: "cardio", category: "cardio", stage: 1, evolutionPath: "A",
    name: "Zephyr Fawn",         rarity: "common",    isPrestige: false,
    description: "Swift and light as a spring breeze, never still.",
    unlockHint: "Log your first cardio workout.",
    abilityName: "Wind Dash",    abilityDesc: "Vanishes in a gust. Grants Evasion for 2 turns.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  {
    realm: "cardio", category: "cardio", stage: 2, evolutionPath: "A",
    name: "Stormwing Racer",     rarity: "rare",      isPrestige: false,
    description: "Surfs thermals at breathtaking velocity. Never tires.",
    unlockHint: "Reach 500 cardio XP.",
    abilityName: "Tailwind Surge", abilityDesc: "Accelerates all allies. +12 SPD for 3 turns.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  {
    realm: "cardio", category: "cardio", stage: 3, evolutionPath: "A",
    name: "Voltmane Strider",    rarity: "legendary", isPrestige: false,
    description: "Leaves a lightning trail across the marathon course.",
    unlockHint: "Reach 2000 cardio XP.",
    abilityName: "Lightning Sprint", abilityDesc: "Crosses any distance instantly. Stuns enemy.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  {
    realm: "cardio", category: "cardio", stage: 1, evolutionPath: "B",
    name: "Crackle Sprite",      rarity: "common",    isPrestige: false,
    description: "Sparks with restless electric energy day and night.",
    unlockHint: "Log 3 cardio sessions.",
    abilityName: "Static Hop",   abilityDesc: "Leaps with a shock. +6 SPD, stuns 1 turn.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  {
    realm: "cardio", category: "cardio", stage: 2, evolutionPath: "B",
    name: "Blitzclaw Sentinel",  rarity: "rare",      isPrestige: false,
    description: "Patrols the pace line with crackling, electric speed.",
    unlockHint: "Reach 500 cardio XP via Path B.",
    abilityName: "Thunder Guard", abilityDesc: "Electrifies perimeter. Reflects 25% damage.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  {
    realm: "cardio", category: "cardio", stage: 3, evolutionPath: "C",
    name: "Galestrike Apex",     rarity: "prestige",  isPrestige: true,
    description: "Untouchable velocity. Earned only by elite endurance athletes.",
    unlockHint: "Prestige unlock: finish the Galestrike Ultra event.",
    abilityName: "Apex Burst",   abilityDesc: "Breaks the sound barrier. Instant KO on 1 target.",
    color: REALM_COLORS.cardio, imageUrl: null,
  },
  // ── BALANCE ───────────────────────────────────────────────────────────────
  {
    realm: "balance", category: "balance", stage: 1, evolutionPath: "A",
    name: "Lumin Seedling",      rarity: "common",    isPrestige: false,
    description: "Radiates warm inner calm from its first breath.",
    unlockHint: "Log your first yoga or flexibility session.",
    abilityName: "Soothing Glow", abilityDesc: "Heals the team for 10 HP per turn.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  {
    realm: "balance", category: "balance", stage: 2, evolutionPath: "A",
    name: "Crystalvine Sage",    rarity: "rare",      isPrestige: false,
    description: "Its crystalline vines grow stronger through deep stillness.",
    unlockHint: "Reach 500 balance XP.",
    abilityName: "Vine Meditation", abilityDesc: "Regenerates full HP over 3 turns. Silences.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  {
    realm: "balance", category: "balance", stage: 3, evolutionPath: "A",
    name: "Aurelius Zenith",     rarity: "legendary", isPrestige: false,
    description: "Perfect harmony made manifest. Every motion is inevitable.",
    unlockHint: "Reach 2000 balance XP.",
    abilityName: "Zenith Pulse", abilityDesc: "Radiates peace. Buffs all stats +20 for the team.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  {
    realm: "balance", category: "balance", stage: 1, evolutionPath: "B",
    name: "Dewdrop Imp",         rarity: "common",    isPrestige: false,
    description: "Playful and impossibly well-balanced from the first step.",
    unlockHint: "Complete a mindfulness session.",
    abilityName: "Dewdrop Dodge", abilityDesc: "Slips between attacks. +15% evasion rate.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  {
    realm: "balance", category: "balance", stage: 2, evolutionPath: "B",
    name: "Mistsong Dancer",     rarity: "rare",      isPrestige: false,
    description: "Moves gracefully through rain drops without disturbing a single one.",
    unlockHint: "Reach 500 balance XP via Path B.",
    abilityName: "Mistform",     abilityDesc: "Becomes ethereal for 2 turns. Immune to damage.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  {
    realm: "balance", category: "balance", stage: 3, evolutionPath: "C",
    name: "Prismweave Oracle",   rarity: "prestige",  isPrestige: true,
    description: "Perceives all timelines simultaneously. Prestige locked.",
    unlockHint: "Prestige unlock: complete the Prism Harmony challenge.",
    abilityName: "Future Sight", abilityDesc: "Predicts next 3 enemy moves. Auto-counters all.",
    color: REALM_COLORS.balance, imageUrl: null,
  },
  // ── BEAST ─────────────────────────────────────────────────────────────────
  {
    realm: "beast", category: "beast", stage: 1, evolutionPath: "A",
    name: "Shadowpaw Runt",      rarity: "common",    isPrestige: false,
    description: "Fierce predator instincts packed into a deceptively small frame.",
    unlockHint: "Log your first HIIT or cross-training session.",
    abilityName: "Shadow Strike", abilityDesc: "Attacks from darkness. Ignores armor.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  {
    realm: "beast", category: "beast", stage: 2, evolutionPath: "A",
    name: "Nightfang Prowler",   rarity: "rare",      isPrestige: false,
    description: "A relentless hunter that stalks prey across dark terrain.",
    unlockHint: "Reach 500 beast XP.",
    abilityName: "Prowl",        abilityDesc: "Hides and charges. +30 ATK on next strike.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  {
    realm: "beast", category: "beast", stage: 3, evolutionPath: "A",
    name: "Void Apex Predator",  rarity: "legendary", isPrestige: false,
    description: "The apex of the food chain in every universe it enters.",
    unlockHint: "Reach 2000 beast XP.",
    abilityName: "Apex Rend",    abilityDesc: "Tears through space itself. Bypasses all defenses.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  {
    realm: "beast", category: "beast", stage: 1, evolutionPath: "B",
    name: "Tanglewyrm Hatchling", rarity: "common",   isPrestige: false,
    description: "Wild and tangled from the very moment of birth.",
    unlockHint: "Complete 3 outdoor workouts.",
    abilityName: "Tangle Whip",  abilityDesc: "Wraps enemy in vines. Immobilizes 2 turns.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  {
    realm: "beast", category: "beast", stage: 2, evolutionPath: "B",
    name: "Thornback Ravager",   rarity: "rare",      isPrestige: false,
    description: "Its razor spines multiply and sharpen with each battle won.",
    unlockHint: "Reach 500 beast XP via Path B.",
    abilityName: "Spine Burst",  abilityDesc: "Launches spines in all directions. AoE +18 ATK.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  {
    realm: "beast", category: "beast", stage: 3, evolutionPath: "C",
    name: "Crimson Wyrm Eternal", rarity: "prestige", isPrestige: true,
    description: "Ancient terror reborn from primordial fire. Prestige locked.",
    unlockHint: "Prestige unlock: survive the Crimson Gauntlet event.",
    abilityName: "Eternal Inferno", abilityDesc: "Sets battlefield ablaze. All enemies take damage for 5 turns.",
    color: REALM_COLORS.beast, imageUrl: null,
  },
  // ── MYTHIC ────────────────────────────────────────────────────────────────
  {
    realm: "mythic", category: "mythic", stage: 1, evolutionPath: "A",
    name: "Starweave Hatchling", rarity: "rare",      isPrestige: false,
    description: "Spun from cosmic thread at the edge of a dying star.",
    unlockHint: "Hatch your first Mythic egg.",
    abilityName: "Starthread",   abilityDesc: "Weaves a protective constellation. +20 all stats.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
  {
    realm: "mythic", category: "mythic", stage: 2, evolutionPath: "A",
    name: "Nebula Drifter",      rarity: "epic",      isPrestige: false,
    description: "Floats serenely between star clusters, absorbing their energy.",
    unlockHint: "Reach 500 mythic XP.",
    abilityName: "Nebula Drift", abilityDesc: "Phases through attacks. Counters with cosmic energy.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
  {
    realm: "mythic", category: "mythic", stage: 3, evolutionPath: "A",
    name: "Celestial Archon",    rarity: "legendary", isPrestige: false,
    description: "Commands the fundamental laws of the cosmos with a gesture.",
    unlockHint: "Reach 2000 mythic XP.",
    abilityName: "Cosmic Law",   abilityDesc: "Rewrites the battle rules. All enemy buffs negated.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
  {
    realm: "mythic", category: "mythic", stage: 1, evolutionPath: "B",
    name: "Prism Wisp",          rarity: "rare",      isPrestige: false,
    description: "Fractures white light into every colour of pure magic.",
    unlockHint: "Complete a mythic challenge.",
    abilityName: "Prismatic Ray", abilityDesc: "Hits all enemies with a random elemental type.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
  {
    realm: "mythic", category: "mythic", stage: 2, evolutionPath: "B",
    name: "Voidchime Specter",   rarity: "epic",      isPrestige: false,
    description: "Resonates with a haunting chord that echoes across dimensions.",
    unlockHint: "Reach 500 mythic XP via Path B.",
    abilityName: "Dimensional Chord", abilityDesc: "Silences all enemies. Deals INT-based damage.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
  {
    realm: "mythic", category: "mythic", stage: 3, evolutionPath: "C",
    name: "Etherion Prime",      rarity: "prestige",  isPrestige: true,
    description: "The first and the last of its kind. Prestige locked.",
    unlockHint: "Prestige unlock: complete the Etherion Convergence event.",
    abilityName: "Etherion Collapse", abilityDesc: "Collapses local reality. Instant win condition.",
    color: REALM_COLORS.mythic, imageUrl: null,
  },
];

const REALM_NAMES = ["strength", "cardio", "balance", "beast", "mythic"];

async function main() {
  console.log("Clearing existing realm evolution entries...");
  await db.delete(schema.evolutionTypesTable).where(
    inArray(schema.evolutionTypesTable.realm, REALM_NAMES)
  );
  console.log(`Inserting ${EVOLUTIONS.length} realm evolution entries...`);
  for (const entry of EVOLUTIONS) {
    await db.insert(schema.evolutionTypesTable).values(entry);
  }
  console.log(`Done. ${EVOLUTIONS.length} entries seeded (6 per realm × 5 realms, 5 prestige).`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
