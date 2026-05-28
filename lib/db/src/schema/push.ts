import { pgTable, serial, text, integer, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("push_subscriptions_endpoint_unique").on(t.endpoint),
]);

export const pushVapidKeysTable = pgTable("push_vapid_keys", {
  id: serial("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  subject: text("subject").notNull().default("mailto:support@hatchup.app"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptionsTable).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

export type PushVapidKeys = typeof pushVapidKeysTable.$inferSelect;

// Keep these in lockstep with `players.notify*Push` columns. Used as the canonical
// list of push notification categories players can opt in/out of.
export const PUSH_CATEGORIES = ["invites", "endingSoon", "completed"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
