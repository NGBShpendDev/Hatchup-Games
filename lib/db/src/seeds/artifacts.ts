/**
 * Artifact catalog seed — run with: pnpm --filter @workspace/db seed:artifacts
 * Safe to re-run: uses ON CONFLICT DO NOTHING (idempotent by name).
 *
 * 20 artifacts across 7 rarity tiers:
 * Common → Rare → Epic → Legendary → Mythic → Ancient → Celestial
 *
 * Trigger keys (maps to artifactService.ts BAR_ACTIVITY_MAP / fitness columns):
 *   streak_days, total_steps, total_workouts,
 *   lifetime_pushups, lifetime_squats,
 *   strength_bar_level, speed_bar_level, endurance_bar_level,
 *   discipline_bar_level, agility_bar_level
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../schema/index.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

type ArtifactInsert = typeof schema.artifactsTable.$inferInsert;

const CATALOG: ArtifactInsert[] = [
  // ── Common ────────────────────────────────────────────────────────────────
  {
    name: "Ember Spark",
    lore: "Forged in the fires of a 7-day streak. Small but fierce, this relic pulses with raw discipline.",
    rarity: "Common",
    type: "fitness_streak",
    imageSlug: "ember_spark",
    isHidden: false,
    abilities: [{ name: "XP Boost", description: "Earn 5% bonus XP from all activities", value: 5 }],
    triggerKey: "streak_days",
    triggerValue: 7,
  },
  {
    name: "Bronze Strider",
    lore: "Awarded to those who log their first 10,000 steps. The journey begins.",
    rarity: "Common",
    type: "steps_milestone",
    imageSlug: "bronze_strider",
    isHidden: false,
    abilities: [{ name: "Step Luck", description: "Eggs hatch 3% faster per step logged", value: 3 }],
    triggerKey: "total_steps",
    triggerValue: 10000,
  },
  {
    name: "Iron Pact",
    lore: "Ten workouts logged. The body remembers every rep. This relic marks your covenant with consistency.",
    rarity: "Common",
    type: "workout_count",
    imageSlug: "iron_pact",
    isHidden: false,
    abilities: [{ name: "Workout XP", description: "+2 XP per workout logged", value: 2 }],
    triggerKey: "total_workouts",
    triggerValue: 10,
  },
  // ── Rare ──────────────────────────────────────────────────────────────────
  {
    name: "Flame Keeper",
    lore: "A 30-day streak. The flame inside you burned when most would have quit.",
    rarity: "Rare",
    type: "fitness_streak",
    imageSlug: "flame_keeper",
    isHidden: false,
    abilities: [
      { name: "Streak Shield", description: "Protects your streak once per week", value: 1 },
      { name: "XP Aura", description: "+10% XP from cardio activities", value: 10 },
    ],
    triggerKey: "streak_days",
    triggerValue: 30,
  },
  {
    name: "Crystal Horizon",
    lore: "Fifty thousand steps. Every horizon you chased left a crystal echo behind.",
    rarity: "Rare",
    type: "steps_milestone",
    imageSlug: "crystal_horizon",
    isHidden: false,
    abilities: [{ name: "Step Aura", description: "+8% step XP", value: 8 }],
    triggerKey: "total_steps",
    triggerValue: 50000,
  },
  {
    name: "Iron Fist",
    lore: "One thousand pushups completed. Your hands carry the weight of a thousand small victories.",
    rarity: "Rare",
    type: "workout_count",
    imageSlug: "iron_fist",
    isHidden: false,
    abilities: [{ name: "Strength Amp", description: "+15% XP from strength activities", value: 15 }],
    triggerKey: "lifetime_pushups",
    triggerValue: 1000,
  },
  {
    name: "Steel Resolve",
    lore: "50 workouts. The weak quit. The strong forge steel.",
    rarity: "Rare",
    type: "workout_count",
    imageSlug: "steel_resolve",
    isHidden: false,
    abilities: [{ name: "Endurance Buff", description: "+12% endurance bar XP", value: 12 }],
    triggerKey: "total_workouts",
    triggerValue: 50,
  },
  // ── Epic ──────────────────────────────────────────────────────────────────
  {
    name: "Thunderstride",
    lore: "Run. Run harder. Run longer. 100,000 steps marks the point where running became your identity.",
    rarity: "Epic",
    type: "steps_milestone",
    imageSlug: "thunderstride",
    isHidden: false,
    abilities: [
      { name: "Speed Surge", description: "+20% speed bar XP", value: 20 },
      { name: "Hatch Luck", description: "+5% egg hatch rate", value: 5 },
    ],
    triggerKey: "total_steps",
    triggerValue: 100000,
  },
  {
    name: "Iron Devotee",
    lore: "Two hundred workouts. Your devotion has shaped iron out of flesh.",
    rarity: "Epic",
    type: "workout_count",
    imageSlug: "iron_devotee",
    isHidden: false,
    abilities: [
      { name: "Evolution Boost", description: "Evolution costs reduced by 10%", value: 10 },
      { name: "XP Torrent", description: "+25% XP from all workouts", value: 25 },
    ],
    triggerKey: "total_workouts",
    triggerValue: 200,
  },
  {
    name: "Steel Form",
    lore: "Your Strength bar reached Level 10. Your body is a weapon. Your consistency, the edge.",
    rarity: "Epic",
    type: "bar_level",
    imageSlug: "steel_form",
    isHidden: false,
    abilities: [{ name: "Strength Mastery", description: "+30% XP from strength activities", value: 30 }],
    triggerKey: "strength_bar_level",
    triggerValue: 10,
  },
  {
    name: "Leg Day Legend",
    lore: "1,000 squats logged. Your legs have spoken. Everyone heard.",
    rarity: "Epic",
    type: "workout_count",
    imageSlug: "leg_day_legend",
    isHidden: false,
    abilities: [{ name: "Squat Power", description: "+20% agility XP from leg workouts", value: 20 }],
    triggerKey: "lifetime_squats",
    triggerValue: 1000,
  },
  {
    name: "Agile Phantom",
    lore: "Speed Bar level 10. Faster than thought, lighter than breath.",
    rarity: "Epic",
    type: "bar_level",
    imageSlug: "agile_phantom",
    isHidden: false,
    abilities: [
      { name: "Phantom Step", description: "+30% speed bar XP", value: 30 },
      { name: "Blur", description: "+10% XP from agility activities", value: 10 },
    ],
    triggerKey: "speed_bar_level",
    triggerValue: 10,
  },
  // ── Legendary ─────────────────────────────────────────────────────────────
  {
    name: "Marathon Spirit",
    lore: "You ran the distance of a marathon — 26.2 miles cumulatively. The road became your temple.",
    rarity: "Legendary",
    type: "fitness_streak",
    imageSlug: "marathon_spirit",
    isHidden: false,
    abilities: [
      { name: "Endurance Crown", description: "+35% endurance bar XP", value: 35 },
      { name: "Runner's High", description: "+20% XP from all cardio", value: 20 },
    ],
    triggerKey: "total_steps",
    triggerValue: 500000,
  },
  {
    name: "Million Paces",
    lore: "One million steps walked, run, or climbed. The earth itself bowed.",
    rarity: "Legendary",
    type: "steps_milestone",
    imageSlug: "million_paces",
    isHidden: false,
    abilities: [
      { name: "Pacer's Blessing", description: "+40% step XP", value: 40 },
      { name: "Golden Stride", description: "Eggs hatch at double speed", value: 2 },
    ],
    triggerKey: "total_steps",
    triggerValue: 1000000,
  },
  {
    name: "Eternal Vigil",
    lore: "A Legendary relic for those who mastered discipline — Discipline bar level 10.",
    rarity: "Legendary",
    type: "bar_level",
    imageSlug: "eternal_vigil",
    isHidden: false,
    abilities: [
      { name: "Vigil Aura", description: "+45% discipline bar XP", value: 45 },
      { name: "Rest Mastery", description: "Recovery activities give double XP", value: 2 },
    ],
    triggerKey: "discipline_bar_level",
    triggerValue: 10,
  },
  // ── Mythic ────────────────────────────────────────────────────────────────
  {
    name: "Centurion Flame",
    lore: "One hundred days. One hundred fires kept alive. A warrior's relic beyond price.",
    rarity: "Mythic",
    type: "fitness_streak",
    imageSlug: "centurion_flame",
    isHidden: false,
    abilities: [
      { name: "Legendary Aura", description: "+50% XP from all activities", value: 50 },
      { name: "Flame Ward", description: "Streak never resets on rest days", value: 1 },
      { name: "Celestial Pull", description: "+15% hatch luck", value: 15 },
    ],
    triggerKey: "streak_days",
    triggerValue: 100,
  },
  {
    name: "Phoenix Core",
    lore: "Mythic. Rare beyond measure. Revealed only to those who logged 500 workouts without surrender.",
    rarity: "Mythic",
    type: "workout_count",
    imageSlug: "phoenix_core",
    isHidden: false,
    abilities: [
      { name: "Phoenix Rebirth", description: "100% XP bonus for 24h after each workout", value: 100 },
      { name: "Inferno Aura", description: "+60% XP from all activities", value: 60 },
    ],
    triggerKey: "total_workouts",
    triggerValue: 500,
  },
  // ── Ancient ───────────────────────────────────────────────────────────────
  {
    name: "Obsidian Sovereign",
    lore: "An Ancient relic born from the void of 200-day consistency. No words, only awe.",
    rarity: "Ancient",
    type: "fitness_streak",
    imageSlug: "obsidian_sovereign",
    isHidden: false,
    abilities: [
      { name: "Dark Synergy", description: "All fitness bars gain +75% XP", value: 75 },
      { name: "Ancient Ward", description: "Artifacts provide double passive buffs", value: 2 },
    ],
    triggerKey: "streak_days",
    triggerValue: 200,
  },
  {
    name: "Void Whisper",
    lore: "An Ancient relic hidden in silence. Discovered only by those who achieve supreme discipline.",
    rarity: "Ancient",
    type: "special",
    imageSlug: "void_whisper",
    isHidden: true,
    abilities: [{ name: "Void Echo", description: "Passive XP accumulates 3x faster while offline", value: 3 }],
    triggerKey: "discipline_bar_level",
    triggerValue: 15,
  },
  // ── Champion-only (Legendary, hidden from milestone engine) ───────────────
  {
    name: "Crown of the Bracket",
    lore: "Forged from the shattered hopes of every contender you outlasted. Worn only by tournament champions.",
    rarity: "Legendary",
    type: "special",
    imageSlug: "crown_of_the_bracket",
    isHidden: true,
    abilities: [
      { name: "Champion's Aura", description: "+25% XP from competitive activities", value: 25 },
      { name: "Bracket Tactician", description: "+10% coins from challenge rewards", value: 10 },
    ],
    triggerKey: null,
    triggerValue: null,
  },
  // ── Celestial ─────────────────────────────────────────────────────────────
  {
    name: "Stellar Epoch",
    lore: "Ten million steps. A Celestial relic whose glow rivals the stars. You became legend.",
    rarity: "Celestial",
    type: "steps_milestone",
    imageSlug: "stellar_epoch",
    isHidden: false,
    abilities: [
      { name: "Celestial Bloom", description: "All XP gains tripled", value: 3 },
      { name: "Star Atlas", description: "Unlocks secret Celestial evolution path", value: 1 },
    ],
    triggerKey: "total_steps",
    triggerValue: 10000000,
  },
];

async function main() {
  console.log(`Seeding ${CATALOG.length} artifacts…`);
  for (const artifact of CATALOG) {
    await db
      .insert(schema.artifactsTable)
      .values(artifact)
      .onConflictDoNothing({ target: schema.artifactsTable.name });
  }
  console.log("Done. Artifact catalog seeded (duplicates skipped).");
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
