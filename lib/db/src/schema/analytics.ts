import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const shareEventsTable = pgTable("share_events", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id"),
  contentType: text("content_type").notNull(),
  contentId: text("content_id").notNull(),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("share_events_content_idx").on(t.contentType, t.contentId, t.createdAt),
  index("share_events_player_idx").on(t.playerId, t.createdAt),
]);

export type ShareEvent = typeof shareEventsTable.$inferSelect;
