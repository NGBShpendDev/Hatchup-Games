import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("pending"),
  playerId: integer("player_id").notNull(),
  hatchlingId: integer("hatchling_id").notNull(),
  score: integer("score").notNull().default(0),
  rank: integer("rank"),
  duration: integer("duration"),
  xpEarned: integer("xp_earned"),
  coinsEarned: integer("coins_earned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gameModesTable = pgTable("game_modes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  maxPlayers: integer("max_players").notNull().default(8),
  minLevel: integer("min_level").notNull().default(1),
  iconEmoji: text("icon_emoji"),
  color: text("color"),
  isLive: text("is_live").notNull().default("false"),
});

export const insertCompetitionSchema = createInsertSchema(competitionsTable).omit({ id: true, createdAt: true });
export type InsertCompetition = z.infer<typeof insertCompetitionSchema>;
export type Competition = typeof competitionsTable.$inferSelect;

export const insertGameModeSchema = createInsertSchema(gameModesTable).omit({ id: true });
export type InsertGameMode = z.infer<typeof insertGameModeSchema>;
export type GameMode = typeof gameModesTable.$inferSelect;
