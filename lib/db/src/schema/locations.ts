import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Privacy-first design: raw GPS coordinates are accepted transiently (for reverse geocoding only),
// then encrypted with AES-256-GCM before storage. The encrypted values are NEVER exposed in API
// responses. Only city/state/county/country fields (from Nominatim) are returned to clients.
export const playerLocationTable = pgTable("player_location", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().unique(),
  country: text("country"),
  countryCode: text("country_code"),
  state: text("state"),
  county: text("county"),
  city: text("city"),
  // AES-256-GCM encrypted coordinates — stored for potential future proximity features
  // Format: base64(iv):base64(tag):base64(ciphertext) — never returned in API responses
  latEncrypted: text("lat_encrypted"),
  lngEncrypted: text("lng_encrypted"),
  // visibility mirrors players.locationVisibility and is kept in sync on every upsert
  visibility: text("visibility").notNull().default("city"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerLocationSchema = createInsertSchema(playerLocationTable).omit({ id: true, updatedAt: true });
export type InsertPlayerLocation = z.infer<typeof insertPlayerLocationSchema>;
export type PlayerLocation = typeof playerLocationTable.$inferSelect;

export const localChallengesTable = pgTable("local_challenges", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  scope: text("scope").notNull(), // world / country / state / county / city
  scopeValue: text("scope_value").notNull(), // e.g. "Wake County" or "Raleigh"
  metric: text("metric").notNull(), // steps / workouts / battle_wins / streaks / xp
  targetValue: integer("target_value").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  rewardXp: integer("reward_xp").notNull().default(500),
  rewardCoins: integer("reward_coins").notNull().default(100),
  rewardArtifactId: integer("reward_artifact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocalChallengeSchema = createInsertSchema(localChallengesTable).omit({ id: true, createdAt: true });
export type InsertLocalChallenge = z.infer<typeof insertLocalChallengeSchema>;
export type LocalChallenge = typeof localChallengesTable.$inferSelect;

export const localChallengeParticipantsTable = pgTable("local_challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  playerId: integer("player_id").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  rank: integer("rank"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  rewardsAwarded: boolean("rewards_awarded").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLocalChallengeParticipantSchema = createInsertSchema(localChallengeParticipantsTable).omit({ id: true, joinedAt: true });
export type InsertLocalChallengeParticipant = z.infer<typeof insertLocalChallengeParticipantSchema>;
export type LocalChallengeParticipant = typeof localChallengeParticipantsTable.$inferSelect;
