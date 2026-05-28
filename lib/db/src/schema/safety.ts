import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userReportsTable = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull(),
  reportedUserId: integer("reported_user_id"),
  reason: text("reason").notNull(),
  contentType: text("content_type").notNull().default("profile"),
  contentId: integer("content_id"),
  description: text("description"),
  status: text("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blockedUsersTable = pgTable("blocked_users", {
  id: serial("id").primaryKey(),
  blockerId: integer("blocker_id").notNull(),
  blockedId: integer("blocked_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  { name: "blocked_users_unique_pair", columns: [t.blockerId, t.blockedId] },
]);

export const insertUserReportSchema = createInsertSchema(userReportsTable).omit({ id: true, createdAt: true, resolvedAt: true });
export type InsertUserReport = z.infer<typeof insertUserReportSchema>;
export type UserReport = typeof userReportsTable.$inferSelect;

export const insertBlockedUserSchema = createInsertSchema(blockedUsersTable).omit({ id: true, createdAt: true });
export type InsertBlockedUser = z.infer<typeof insertBlockedUserSchema>;
export type BlockedUser = typeof blockedUsersTable.$inferSelect;

export const moderationAuditLogTable = pgTable("moderation_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  action: text("action").notNull(),
  targetPlayerId: integer("target_player_id"),
  targetReportId: integer("target_report_id"),
  reason: text("reason"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertModerationAuditLogSchema = createInsertSchema(moderationAuditLogTable).omit({ id: true, createdAt: true });
export type InsertModerationAuditLog = z.infer<typeof insertModerationAuditLogSchema>;
export type ModerationAuditLog = typeof moderationAuditLogTable.$inferSelect;
