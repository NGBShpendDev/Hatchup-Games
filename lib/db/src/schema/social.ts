import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const postsTable = pgTable("posts", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  postType: text("post_type").notNull().default("general"),
  creatureId: integer("creature_id"),
  xpEarned: integer("xp_earned").notNull().default(0),
  energyEarned: integer("energy_earned").notNull().default(0),
  isFlagged: boolean("is_flagged").notNull().default(false),
  engagementScore: integer("engagement_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postReactionsTable = pgTable("post_reactions", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  playerId: integer("player_id").notNull(),
  reactionType: text("reaction_type").notNull().default("like"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postCommentsTable = pgTable("post_comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  playerId: integer("player_id").notNull(),
  content: text("content").notNull(),
  isFlagged: boolean("is_flagged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerFollowsTable = pgTable("player_follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followeeId: integer("followee_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerMemoriesTable = pgTable("player_memories", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  sourcePostId: integer("source_post_id").notNull(),
  memoryType: text("memory_type").notNull().default("anniversary"),
  surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postRepostsTable = pgTable("post_reposts", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  playerId: integer("player_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof postsTable.$inferSelect;

export const insertPostReactionSchema = createInsertSchema(postReactionsTable).omit({ id: true, createdAt: true });
export type InsertPostReaction = z.infer<typeof insertPostReactionSchema>;
export type PostReaction = typeof postReactionsTable.$inferSelect;

export const insertPostCommentSchema = createInsertSchema(postCommentsTable).omit({ id: true, createdAt: true });
export type InsertPostComment = z.infer<typeof insertPostCommentSchema>;
export type PostComment = typeof postCommentsTable.$inferSelect;

export const insertPlayerFollowSchema = createInsertSchema(playerFollowsTable).omit({ id: true, createdAt: true });
export type InsertPlayerFollow = z.infer<typeof insertPlayerFollowSchema>;
export type PlayerFollow = typeof playerFollowsTable.$inferSelect;

export const insertPlayerMemorySchema = createInsertSchema(playerMemoriesTable).omit({ id: true });
export type InsertPlayerMemory = z.infer<typeof insertPlayerMemorySchema>;
export type PlayerMemory = typeof playerMemoriesTable.$inferSelect;
