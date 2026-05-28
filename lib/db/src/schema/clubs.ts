import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clubInvitesTable = pgTable("club_invites", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull(),
  inviteeId: integer("invitee_id").notNull(),
  inviterId: integer("inviter_id").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, declined
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("club_invites_unique").on(t.clubId, t.inviteeId),
]);

export const insertClubInviteSchema = createInsertSchema(clubInvitesTable).omit({ id: true, sentAt: true });
export type InsertClubInvite = z.infer<typeof insertClubInviteSchema>;
export type ClubInvite = typeof clubInvitesTable.$inferSelect;

export const clubsTable = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  emblem: text("emblem"),
  memberCount: integer("member_count").notNull().default(1),
  maxMembers: integer("max_members").notNull().default(50),
  level: integer("level").notNull().default(1),
  totalWins: integer("total_wins").notNull().default(0),
  isPublic: boolean("is_public").notNull().default(true),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertClubSchema = createInsertSchema(clubsTable).omit({ id: true, createdAt: true });
export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubsTable.$inferSelect;
