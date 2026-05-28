import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const battlesTable = pgTable("battles", {
  id: serial("id").primaryKey(),
  player1Id: integer("player1_id").notNull(),
  player2Id: integer("player2_id"), // null = bot opponent
  winnerId: integer("winner_id"),   // null = draw / ongoing; 0 = bot won
  hatchling1Id: integer("hatchling1_id").notNull(),
  hatchling2Id: integer("hatchling2_id"),
  turnsJson: jsonb("turns_json"),   // TurnResult[]
  xpAwarded: integer("xp_awarded").notNull().default(0),
  coinsAwarded: integer("coins_awarded").notNull().default(0),
  battleMode: text("battle_mode").notNull().default("casual"), // "casual" | "ranked"
  eloChange: integer("elo_change").notNull().default(0),        // change for player1
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBattleSchema = createInsertSchema(battlesTable).omit({ id: true, createdAt: true });
export type InsertBattle = z.infer<typeof insertBattleSchema>;
export type Battle = typeof battlesTable.$inferSelect;
