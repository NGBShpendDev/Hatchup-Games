import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Email allowlist for the admin panel gate. Even if a player's row has
 * `isAdmin=true`, they cannot reach `/admin/*` unless their email appears
 * here. Emails are stored lowercased + trimmed; the gate compares with the
 * same normalization on the player's `email` column.
 */
export const adminAllowlistTable = pgTable("admin_allowlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  addedByAdminId: integer("added_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAllowlistEntry = typeof adminAllowlistTable.$inferSelect;

/**
 * Rotating admin access code. The plaintext code is shown to the rotating
 * super-admin exactly once; only the SHA-256 hex hash is persisted here.
 * The most-recent row (by `rotatedAt desc`) is the active code; older rows
 * are kept for audit but are never accepted.
 */
export const adminAccessCodesTable = pgTable("admin_access_codes", {
  id: serial("id").primaryKey(),
  codeHash: text("code_hash").notNull(),
  rotatedByAdminId: integer("rotated_by_admin_id"),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AdminAccessCode = typeof adminAccessCodesTable.$inferSelect;

/**
 * Unlocked admin sessions. Each row binds an `http-only` cookie token (we
 * persist only the SHA-256 hash of the cookie value) to a player and an
 * expiry timestamp. The middleware looks up active rows by token hash;
 * rows past `expiresAt` are treated as expired and rejected.
 */
export const adminSessionsTable = pgTable(
  "admin_sessions",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("admin_sessions_player_idx").on(t.playerId, t.expiresAt)],
);

export type AdminSession = typeof adminSessionsTable.$inferSelect;
