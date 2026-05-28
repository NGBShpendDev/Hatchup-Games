import { pgTable, serial, text, integer, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("fitness_party"),
  inviteCode: text("invite_code").notNull(),
  creatorPlayerId: integer("creator_player_id").notNull(),
  teamEnergy: integer("team_energy").notNull().default(0),
  totalTeamEnergy: integer("total_team_energy").notNull().default(0),
  maxMembers: integer("max_members").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  playerId: integer("player_id").notNull(),
  friendshipLevel: integer("friendship_level").notNull().default(1),
  coWorkoutCount: integer("co_workout_count").notNull().default(0),
  lastWorkoutTogether: timestamp("last_workout_together", { withTimezone: true }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("group_members_player_group_idx").on(t.playerId, t.groupId),
  index("group_members_group_player_idx").on(t.groupId, t.playerId),
]);

export const groupChallengesTable = pgTable("group_challenges", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").notNull().default(0),
  rewardType: text("reward_type").notNull().default("bonus_eggs"),
  rewardAmount: integer("reward_amount").notNull().default(1),
  isCompleted: boolean("is_completed").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupRaidsTable = pgTable("group_raids", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  bossName: text("boss_name").notNull(),
  bossHp: integer("boss_hp").notNull().default(1000),
  currentDamage: integer("current_damage").notNull().default(0),
  status: text("status").notNull().default("active"),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMessagesTable = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  playerId: integer("player_id").notNull(),
  playerName: text("player_name").notNull().default("Trainer"),
  content: text("content").notNull(),
  isFiltered: boolean("is_filtered").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groupsTable).omit({ id: true, createdAt: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;

export const insertGroupMemberSchema = createInsertSchema(groupMembersTable).omit({ id: true, joinedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembersTable.$inferSelect;

export const insertGroupChallengeSchema = createInsertSchema(groupChallengesTable).omit({ id: true, createdAt: true });
export type InsertGroupChallenge = z.infer<typeof insertGroupChallengeSchema>;
export type GroupChallenge = typeof groupChallengesTable.$inferSelect;

export const insertGroupRaidSchema = createInsertSchema(groupRaidsTable).omit({ id: true, createdAt: true });
export type InsertGroupRaid = z.infer<typeof insertGroupRaidSchema>;
export type GroupRaid = typeof groupRaidsTable.$inferSelect;

export const insertGroupMessageSchema = createInsertSchema(groupMessagesTable).omit({ id: true, createdAt: true });
export type InsertGroupMessage = z.infer<typeof insertGroupMessageSchema>;
export type GroupMessage = typeof groupMessagesTable.$inferSelect;

export const groupNotificationMutesTable = pgTable("group_notification_mutes", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  groupId: integer("group_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("group_notification_mutes_player_group_unique").on(t.playerId, t.groupId),
  index("group_notification_mutes_group_idx").on(t.groupId),
]);

export const insertGroupNotificationMuteSchema = createInsertSchema(groupNotificationMutesTable).omit({ id: true, createdAt: true });
export type InsertGroupNotificationMute = z.infer<typeof insertGroupNotificationMuteSchema>;
export type GroupNotificationMute = typeof groupNotificationMutesTable.$inferSelect;
