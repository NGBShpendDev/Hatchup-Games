import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playerBadgesTable = pgTable("player_badges", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  badgeKey: text("badge_key").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  isShowcase: boolean("is_showcase").notNull().default(false),
});

export const insertPlayerBadgeSchema = createInsertSchema(playerBadgesTable).omit({ id: true, earnedAt: true });
export type InsertPlayerBadge = z.infer<typeof insertPlayerBadgeSchema>;
export type PlayerBadge = typeof playerBadgesTable.$inferSelect;
