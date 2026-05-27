import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const evolutionTypesTable = pgTable("evolution_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  rarity: text("rarity").notNull().default("Common"),
  description: text("description").notNull(),
  unlockHint: text("unlock_hint"),
  imageUrl: text("image_url"),
  abilityName: text("ability_name"),
  abilityDesc: text("ability_desc"),
  unlockedCount: integer("unlocked_count").notNull().default(0),
  color: text("color"),
});

export const insertEvolutionTypeSchema = createInsertSchema(evolutionTypesTable).omit({ id: true });
export type InsertEvolutionType = z.infer<typeof insertEvolutionTypeSchema>;
export type EvolutionType = typeof evolutionTypesTable.$inferSelect;
