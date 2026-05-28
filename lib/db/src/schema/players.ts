import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
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
  passiveXpSinceLastVisit: integer("passive_xp_since_last_visit").notNull().default(0),
  // Strength tracking — lifetime rep counts per exercise
  totalReps: integer("total_reps").notNull().default(0),
  lifetimePushups: integer("lifetime_pushups").notNull().default(0),
  lifetimeSquats: integer("lifetime_squats").notNull().default(0),
  lifetimeBurpees: integer("lifetime_burpees").notNull().default(0),
  lifetimePullups: integer("lifetime_pullups").notNull().default(0),
  lifetimePlanks: integer("lifetime_planks").notNull().default(0),
  lifetimeSitups: integer("lifetime_situps").notNull().default(0),
  // Progression
  prestige: integer("prestige").notNull().default(0),
  title: text("title"),
  streakFreezes: integer("streak_freezes").notNull().default(0),
  // Daily reward
  lastRewardClaimedAt: timestamp("last_reward_claimed_at", { withTimezone: true }),
  dailyRewardStreak: integer("daily_reward_streak").notNull().default(0),
  // Safety & privacy
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  locationVisibility: text("location_visibility").notNull().default("city"),
  requireWorkoutApproval: boolean("require_workout_approval").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  isMinor: boolean("is_minor").notNull().default(false),
  // Nutrition / body goal
  physiqueGoal: text("physique_goal"),
  // Battle Arena
  battleElo: integer("battle_elo").notNull().default(1000),
  totalBattleWins: integer("total_battle_wins").notNull().default(0),
  // Social
  creatorBadge: text("creator_badge"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
