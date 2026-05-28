import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
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

// Persistent backing store for the per-player email-resend budget. We log one
// row per consumed send keyed by the same string the in-process limiter used
// (`player:<id>` or `ip:<addr>`) so the cap survives API restarts and is
// shared across horizontally-scaled instances. Rows older than the window are
// GC'd opportunistically inside `consumeEmailResendBudget`.
export const emailResendAttemptsTable = pgTable(
  "email_resend_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_resend_attempts_key_created_at_idx").on(t.key, t.createdAt)],
);

export type EmailResendAttempt = typeof emailResendAttemptsTable.$inferSelect;

// Generic durable backing store for per-actor rate limits. Each consumed
// attempt writes a row keyed by `(scope, key)` where `scope` names the
// limiter (e.g. "email_resend", "ai_coach", "recap_preview") and `key` is
// the per-actor identifier the limiter buckets on (`player:<id>` or
// `ip:<addr>`). Counting rows in the current window decides whether the
// next call is allowed; rows older than the window are GC'd opportunistically
// by `consumeRateLimitBudget` on the same `(scope, key)`.
//
// This generalizes the original `email_resend_attempts` table so every
// per-player limiter survives API restarts and is shared across
// horizontally-scaled instances — the previous in-process limiters reset
// on every redeploy.
export const rateLimitAttemptsTable = pgTable(
  "rate_limit_attempts",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rate_limit_attempts_scope_key_created_at_idx").on(t.scope, t.key, t.createdAt),
  ],
);

export type RateLimitAttempt = typeof rateLimitAttemptsTable.$inferSelect;

// Suspension appeals submitted in-app by suspended players. Status is one of
// "pending" | "approved" | "denied". A player may have at most one row in the
// "pending" state at any time — the POST handler enforces this.
export const accountAppealsTable = pgTable("account_appeals", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("pending"),
  reviewerId: integer("reviewer_id"),
  reviewerNote: text("reviewer_note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccountAppealSchema = createInsertSchema(accountAppealsTable).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  reviewerId: true,
  reviewerNote: true,
  status: true,
});
export type InsertAccountAppeal = z.infer<typeof insertAccountAppealSchema>;
export type AccountAppeal = typeof accountAppealsTable.$inferSelect;
