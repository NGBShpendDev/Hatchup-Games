import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/**
 * Stricter per-endpoint limiters layered on top of the global /api limiters.
 * Each limiter is keyed by IP+route by default; helps blunt brute-force,
 * abuse, and replay against the most sensitive surfaces.
 */

// Location updates: realistic phones update once every 5–30s. 30/min is plenty
// of headroom and shuts down spoof loops that hammer the endpoint.
export const locationUpdateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many location updates, slow down." },
});

// Fitness logging: 60/min is enough for any legitimate sync.
export const fitnessLogLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many fitness updates, slow down." },
});

// Social writes (posts, comments, reacts, follows): cap aggressive posting.
export const socialWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many social actions, slow down." },
});

// Coach / AI: expensive upstream calls; cap per-IP harder.
export const aiCoachLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many coach requests. Please wait a moment." },
});

// Post views: more permissive than other social writes since legitimate
// browsing can fire many of these in a short window (feed scrolls, opening
// permalinks across tabs). Server-side dedup is per (post, viewerKey, day),
// so this limiter is the second line of defense against refresh-loop / bot
// inflation that rotates target posts.
export const postViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many view pings, slow down." },
});

// Weekly recap preview: lets a player send themselves a sample notification
// after changing the recap day/time. Strictly 1/hour per player to prevent
// abuse (each preview computes a full recap + optional AI tip call).
//
// Keyed by `req.playerId` so players sharing an IP (corporate Wi-Fi, school
// networks, cellular CGNAT) don't block each other. Falls back to the
// IP-based key for unauthenticated edge cases — those requests are rejected
// by `requireAuth` immediately after the limiter anyway, but the fallback
// keeps the limiter from blowing up on a missing key.
export const recapPreviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.playerId != null ? `player:${req.playerId}` : ipKeyGenerator(req.ip ?? ""),
  message: { error: "You can only send one recap preview per hour." },
});

// Email verification resends: each send hits the player's inbox and burns
// sender reputation if abused. Cap at 3/hour per authenticated player (falling
// back to IP for unauthenticated edge cases). Covers both the explicit
// POST /email/resend-verification and the implicit send fired from
// PATCH /players/:id/privacy-settings when the email changes.
const EMAIL_RESEND_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RESEND_MAX = 3;
const emailResendKey = (req: { playerId?: number; ip?: string }) =>
  req.playerId ? `player:${req.playerId}` : `ip:${req.ip ?? "unknown"}`;

export const emailResendLimiter = rateLimit({
  windowMs: EMAIL_RESEND_WINDOW_MS,
  max: EMAIL_RESEND_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => emailResendKey(req as { playerId?: number; ip?: string }),
  message: {
    error: "too_many_email_resends",
    message: "You can only send 3 confirmation emails per hour. Please try again later.",
  },
});

/**
 * Programmatic check used by handlers that want to consume the same per-player
 * resend budget without letting the rate limiter take over the response (e.g.
 * PATCH /privacy-settings, which has other side effects we still want to
 * commit even if the implicit email send is throttled).
 *
 * Lightweight in-memory bucket keyed identically to the express-rate-limit
 * middleware above so totals are coherent across both call sites.
 */
const emailResendHits = new Map<string, number[]>();
export function consumeEmailResendBudget(req: { playerId?: number; ip?: string }): boolean {
  const key = emailResendKey(req);
  const now = Date.now();
  const cutoff = now - EMAIL_RESEND_WINDOW_MS;
  const hits = (emailResendHits.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= EMAIL_RESEND_MAX) {
    emailResendHits.set(key, hits);
    return false;
  }
  hits.push(now);
  emailResendHits.set(key, hits);
  return true;
}

// Body / meal scan uploads: expensive vision calls.
export const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scans. Please wait a moment before trying again." },
});
