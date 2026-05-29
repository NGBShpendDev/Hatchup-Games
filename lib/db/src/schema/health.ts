import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const healthConnectionsTable = pgTable("health_connections", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  platform: text("platform").notNull(),
  providerAccountId: text("provider_account_id"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One provider account can only be linked to one HatchUp player.
  // NULL providerAccountId values are excluded by Postgres unique semantics (NULL != NULL),
  // so legacy rows without a resolved subject ID are unaffected.
  uniqProviderAccount: unique("health_connections_platform_provider_account_id_key").on(t.platform, t.providerAccountId),
}));

export type HealthConnection = typeof healthConnectionsTable.$inferSelect;
