/**
 * Pure scheduling helper for the weekly nutrition recap. Kept in its own file
 * (with no DB / network imports) so it can be exercised by `node:test` without
 * dragging in workspace ESM side-effects.
 *
 * Each player picks a day-of-week (0=Sun..6=Sat) and an hour (0-23) in their
 * local time. The browser supplies a tz offset in minutes (positive = ahead of
 * UTC, same sign convention as `-new Date().getTimezoneOffset()`).
 *
 * We accept the tick if the player's *local* clock right now matches their
 * chosen day+hour. Weekly idempotency via `isoWeekKey` (in nutritionRecap.ts)
 * prevents duplicate sends if multiple ticks land in the same hour.
 */
export function shouldDeliverForPlayer(
  now: Date,
  pref: { dayOfWeek: number; hourLocal: number; tzOffsetMinutes: number },
): boolean {
  const localMs = now.getTime() + pref.tzOffsetMinutes * 60_000;
  const local = new Date(localMs);
  return (
    local.getUTCDay() === pref.dayOfWeek &&
    local.getUTCHours() === pref.hourLocal
  );
}
