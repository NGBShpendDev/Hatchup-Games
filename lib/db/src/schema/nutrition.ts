import { pgTable, serial, text, integer, boolean, timestamp, unique, doublePrecision, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mealPostsTable = pgTable("meal_posts", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  imageUrl: text("image_url"),
  emoji: text("emoji").notNull().default("🍽️"),
  name: text("name").notNull(),
  tag: text("tag").notNull().default("healthy-snack"),
  description: text("description"),
  calories: integer("calories"),
  proteinG: doublePrecision("protein_g"),
  carbsG: doublePrecision("carbs_g"),
  fatG: doublePrecision("fat_g"),
  aiAnalyzed: boolean("ai_analyzed").notNull().default(false),
  likesCount: integer("likes_count").notNull().default(0),
  commentsCount: integer("comments_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMealPostSchema = createInsertSchema(mealPostsTable).omit({ id: true, createdAt: true, likesCount: true, commentsCount: true });
export type InsertMealPost = z.infer<typeof insertMealPostSchema>;
export type MealPost = typeof mealPostsTable.$inferSelect;

export const mealLikesTable = pgTable("meal_likes", {
  id: serial("id").primaryKey(),
  mealPostId: integer("meal_post_id").notNull(),
  playerId: integer("player_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.mealPostId, t.playerId)]);

export const insertMealLikeSchema = createInsertSchema(mealLikesTable).omit({ id: true, createdAt: true });
export type InsertMealLike = z.infer<typeof insertMealLikeSchema>;
export type MealLike = typeof mealLikesTable.$inferSelect;

export const mealCommentsTable = pgTable("meal_comments", {
  id: serial("id").primaryKey(),
  mealPostId: integer("meal_post_id").notNull(),
  playerId: integer("player_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMealCommentSchema = createInsertSchema(mealCommentsTable).omit({ id: true, createdAt: true });
export type InsertMealComment = z.infer<typeof insertMealCommentSchema>;
export type MealComment = typeof mealCommentsTable.$inferSelect;

export const nutritionChallengeProgressTable = pgTable("nutrition_challenge_progress", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  challengeKey: text("challenge_key").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.playerId, t.challengeKey)]);

export const insertNutritionChallengeProgressSchema = createInsertSchema(nutritionChallengeProgressTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNutritionChallengeProgress = z.infer<typeof insertNutritionChallengeProgressSchema>;
export type NutritionChallengeProgress = typeof nutritionChallengeProgressTable.$inferSelect;

// Daily macro-target streak: incremented when a player hits all four macros
// (calories, protein, carbs, fat) within ±10% of their daily target.
// lastHitDate is the most recent UTC date the player hit; rewardedOnDate prevents
// double-reward when the player keeps logging meals after already qualifying.
export const nutritionDailyStreaksTable = pgTable("nutrition_daily_streaks", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastHitDate: date("last_hit_date"),
  rewardedOnDate: date("rewarded_on_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NutritionDailyStreak = typeof nutritionDailyStreaksTable.$inferSelect;
