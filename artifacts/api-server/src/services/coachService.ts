import { db } from "@workspace/db";
import {
  playersTable,
  workoutSessionsTable,
  hatchlingsTable,
  playerBadgesTable,
} from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";

export interface CoachContext {
  playerName: string;
  rank: string;
  level: number;
  xp: number;
  currentStreak: number;
  totalWorkouts: number;
  totalSteps: number;
  todaySteps: number;
  dailyStepGoal: number;
  stepGoalPct: number;
  hatchlingCount: number;
  activeHatchlings: string[];
  badgeCount: number;
  recentWorkouts: string[];
}

export async function buildCoachContext(playerId: number): Promise<CoachContext> {
  const [player, recentSessions, hatchlings, [badgeRow]] = await Promise.all([
    db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) }),
    db.query.workoutSessionsTable.findMany({
      where: eq(workoutSessionsTable.playerId, playerId),
      orderBy: [desc(workoutSessionsTable.createdAt)],
      limit: 5,
    }),
    db.query.hatchlingsTable.findMany({
      where: eq(hatchlingsTable.playerId, playerId),
      orderBy: [desc(hatchlingsTable.level)],
      limit: 8,
    }),
    db
      .select({ total: count() })
      .from(playerBadgesTable)
      .where(eq(playerBadgesTable.playerId, playerId)),
  ]);

  const dailyStepGoal = player?.dailyStepGoal ?? 8000;
  const todaySteps = player?.totalSteps ?? 0; // proxy — real-time today steps live on player
  const stepGoalPct = Math.min(100, Math.round((todaySteps / dailyStepGoal) * 100));

  return {
    playerName: player?.displayName ?? player?.username ?? "Trainer",
    rank: player?.rank ?? "Bronze",
    level: player?.level ?? 1,
    xp: player?.xp ?? 0,
    currentStreak: player?.currentStreak ?? 0,
    totalWorkouts: player?.totalWorkouts ?? 0,
    totalSteps: player?.totalSteps ?? 0,
    todaySteps,
    dailyStepGoal,
    stepGoalPct,
    hatchlingCount: hatchlings.length,
    activeHatchlings: hatchlings.slice(0, 4).map(
      (h: typeof hatchlingsTable.$inferSelect) =>
        `${h.name} (Lv${h.level} ${h.category})`
    ),
    badgeCount: badgeRow?.total ?? 0,
    recentWorkouts: recentSessions.map(
      (s: typeof workoutSessionsTable.$inferSelect) =>
        `${s.workoutType} (${s.durationMinutes} min, ${s.xpEarned} XP)`
    ),
  };
}

export function buildSystemPrompt(ctx: CoachContext): string {
  const stepProgress = `${ctx.todaySteps.toLocaleString()} / ${ctx.dailyStepGoal.toLocaleString()} steps (${ctx.stepGoalPct}%)`;

  return `You are Hatch, the AI Fitness Coach for HatchUp Fitness Pals — a family-friendly fitness RPG where real-world exercise hatches and evolves magical creatures called Pals.

Your player profile:
- Name: ${ctx.playerName}
- Rank: ${ctx.rank} | Level ${ctx.level} | Total XP: ${ctx.xp.toLocaleString()}
- Activity streak: ${ctx.currentStreak} days
- Total workouts logged: ${ctx.totalWorkouts}
- Total steps all-time: ${ctx.totalSteps.toLocaleString()}
- Today's step progress: ${stepProgress}
- Pals owned: ${ctx.hatchlingCount}${ctx.activeHatchlings.length > 0 ? `\n- Active Pals: ${ctx.activeHatchlings.join(", ")}` : ""}
- Badges earned: ${ctx.badgeCount}
${ctx.recentWorkouts.length > 0 ? `- Recent sessions: ${ctx.recentWorkouts.join("; ")}` : ""}

Your role:
- Give personalized, motivating fitness and wellness advice based on the player's data above.
- Tie fitness progress to their Pals — completing workouts helps Pals grow and evolve.
- Suggest specific workouts, nutrition tips, recovery strategies, and habit-building techniques.
- Keep answers concise and energetic — 2-4 short paragraphs max unless detail is explicitly requested.
- Use an encouraging, friendly tone with occasional light use of the HatchUp theme.
- When recommending training, mention that they can generate a workout plan in the Training tab.
- When mentioning social features, encourage them to join or create workout groups.
- Reference the player's actual stats (level, streak, Pals, badges) naturally in your responses.

Safety guardrails (non-negotiable):
- NEVER provide medical diagnoses, prescriptions, or specific medical treatment advice.
- For any pain, injury, or health concern, always advise consulting a qualified healthcare professional.
- Do not recommend extreme caloric deficits, dangerous supplements, or unproven treatments.
- Fitness advice is for general wellness only and is not a substitute for professional medical care.
- Always promote safe, sustainable exercise habits.

HatchUp is a safe, trusted, and family-friendly community. Keep all responses appropriate for all ages.`;
}
