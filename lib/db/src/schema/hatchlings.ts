import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const hatchlingsTable = pgTable("hatchlings", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  name: text("name").notNull(),
  species: text("species").notNull().default("Mystery"),
  evolutionStage: integer("evolution_stage").notNull().default(1),
  evolutionType: text("evolution_type"),
  category: text("category").notNull().default("dragons"),
  rarity: text("rarity").notNull().default("Common"),
  personality: text("personality").notNull().default("Calm"),
  mood: text("mood").notNull().default("happy"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  happiness: integer("happiness").notNull().default(80),
  hunger: integer("hunger").notNull().default(60),
  energy: integer("energy").notNull().default(90),
  abilityName: text("ability_name"),
  abilityDesc: text("ability_desc"),
  imageUrl: text("image_url"),
  isShiny: boolean("is_shiny").notNull().default(false),
  isFusion: boolean("is_fusion").notNull().default(false),
  color: text("color"),
  fitnessType: text("fitness_type").notNull().default("balanced"),
  eggId: integer("egg_id"),
  // Realm & genetics system
  realm: text("realm").notNull().default("balance"),
  genetics: jsonb("genetics"),
  friendshipLevel: integer("friendship_level").notNull().default(0),
  moodState: text("mood_state").notNull().default("happy"),
  lastWorkoutAt: timestamp("last_workout_at", { withTimezone: true }),
  // Loyalty, motivation & confidence scores (0–100)
  loyaltyScore: integer("loyalty_score").notNull().default(50),
  motivationScore: integer("motivation_score").notNull().default(50),
  confidenceScore: integer("confidence_score").notNull().default(50),
  // Per-hatchling battle win counter (used in power score derivation)
  battleWins: integer("battle_wins").notNull().default(0),
  // Passive decay accounting + nutrition buff modifier
  lastDecayAt: timestamp("last_decay_at", { withTimezone: true }),
  nutritionBuffExpiresAt: timestamp("nutrition_buff_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHatchlingSchema = createInsertSchema(hatchlingsTable).omit({ id: true, createdAt: true });
export type InsertHatchling = z.infer<typeof insertHatchlingSchema>;
export type Hatchling = typeof hatchlingsTable.$inferSelect;
