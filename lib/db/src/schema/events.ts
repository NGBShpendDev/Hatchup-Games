import { pgTable, serial, text, integer, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const liveEventsTable = pgTable("live_events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("upcoming"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  participants: integer("participants").notNull().default(0),
  reward: text("reward"),
  imageUrl: text("image_url"),
  color: text("color"),
  isFeatured: boolean("is_featured").notNull().default(false),
});

export const insertLiveEventSchema = createInsertSchema(liveEventsTable).omit({ id: true });
export type InsertLiveEvent = z.infer<typeof insertLiveEventSchema>;
export type LiveEvent = typeof liveEventsTable.$inferSelect;

// Dedup table for event joins — one row per (event, player). Backed by a
// unique constraint so the join route can use insert+onConflictDoNothing
// to make XP grants and participant counter bumps idempotent.
export const eventParticipantsTable = pgTable("event_participants", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  playerId: integer("player_id").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("event_participants_event_player_uniq").on(t.eventId, t.playerId),
  index("event_participants_event_idx").on(t.eventId),
]);

export type EventParticipant = typeof eventParticipantsTable.$inferSelect;
