import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fitnessActivitiesTable = pgTable("fitness_activities", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  type: text("type").notNull(),
  value: integer("value").notNull().default(0),
  unit: text("unit").notNull().default("steps"),
  fitnessXpEarned: integer("fitness_xp_earned").notNull().default(0),
  realm: text("realm").notNull().default("strength"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFitnessActivitySchema = createInsertSchema(fitnessActivitiesTable).omit({ id: true, createdAt: true });
export type InsertFitnessActivity = z.infer<typeof insertFitnessActivitySchema>;
export type FitnessActivity = typeof fitnessActivitiesTable.$inferSelect;

export const fitnessQuestsTable = pgTable("fitness_quests", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  targetValue: integer("target_value").notNull().default(1),
  currentValue: integer("current_value").notNull().default(0),
  xpReward: integer("xp_reward").notNull().default(100),
  coinReward: integer("coin_reward").notNull().default(50),
  isCompleted: boolean("is_completed").notNull().default(false),
  realm: text("realm").notNull().default("strength"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFitnessQuestSchema = createInsertSchema(fitnessQuestsTable).omit({ id: true, createdAt: true });
export type InsertFitnessQuest = z.infer<typeof insertFitnessQuestSchema>;
export type FitnessQuest = typeof fitnessQuestsTable.$inferSelect;
