import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const challengesTable = pgTable("challenges", {
  id: serial("id").primaryKey(),
  creatorId: integer("creator_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  metric: text("metric").notNull(), // steps, pushups, workouts, streak_days, calories, miles, pullups
  targetValue: integer("target_value").notNull().default(1000),
  durationDays: integer("duration_days").notNull().default(7),
  type: text("type").notNull().default("public"), // public, private, guild, city
  status: text("status").notNull().default("active"), // active, completed, cancelled
  rewardXp: integer("reward_xp").notNull().default(100),
  rewardCoins: integer("reward_coins").notNull().default(50),
  rewardArtifactId: integer("reward_artifact_id"),
  requiresPublicMeetup: boolean("requires_public_meetup").notNull().default(false),
  startAt: timestamp("start_at", { withTimezone: true }).notNull().defaultNow(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  maxParticipants: integer("max_participants").notNull().default(100),
  isElimination: boolean("is_elimination").notNull().default(false),
  currentRound: integer("current_round").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const challengeParticipantsTable = pgTable("challenge_participants", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  playerId: integer("player_id").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  eliminated: boolean("eliminated").notNull().default(false),
  rank: integer("rank"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  eliminatedRound: integer("eliminated_round"),
}, (t) => [
  unique("challenge_participants_unique").on(t.challengeId, t.playerId),
]);

export const challengeInvitesTable = pgTable("challenge_invites", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").notNull(),
  inviteeId: integer("invitee_id").notNull(),
  inviterId: integer("inviter_id").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, declined
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("challenge_invites_unique").on(t.challengeId, t.inviteeId),
]);

export const insertChallengeSchema = createInsertSchema(challengesTable).omit({ id: true, createdAt: true });
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type Challenge = typeof challengesTable.$inferSelect;

export const insertChallengeParticipantSchema = createInsertSchema(challengeParticipantsTable).omit({ id: true });
export type InsertChallengeParticipant = z.infer<typeof insertChallengeParticipantSchema>;
export type ChallengeParticipant = typeof challengeParticipantsTable.$inferSelect;

export const insertChallengeInviteSchema = createInsertSchema(challengeInvitesTable).omit({ id: true });
export type InsertChallengeInvite = z.infer<typeof insertChallengeInviteSchema>;
export type ChallengeInvite = typeof challengeInvitesTable.$inferSelect;
