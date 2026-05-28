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

// Bounced / undeliverable email addresses reported by the provider webhook.
// `issueEmailVerification` consults this list and refuses to send another
// confirmation to an address that is on it, protecting our sender reputation.
// The address is normalized (trimmed + lowercased) at write time so lookups
// are simple equality checks.
export const bouncedEmailsTable = pgTable("bounced_emails", {
  id: serial("id").primaryKey(),
  // Lowercased, trimmed email address. Unique so the webhook can upsert.
  email: text("email").notNull().unique(),
  // "hard" / "soft" / "complaint" / "unknown" — kept as text so a future
  // provider's vocabulary doesn't force a schema migration.
  bounceType: text("bounce_type").notNull().default("hard"),
  // Free-form provider-supplied reason (smtp message, etc). Useful for
  // diagnostics when a user reports they can't get verification emails.
  reason: text("reason"),
  // Source identifier for the bounce — e.g. "resend.webhook" or "manual".
  source: text("source").notNull().default("resend.webhook"),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBouncedEmailSchema = createInsertSchema(bouncedEmailsTable).omit({ id: true, createdAt: true });
export type InsertBouncedEmail = z.infer<typeof insertBouncedEmailSchema>;
export type BouncedEmail = typeof bouncedEmailsTable.$inferSelect;
