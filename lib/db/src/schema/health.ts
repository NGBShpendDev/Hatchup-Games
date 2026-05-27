import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const healthConnectionsTable = pgTable("health_connections", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  platform: text("platform").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HealthConnection = typeof healthConnectionsTable.$inferSelect;
