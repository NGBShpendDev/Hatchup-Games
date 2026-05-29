import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { playersTable } from "./players.ts";

export const coinTransactionsTable = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<"purchase" | "spend" | "earn" | "refund">(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  stripeSessionId: text("stripe_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CoinTransaction = typeof coinTransactionsTable.$inferSelect;
export type NewCoinTransaction = typeof coinTransactionsTable.$inferInsert;
