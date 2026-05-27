import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workoutPlansTable = pgTable("workout_plans", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  goal: text("goal").notNull().default("general_fitness"),
  fitnessLevel: text("fitness_level").notNull().default("beginner"),
  equipment: text("equipment").notNull().default("none"),
  planJson: text("plan_json").notNull().default("[]"),
  weekNumber: integer("week_number").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkoutPlanSchema = createInsertSchema(workoutPlansTable).omit({ id: true, createdAt: true });
export type InsertWorkoutPlan = z.infer<typeof insertWorkoutPlanSchema>;
export type WorkoutPlan = typeof workoutPlansTable.$inferSelect;

export const workoutSessionsTable = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  workoutType: text("workout_type").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  exercisesCompleted: integer("exercises_completed").notNull().default(0),
  xpEarned: integer("xp_earned").notNull().default(0),
  coinsEarned: integer("coins_earned").notNull().default(0),
  realm: text("realm").notNull().default("strength"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkoutSessionSchema = createInsertSchema(workoutSessionsTable).omit({ id: true, createdAt: true });
export type InsertWorkoutSession = z.infer<typeof insertWorkoutSessionSchema>;
export type WorkoutSession = typeof workoutSessionsTable.$inferSelect;

export const mealPlansTable = pgTable("meal_plans", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  goal: text("goal").notNull().default("healthy_eating"),
  calorieTarget: integer("calorie_target").notNull().default(2000),
  proteinTarget: integer("protein_target").notNull().default(150),
  carbTarget: integer("carb_target").notNull().default(200),
  fatTarget: integer("fat_target").notNull().default(65),
  planJson: text("plan_json").notNull().default("[]"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMealPlanSchema = createInsertSchema(mealPlansTable).omit({ id: true, createdAt: true });
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type MealPlan = typeof mealPlansTable.$inferSelect;
