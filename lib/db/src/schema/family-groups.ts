import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const familyGroupsTable = pgTable("family_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: integer("creator_id").notNull(),
  parentalPin: text("parental_pin"),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFamilyGroupSchema = createInsertSchema(familyGroupsTable).omit({ id: true, createdAt: true });
export type InsertFamilyGroup = z.infer<typeof insertFamilyGroupSchema>;
export type FamilyGroup = typeof familyGroupsTable.$inferSelect;
