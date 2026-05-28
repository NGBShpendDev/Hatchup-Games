import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const rematchInvitesTable = pgTable("rematch_invites", {
  id: text("id").primaryKey(),
  fromPlayerId: integer("from_player_id").notNull(),
  toPlayerId: integer("to_player_id").notNull(),
  mode: text("mode").notNull(),
  fromHatchlingId: integer("from_hatchling_id").notNull(),
  fromHatchlingName: text("from_hatchling_name").notNull(),
  fromBattleId: integer("from_battle_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("rematch_invites_to_player_idx").on(t.toPlayerId),
  index("rematch_invites_from_player_idx").on(t.fromPlayerId),
  index("rematch_invites_expires_idx").on(t.expiresAt),
]);

export type RematchInviteRow = typeof rematchInvitesTable.$inferSelect;
