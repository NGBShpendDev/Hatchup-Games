import { pgTable, serial, text, integer, boolean, timestamp, unique, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── Artifact catalog ──────────────────────────────────────────────────────────
export const artifactsTable = pgTable("artifacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  lore: text("lore").notNull(),
  rarity: text("rarity").notNull(), // Common | Rare | Epic | Legendary | Mythic | Ancient | Celestial
  type: text("type").notNull(),     // fitness_streak | steps_milestone | workout_count | bar_level | special
  imageSlug: text("image_slug").notNull(),
  isHidden: boolean("is_hidden").notNull().default(false),
  seasonId: integer("season_id"),
  abilities: jsonb("abilities").notNull().default([]),  // [{ name, description, value }]
  triggerKey: text("trigger_key"),   // e.g. "streak_100", "steps_1000000"
  triggerValue: integer("trigger_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArtifactSchema = createInsertSchema(artifactsTable).omit({ id: true, createdAt: true });
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;
export type Artifact = typeof artifactsTable.$inferSelect;

// ── Player-owned artifacts ────────────────────────────────────────────────────
export const playerArtifactsTable = pgTable("player_artifacts", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  artifactId: integer("artifact_id").notNull(),
  isEquipped: boolean("is_equipped").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique("player_artifacts_player_artifact_unique").on(t.playerId, t.artifactId),
}));

export const insertPlayerArtifactSchema = createInsertSchema(playerArtifactsTable).omit({ id: true, earnedAt: true });
export type InsertPlayerArtifact = z.infer<typeof insertPlayerArtifactSchema>;
export type PlayerArtifact = typeof playerArtifactsTable.$inferSelect;

// ── Fitness bars (8 bars, one row per bar type per player) ────────────────────
// Bar types: strength | speed | cardio | recovery | consistency | endurance | agility | discipline
export const fitnessBarsTable = pgTable("fitness_bars", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  barType: text("bar_type").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique("fitness_bars_player_type_unique").on(t.playerId, t.barType),
}));

export const insertFitnessBarSchema = createInsertSchema(fitnessBarsTable).omit({ id: true, updatedAt: true });
export type InsertFitnessBar = z.infer<typeof insertFitnessBarSchema>;
export type FitnessBar = typeof fitnessBarsTable.$inferSelect;

// ── Recent world notifications for Mythic+ drops ─────────────────────────────
export const artifactWorldNotificationsTable = pgTable("artifact_world_notifications", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  playerUsername: text("player_username").notNull(),
  artifactId: integer("artifact_id").notNull(),
  artifactName: text("artifact_name").notNull(),
  rarity: text("rarity").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ArtifactWorldNotification = typeof artifactWorldNotificationsTable.$inferSelect;

// ── Artifact loadouts (pre-battle equip configuration) ────────────────────────
// One "Active" row per (playerId, hatchlingId) = live loadout.
// Additional rows with non-"Active" buildName = saved preset builds.
export const artifactLoadoutsTable = pgTable("artifact_loadouts", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  hatchlingId: integer("hatchling_id").notNull(),
  majorArtifactId: integer("major_artifact_id"),     // nullable = empty slot
  minorArtifact1Id: integer("minor_artifact1_id"),   // nullable = empty slot
  minorArtifact2Id: integer("minor_artifact2_id"),   // nullable = empty slot
  buildName: text("build_name").notNull().default("Active"), // "Active" = live loadout
  powerScore: real("power_score").notNull().default(0),      // used for matchmaking tier
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique("artifact_loadouts_player_hatchling_build").on(t.playerId, t.hatchlingId, t.buildName),
}));

export const insertArtifactLoadoutSchema = createInsertSchema(artifactLoadoutsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertArtifactLoadout = z.infer<typeof insertArtifactLoadoutSchema>;
export type ArtifactLoadout = typeof artifactLoadoutsTable.$inferSelect;

// ── Artifact battle XP (levelling artifacts through combat) ──────────────────
// One row per playerArtifact. XP thresholds: 50 → stage 1, 150 → stage 2, 300 → stage 3.
export const artifactBattleXpTable = pgTable("artifact_battle_xp", {
  id: serial("id").primaryKey(),
  playerArtifactId: integer("player_artifact_id").notNull().unique(),
  battleXp: integer("battle_xp").notNull().default(0),
  evolutionStage: integer("evolution_stage").notNull().default(0), // 0-3
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ArtifactBattleXp = typeof artifactBattleXpTable.$inferSelect;
