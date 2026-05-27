import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  coins: integer("coins").notNull().default(100),
  rank: text("rank").notNull().default("Bronze"),
  rankScore: integer("rank_score").notNull().default(0),
  totalWins: integer("total_wins").notNull().default(0),
  totalMatches: integer("total_matches").notNull().default(0),
  clubId: integer("club_id"),
  // Fitness fields
  totalSteps: integer("total_steps").notNull().default(0),
  totalWorkouts: integer("total_workouts").notNull().default(0),
  fitnessXp: integer("fitness_xp").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  fitnessRealm: text("fitness_realm").notNull().default("strength"),
  waterCups: integer("water_cups").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  dailyStepGoal: integer("daily_step_goal").notNull().default(8000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
