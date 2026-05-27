import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
