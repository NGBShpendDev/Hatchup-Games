import { pgTable, serial, text, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").unique(),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  coins: integer("coins").notNull().default(100),
  rank: text("rank").notNull().default("Bronze"),
  rankScore: integer("rank_score").notNull().default(0),
  totalWins: integer("total_wins").notNull().default(0),
  totalMatches: integer("total_matches").notNull().default(0),
  clubId: integer("club_id"),
  clubRole: text("club_role"),
  activeHatchlingId: integer("active_hatchling_id"),
  // Fitness fields
  totalSteps: integer("total_steps").notNull().default(0),
  totalWorkouts: integer("total_workouts").notNull().default(0),
  fitnessXp: integer("fitness_xp").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  fitnessRealm: text("fitness_realm").notNull().default("strength"),
  waterCups: integer("water_cups").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  dailyStepGoal: integer("daily_step_goal").notNull().default(8000),
  passiveXpSinceLastVisit: integer("passive_xp_since_last_visit").notNull().default(0),
  // Strength tracking — lifetime rep counts per exercise
  totalReps: integer("total_reps").notNull().default(0),
  lifetimePushups: integer("lifetime_pushups").notNull().default(0),
  lifetimeSquats: integer("lifetime_squats").notNull().default(0),
  lifetimeBurpees: integer("lifetime_burpees").notNull().default(0),
  lifetimePullups: integer("lifetime_pullups").notNull().default(0),
  lifetimePlanks: integer("lifetime_planks").notNull().default(0),
  lifetimeSitups: integer("lifetime_situps").notNull().default(0),
  // Progression
  prestige: integer("prestige").notNull().default(0),
  title: text("title"),
  streakFreezes: integer("streak_freezes").notNull().default(0),
  // Daily reward
  lastRewardClaimedAt: timestamp("last_reward_claimed_at", { withTimezone: true }),
  dailyRewardStreak: integer("daily_reward_streak").notNull().default(0),
  // Safety & privacy
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  locationVisibility: text("location_visibility").notNull().default("city"),
  requireWorkoutApproval: boolean("require_workout_approval").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  isMinor: boolean("is_minor").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  suspendedByAdminId: integer("suspended_by_admin_id"),
  // Demo / seed account marker — true for NPC accounts inserted to fill out
  // sparse cold-start surfaces like the "Players Nearby" strip. Lets us
  // identify and clean them up later without touching real users.
  isDemo: boolean("is_demo").notNull().default(false),
  // Nutrition / body goal
  physiqueGoal: text("physique_goal"),
  // Battle Arena
  battleElo: integer("battle_elo").notNull().default(1000),
  totalBattleWins: integer("total_battle_wins").notNull().default(0),
  // Social
  creatorBadge: text("creator_badge"),
  // Accessibility & progression
  fitnessLevel: text("fitness_level").notNull().default("beginner"),
  ageRange: text("age_range").notNull().default("adult"),
  identityPath: text("identity_path"),
  accessibilityMode: text("accessibility_mode").notNull().default("none"),
  familyGroupId: integer("family_group_id"),
  streakAtRisk: boolean("streak_at_risk").notNull().default(false),
  recoveryMessage: text("recovery_message"),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  // Subscription / monetization
  subscriptionTier: text("subscription_tier").notNull().default("premium"),
  subscriptionSource: text("subscription_source").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  top10LastCheckedAt: timestamp("top10_last_checked_at", { withTimezone: true }),
  top10ContextLabel: text("top10_context_label"),
  dailyCoachUsedCount: integer("daily_coach_used_count").notNull().default(0),
  dailyCoachResetDate: date("daily_coach_reset_date"),
  dailyBattleUsedCount: integer("daily_battle_used_count").notNull().default(0),
  dailyBattleResetDate: date("daily_battle_reset_date"),
  // Web push notification preferences (per category)
  notifyInvitesPush: boolean("notify_invites_push").notNull().default(true),
  notifyEndingSoonPush: boolean("notify_ending_soon_push").notNull().default(true),
  notifyCompletedPush: boolean("notify_completed_push").notNull().default(true),
  // Weekly nutrition recap delivery preferences
  weeklyRecapEnabled: boolean("weekly_recap_enabled").notNull().default(true),
  weeklyRecapDayOfWeek: integer("weekly_recap_day_of_week").notNull().default(0),
  weeklyRecapHourLocal: integer("weekly_recap_hour_local").notNull().default(9),
  weeklyRecapTzOffsetMinutes: integer("weekly_recap_tz_offset_minutes").notNull().default(0),
  weeklyRecapTimezone: text("weekly_recap_timezone"),
  // Transactional email
  email: text("email"),
  // Email confirmation — non-null once the user has clicked the verification
  // link we sent. Recap pipeline only sends to verified addresses to protect
  // deliverability (avoids bounces, spam reports, and wrong-inbox delivery).
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  emailVerificationToken: text("email_verification_token").unique(),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at", { withTimezone: true }),
  notifyRecapEmail: boolean("notify_recap_email").notNull().default(true),
  notifyChampionEmail: boolean("notify_champion_email").notNull().default(true),
  notifyModerationEmail: boolean("notify_moderation_email").notNull().default(true),
  recapEmailLastSentWeek: integer("recap_email_last_sent_week"),
  notifyRecapPush: boolean("notify_recap_push").notNull().default(true),
  recapPushLastSentWeek: integer("recap_push_last_sent_week"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
