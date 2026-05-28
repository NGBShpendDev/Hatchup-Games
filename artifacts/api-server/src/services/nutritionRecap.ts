import { db, mealPostsTable, playersTable, notificationsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import { isEmailConfigured, sendTransactionalEmail } from "./emailService";
import { renderRecapEmailHtml } from "./nutritionRecapEmail";

/**
 * Canonical macro-goal targets. Source of truth — `/nutrition/macro-target`
 * and `/nutrition/summary` both import from here so the recap's "averages vs
 * targets" matches the targets the player actually sees in the goal picker.
 */
export const MACRO_GOAL_TARGETS: Record<string, { calories: number; protein: number; carbs: number; fat: number; tip: string }> = {
  shredded:         { calories: 1700, protein: 180, carbs: 130, fat: 50,  tip: "High protein, low carb — protect muscle while burning fat." },
  lean_athlete:     { calories: 2200, protein: 170, carbs: 230, fat: 65,  tip: "Balanced macros — fuel performance and stay lean." },
  muscle_gain:      { calories: 2800, protein: 200, carbs: 300, fat: 80,  tip: "Caloric surplus with high protein — eat to grow." },
  slim_thick:       { calories: 1900, protein: 150, carbs: 190, fat: 60,  tip: "Moderate deficit with resistance training macros." },
  endurance_runner: { calories: 2500, protein: 140, carbs: 330, fat: 70,  tip: "Carb-forward fueling — glycogen is your engine." },
  weight_loss:      { calories: 1500, protein: 140, carbs: 120, fat: 45,  tip: "Aggressive deficit — keep protein high to preserve muscle." },
};

export type HatchlingMood = "thriving" | "happy" | "okay" | "hungry" | "sad";

export interface WeeklyRecap {
  weekStart: string;
  daysLogged: number;
  mealsLogged: number;
  averages: { calories: number; protein: number; carbs: number; fat: number };
  targets:  { calories: number; protein: number; carbs: number; fat: number };
  gaps:     { calories: number; protein: number; carbs: number; fat: number };
  ratios:   { calories: number; protein: number; carbs: number; fat: number };
  adherence: number;
  topFoods: { name: string; emoji: string; count: number }[];
  hatchlingMood: HatchlingMood;
  hatchlingEmoji: string;
  aiTip: string;
  aiSource: "ai" | "fallback";
}

/**
 * Compute a player's weekly nutrition recap: averages vs targets, top foods,
 * Hatchling mood, and an AI coaching tip. Shared between the on-demand
 * `/nutrition/summary` endpoint and the weekly recap notification job.
 */
export async function computeWeeklyRecap(playerId: number): Promise<WeeklyRecap | null> {
  const player = await db.query.playersTable.findFirst({ where: eq(playersTable.id, playerId) });
  if (!player) return null;

  const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const posts = await db.query.mealPostsTable.findMany({
    where: and(
      eq(mealPostsTable.playerId, playerId),
      sql`${mealPostsTable.createdAt} >= ${sinceDate.toISOString()}`,
    ),
    orderBy: [desc(mealPostsTable.createdAt)],
  });

  const byDay = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const p of posts) {
    const day = p.createdAt.toISOString().slice(0, 10);
    const acc = byDay.get(day) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
    acc.calories += p.calories ?? 0;
    acc.protein  += p.proteinG  ?? 0;
    acc.carbs    += p.carbsG    ?? 0;
    acc.fat      += p.fatG      ?? 0;
    byDay.set(day, acc);
  }

  const daysLogged = byDay.size;
  const totals = [...byDay.values()].reduce(
    (a, b) => ({
      calories: a.calories + b.calories,
      protein:  a.protein  + b.protein,
      carbs:    a.carbs    + b.carbs,
      fat:      a.fat      + b.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const denom = Math.max(daysLogged, 1);
  const averages = {
    calories: Math.round(totals.calories / denom),
    protein:  Math.round(totals.protein  / denom),
    carbs:    Math.round(totals.carbs    / denom),
    fat:      Math.round(totals.fat      / denom),
  };

  const goal = player.physiqueGoal ?? "lean_athlete";
  const target = MACRO_GOAL_TARGETS[goal] ?? MACRO_GOAL_TARGETS["lean_athlete"]!;
  const targets = { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat };

  const foodCounts = new Map<string, { name: string; emoji: string; count: number }>();
  for (const p of posts) {
    const key = p.name.toLowerCase().trim();
    const entry = foodCounts.get(key) ?? { name: p.name, emoji: p.emoji, count: 0 };
    entry.count += 1;
    foodCounts.set(key, entry);
  }
  const topFoods = [...foodCounts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  const ratio = (actual: number, want: number) => (want <= 0 ? 0 : Math.min(1.5, actual / want));
  const ratios = {
    calories: ratio(averages.calories, targets.calories),
    protein:  ratio(averages.protein,  targets.protein),
    carbs:    ratio(averages.carbs,    targets.carbs),
    fat:      ratio(averages.fat,      targets.fat),
  };
  const adherence = daysLogged === 0
    ? 0
    : (ratios.calories + ratios.protein + ratios.carbs + ratios.fat) / 4;

  let hatchlingMood: HatchlingMood;
  let hatchlingEmoji: string;
  if (daysLogged === 0) {
    hatchlingMood = "hungry"; hatchlingEmoji = "😟";
  } else if (adherence >= 0.85 && adherence <= 1.15 && daysLogged >= 5) {
    hatchlingMood = "thriving"; hatchlingEmoji = "🤩";
  } else if (adherence >= 0.7 && adherence <= 1.3) {
    hatchlingMood = "happy"; hatchlingEmoji = "😊";
  } else if (adherence >= 0.5) {
    hatchlingMood = "okay"; hatchlingEmoji = "🙂";
  } else if (adherence > 0) {
    hatchlingMood = "hungry"; hatchlingEmoji = "🥺";
  } else {
    hatchlingMood = "sad"; hatchlingEmoji = "😢";
  }

  const gaps = {
    calories: averages.calories - targets.calories,
    protein:  averages.protein  - targets.protein,
    carbs:    averages.carbs    - targets.carbs,
    fat:      averages.fat      - targets.fat,
  };

  let aiTip: string;
  let aiSource: "ai" | "fallback" = "fallback";
  if (daysLogged === 0) {
    aiTip = "Log a meal this week to unlock personalized coaching tips.";
  } else {
    const worst = (Object.entries(gaps) as [keyof typeof gaps, number][])
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]!;
    aiTip = worst[1] < 0
      ? `You're averaging ${Math.abs(worst[1])}${worst[0] === "calories" ? "" : "g"} short on ${worst[0]} — add a small portion at one meal.`
      : `You're ${worst[1]}${worst[0] === "calories" ? "" : "g"} over target on ${worst[0]} — try a lighter swap at one meal.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-5-mini",
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content: `You are a friendly sports nutrition coach. Given a player's weekly macro averages vs targets, write ONE short coaching tip (max 160 characters, no markdown, no quotes) that highlights the biggest gap and gives one concrete swap or add.`,
          },
          {
            role: "user",
            content: `Goal: ${goal}. Days logged this week: ${daysLogged}/7. Averages: ${averages.calories} kcal, ${averages.protein}g protein, ${averages.carbs}g carbs, ${averages.fat}g fat. Targets: ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat.`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content?.trim();
      if (raw && raw.length > 0) {
        aiTip = raw.slice(0, 240);
        aiSource = "ai";
      }
    } catch (err) {
      logger.warn({ err, playerId }, "AI weekly tip failed; using static fallback");
    }
  }

  return {
    weekStart: sinceDate.toISOString(),
    daysLogged,
    mealsLogged: posts.length,
    averages,
    targets,
    gaps,
    ratios,
    adherence: Math.round(adherence * 100) / 100,
    topFoods,
    hatchlingMood,
    hatchlingEmoji,
    aiTip,
    aiSource,
  };
}

/**
 * Return an integer key for the ISO week the given date falls in: YYYY * 100 + week.
 * Used as `notifications.sourceId` so we only deliver one recap notification per
 * calendar week per player.
 */
export function isoWeekKey(d: Date): number {
  // ISO week per https://en.wikipedia.org/wiki/ISO_week_date
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return date.getUTCFullYear() * 100 + week;
}

function buildRecapMessage(recap: WeeklyRecap): { title: string; body: string } {
  if (recap.daysLogged === 0) {
    return {
      title: `${recap.hatchlingEmoji} Your Hatchling missed you this week`,
      body: "You didn't log any meals — tap to log one and revive your weekly coaching tip.",
    };
  }
  const headline = recap.hatchlingMood === "thriving" || recap.hatchlingMood === "happy"
    ? `${recap.hatchlingEmoji} Your Hatchling is ${recap.hatchlingMood}!`
    : `${recap.hatchlingEmoji} Weekly nutrition recap`;
  const top = recap.topFoods[0];
  const topLine = top ? ` Top food: ${top.emoji} ${top.name}.` : "";
  const body = `${recap.daysLogged}/7 days logged · avg ${recap.averages.calories} kcal · ${recap.averages.protein}g protein.${topLine} ${recap.aiTip}`;
  return { title: headline, body: body.slice(0, 280) };
}

/**
 * Deliver this week's recap notification to a player, idempotently. Returns
 * `true` if a new notification was inserted, `false` if one already exists for
 * this ISO week or the player has no recap (missing player).
 */
export async function sendWeeklyRecapNotification(
  playerId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const weekKey = isoWeekKey(now);

  const existing = await db.query.notificationsTable.findFirst({
    where: and(
      eq(notificationsTable.playerId, playerId),
      eq(notificationsTable.type, "nutrition_recap"),
      eq(notificationsTable.sourceId, weekKey),
    ),
    columns: { id: true },
  });
  if (existing) return false;

  const recap = await computeWeeklyRecap(playerId);
  if (!recap) return false;

  const { title, body } = buildRecapMessage(recap);

  await db.insert(notificationsTable).values({
    playerId,
    type: "nutrition_recap",
    title,
    body,
    link: "/nutrition",
    sourceId: weekKey,
  });

  // Best-effort: also deliver the recap as an HTML email. Same `weekKey` is
  // tracked on the player row so we won't double-send if the notification
  // insert above ever raced. Skipped silently when email isn't configured,
  // when the player has no email on file, or when they've opted out.
  await maybeSendRecapEmail(playerId, recap, weekKey);

  return true;
}

async function maybeSendRecapEmail(
  playerId: number,
  recap: WeeklyRecap,
  weekKey: number,
): Promise<void> {
  if (!isEmailConfigured()) return;

  try {
    const player = await db.query.playersTable.findFirst({
      where: eq(playersTable.id, playerId),
      columns: {
        email: true,
        notifyRecapEmail: true,
        displayName: true,
        username: true,
        recapEmailLastSentWeek: true,
      },
    });
    if (!player) return;
    if (!player.email) return;
    if (!player.notifyRecapEmail) return;
    if (player.recapEmailLastSentWeek === weekKey) return;

    const html = renderRecapEmailHtml(recap, player.displayName ?? player.username);
    const subject = recap.daysLogged === 0
      ? `${recap.hatchlingEmoji} Your Hatchling missed you this week`
      : `${recap.hatchlingEmoji} Your weekly nutrition recap`;

    const ok = await sendTransactionalEmail({ to: player.email, subject, html });
    if (ok) {
      await db
        .update(playersTable)
        .set({ recapEmailLastSentWeek: weekKey })
        .where(eq(playersTable.id, playerId));
    }
  } catch (err) {
    logger.warn({ err, playerId }, "weekly recap email step failed");
  }
}
