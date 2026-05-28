import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
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
  externalId: text("external_id"),
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

// Personal Records table — tracks each player's best performance per activity/metric
export const personalRecordsTable = pgTable("personal_records", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  activityType: text("activity_type").notNull(),  // e.g. "running", "pushups"
  metric: text("metric").notNull(),               // e.g. "reps", "session_minutes"
  value: integer("value").notNull(),              // integer (reps, minutes, etc.)
  achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Unique constraint: one PR record per player/activity/metric combination
  uniq: unique("personal_records_player_id_activity_type_metric_key").on(t.playerId, t.activityType, t.metric),
}));

export const insertPersonalRecordSchema = createInsertSchema(personalRecordsTable).omit({ id: true, achievedAt: true });
export type InsertPersonalRecord = z.infer<typeof insertPersonalRecordSchema>;
export type PersonalRecord = typeof personalRecordsTable.$inferSelect;
