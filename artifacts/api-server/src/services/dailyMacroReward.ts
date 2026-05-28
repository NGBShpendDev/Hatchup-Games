// Pure helpers for the daily macro-target streak reward path.
//
// The route in `routes/nutrition.ts` handles DB I/O; these helpers encapsulate
// the deterministic, easy-to-unit-test pieces:
//   - tolerance check ("did the player hit all four macros within ±10%?")
//   - idempotency check ("did we already reward today?")
//   - streak math ("continue, reset, or start at 1?")
//
// Keeping these pure means we don't need a database to verify the rules.

export const MACRO_TOLERANCE = 0.10;

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type MacroTarget = MacroTotals;

export interface DailyStreakState {
  currentStreak: number;
  longestStreak: number;
  lastHitDate: string | null;
  rewardedOnDate: string | null;
}

export type DailyMacroDecision =
  | { kind: "already_rewarded" }
  | { kind: "no_hit" }
  | { kind: "reward"; today: string; newCurrent: number; newLongest: number };

export function withinTolerance(
  actual: number,
  target: number,
  tolerance: number = MACRO_TOLERANCE,
): boolean {
  if (target <= 0) return false;
  const ratio = actual / target;
  return ratio >= 1 - tolerance && ratio <= 1 + tolerance;
}

export function allMacrosWithinTolerance(
  totals: MacroTotals,
  target: MacroTarget,
  tolerance: number = MACRO_TOLERANCE,
): boolean {
  return (
    withinTolerance(totals.calories, target.calories, tolerance) &&
    withinTolerance(totals.protein, target.protein, tolerance) &&
    withinTolerance(totals.carbs, target.carbs, tolerance) &&
    withinTolerance(totals.fat, target.fat, tolerance)
  );
}

export function todayUtcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function yesterdayUtcDateString(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Given the player's previous streak row (or null) plus today's totals/target,
// decide whether to short-circuit, no-op, or write a fresh reward. Pure.
export function decideDailyMacroReward(args: {
  prev: DailyStreakState | null;
  totals: MacroTotals;
  target: MacroTarget;
  now?: Date;
  tolerance?: number;
}): DailyMacroDecision {
  const now = args.now ?? new Date();
  const today = todayUtcDateString(now);

  if (args.prev?.rewardedOnDate === today) {
    return { kind: "already_rewarded" };
  }

  if (!allMacrosWithinTolerance(args.totals, args.target, args.tolerance)) {
    return { kind: "no_hit" };
  }

  const yesterday = yesterdayUtcDateString(now);
  const prevHit = args.prev?.lastHitDate ?? null;
  const newCurrent = prevHit === yesterday ? (args.prev!.currentStreak + 1) : 1;
  const newLongest = Math.max(args.prev?.longestStreak ?? 0, newCurrent);

  return { kind: "reward", today, newCurrent, newLongest };
}
