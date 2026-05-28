/**
 * Pure scheduling helper for the weekly nutrition recap. Kept in its own file
 * (with no DB / network imports) so it can be exercised by `node:test` without
 * dragging in workspace ESM side-effects.
 *
 * Each player picks a day-of-week (0=Sun..6=Sat) and an hour (0-23) in their
 * local time. The browser supplies either:
 *   - an IANA timezone name (e.g. "America/New_York") — preferred. We resolve
 *     the player's *current* local clock via Intl, so DST and travel are
 *     handled correctly without re-saving settings.
 *   - and/or a tz offset in minutes (positive = ahead of UTC, same sign
 *     convention as `-new Date().getTimezoneOffset()`) — used as a legacy
 *     fallback when no IANA name is stored.
 *
 * We accept the tick if the player's *local* clock right now matches their
 * chosen day+hour. Weekly idempotency via `isoWeekKey` (in nutritionRecap.ts)
 * prevents duplicate sends if multiple ticks land in the same hour.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function resolveLocalViaTimezone(
  now: Date,
  timezone: string,
): { dayOfWeek: number; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const weekdayStr = parts.find((p) => p.type === "weekday")?.value;
    const hourStr = parts.find((p) => p.type === "hour")?.value;
    if (!weekdayStr || hourStr === undefined) return null;
    const dayOfWeek = WEEKDAY_INDEX[weekdayStr];
    // `hour: numeric` with hour12:false can yield "24" at midnight in some locales.
    const hour = Number(hourStr) % 24;
    if (dayOfWeek === undefined || !Number.isFinite(hour)) return null;
    return { dayOfWeek, hour };
  } catch {
    return null;
  }
}

export function shouldDeliverForPlayer(
  now: Date,
  pref: {
    dayOfWeek: number;
    hourLocal: number;
    tzOffsetMinutes: number;
    timezone?: string | null;
  },
): boolean {
  if (pref.timezone) {
    const resolved = resolveLocalViaTimezone(now, pref.timezone);
    if (resolved) {
      return (
        resolved.dayOfWeek === pref.dayOfWeek &&
        resolved.hour === pref.hourLocal
      );
    }
    // Bad/unknown IANA name → fall through to stored offset.
  }
  const localMs = now.getTime() + pref.tzOffsetMinutes * 60_000;
  const local = new Date(localMs);
  return (
    local.getUTCDay() === pref.dayOfWeek &&
    local.getUTCHours() === pref.hourLocal
  );
}
