import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const stripeShieldFulfillmentsTable = pgTable("stripe_shield_fulfillments", {
  checkoutSessionId: text("checkout_session_id").primaryKey(),
  stripeEventId: text("stripe_event_id").notNull(),
  playerId: integer("player_id").notNull(),
  pack: text("pack").notNull(),
  shields: integer("shields").notNull(),
  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StripeShieldFulfillment = typeof stripeShieldFulfillmentsTable.$inferSelect;
