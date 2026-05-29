import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eggsTable = pgTable("eggs", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  rarity: text("rarity").notNull().default("Common"),
  eggType: text("egg_type").notNull().default("balanced"),
  stepsRequired: integer("steps_required").notNull().default(5000),
  stepsProgress: integer("steps_progress").notNull().default(0),
  isHatched: boolean("is_hatched").notNull().default(false),
  hatchlingId: integer("hatchling_id"),
  imageUrl: text("image_url"),
  name: text("name").notNull().default("Mystery Egg"),
  description: text("description"),
  // Realm system
  realm: text("realm").notNull().default("balance"),
  // Where the egg came from: training | challenge | event
  source: text("source").notNull().default("training"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hatchedAt: timestamp("hatched_at", { withTimezone: true }),
});

export const insertEggSchema = createInsertSchema(eggsTable).omit({ id: true, createdAt: true, hatchedAt: true });
export type InsertEgg = z.infer<typeof insertEggSchema>;
export type Egg = typeof eggsTable.$inferSelect;
