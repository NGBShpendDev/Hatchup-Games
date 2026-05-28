import { pgTable, serial, text, integer, boolean, timestamp, unique, index, jsonb } from "drizzle-orm/pg-core";
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
  viewCount: integer("view_count").notNull().default(0),
  // Set when the anomaly detector freezes a post's view counter (rotating-IP
  // botnet, etc). While frozen the view route stops incrementing viewCount and
  // the post is excluded from trending until an admin unfreezes it.
  viewsFrozenAt: timestamp("views_frozen_at", { withTimezone: true }),
  viewsFreezeReason: text("views_freeze_reason"),
  metadata: jsonb("metadata"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("posts_player_created_idx").on(t.playerId, t.createdAt),
  index("posts_view_count_idx").on(t.viewCount),
]);

export const postViewsTable = pgTable("post_views", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  viewerKey: text("viewer_key").notNull(),
  viewDate: text("view_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("post_views_post_viewer_day_unique").on(t.postId, t.viewerKey, t.viewDate),
  index("post_views_created_at_idx").on(t.createdAt),
  index("post_views_post_created_idx").on(t.postId, t.createdAt),
]);

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
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const postCommentRevisionsTable = pgTable("post_comment_revisions", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id").notNull(),
  content: text("content").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("post_comment_revisions_comment_idx").on(t.commentId, t.editedAt),
]);

export const postCommentReactionsTable = pgTable("post_comment_reactions", {
  id: serial("id").primaryKey(),
  commentId: integer("comment_id").notNull(),
  playerId: integer("player_id").notNull(),
  reactionType: text("reaction_type").notNull().default("like"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("post_comment_reactions_comment_player_unique").on(t.commentId, t.playerId)]);

export const playerFollowsTable = pgTable("player_follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull(),
  followeeId: integer("followee_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("player_follows_follower_followee_unique").on(t.followerId, t.followeeId),
  index("player_follows_followee_follower_idx").on(t.followeeId, t.followerId),
]);

export const playerMemoriesTable = pgTable("player_memories", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  sourcePostId: integer("source_post_id").notNull(),
  memoryType: text("memory_type").notNull().default("anniversary"),
  surfacedAt: timestamp("surfaced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postNotificationMutesTable = pgTable("post_notification_mutes", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  postId: integer("post_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("post_notification_mutes_player_post_unique").on(t.playerId, t.postId),
  index("post_notification_mutes_post_idx").on(t.postId),
]);

export const insertPostNotificationMuteSchema = createInsertSchema(postNotificationMutesTable).omit({ id: true, createdAt: true });
export type InsertPostNotificationMute = z.infer<typeof insertPostNotificationMuteSchema>;
export type PostNotificationMute = typeof postNotificationMutesTable.$inferSelect;

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

export const insertPostCommentReactionSchema = createInsertSchema(postCommentReactionsTable).omit({ id: true, createdAt: true });
export type InsertPostCommentReaction = z.infer<typeof insertPostCommentReactionSchema>;
export type PostCommentReaction = typeof postCommentReactionsTable.$inferSelect;

export const insertPlayerFollowSchema = createInsertSchema(playerFollowsTable).omit({ id: true, createdAt: true });
export type InsertPlayerFollow = z.infer<typeof insertPlayerFollowSchema>;
export type PlayerFollow = typeof playerFollowsTable.$inferSelect;

export const insertPlayerMemorySchema = createInsertSchema(playerMemoriesTable).omit({ id: true });
export type InsertPlayerMemory = z.infer<typeof insertPlayerMemorySchema>;
export type PlayerMemory = typeof playerMemoriesTable.$inferSelect;
