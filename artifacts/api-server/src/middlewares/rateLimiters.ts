import type { Request, Response, NextFunction, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { consumeRateLimitBudget } from "../services/rateLimitBudget.ts";

/**
 * Stricter per-endpoint limiters layered on top of the global /api limiters.
 *
 * These per-endpoint limiters gate user-specific actions (location pings,
 * fitness logs, social writes, AI coach calls, scans, post views) and are
 * keyed on `req.playerId` so players sharing a single egress IP (corporate
 * Wi-Fi, school networks, cellular CGNAT) don't throttle each other.
 *
 * Each route that uses one of these limiters MUST run `requireAuth` +
 * `attachPlayer` BEFORE the limiter so `req.playerId` is populated. The
 * IP fallback below only exists so the limiter doesn't crash on
 * unauthenticated edge cases — those requests are immediately rejected
 * by `requireAuth` afterwards.
 *
 * All per-player limiters in this file are backed by the
 * `rate_limit_attempts` Postgres table via `consumeRateLimitBudget`, so the
 * caps survive API restarts and are shared across horizontally-scaled
 * instances. The previous in-process express-rate-limit memory store reset
 * on every redeploy, which let a determined client bypass any per-player
 * limit by waiting for a restart. `postViewLimiter` is the lone exception:
 * it is anonymous-friendly and high-volume (120/min/IP), so it stays on the
 * in-memory store as a pure noise-mitigation layer.
 */

/** Key on the authenticated player id, falling back to the request IP. */
export const playerOrIpKey = (req: Request): string =>
  req.playerId != null ? `player:${req.playerId}` : ipKeyGenerator(req.ip ?? "");

/**
 * Key generator for routes that allow anonymous traffic (e.g. post view
 * pings) or run BEFORE `attachPlayer` (e.g. the global /api limiters).
 * Prefers `req.playerId` if `attachPlayer` ran, then the Clerk user id
 * from the global `clerkMiddleware` (so signed-in users behind the same
 * NAT don't block each other), then the request IP.
 */
export const clerkOrIpKey = (req: Request): string => {
  if (req.playerId != null) return `player:${req.playerId}`;
  try {
    const auth = getAuth(req);
    if (auth?.userId) return `clerk:${auth.userId}`;
  } catch {
    // getAuth throws if clerkMiddleware hasn't run — fall through to IP.
  }
  return ipKeyGenerator(req.ip ?? "");
};

interface DbLimiterOptions {
  scope: string;
  windowMs: number;
  max: number;
  message: Record<string, unknown>;
  keyFor?: (req: Request) => string;
}

/**
 * Build an Express middleware that consumes one slot of the durable
 * `(scope, key)` budget on each request and rejects with 429 + the given
 * body when the cap is exhausted. The response shape mirrors what
 * `express-rate-limit({ message })` produced so existing frontend toasts
 * keep working unchanged.
 */
function dbLimiter(opts: DbLimiterOptions): RequestHandler {
  const keyFor = opts.keyFor ?? playerOrIpKey;
  return async (req, res, next) => {
    try {
      const key = keyFor(req);
      const ok = await consumeRateLimitBudget(opts.scope, key, opts.windowMs, opts.max);
      if (!ok) {
        res.status(429).json(opts.message);
        return;
      }
      next();
    } catch (err) {
      // If the durable store is unreachable, fail open rather than locking
      // every authenticated user out of the API. Log loudly so we notice.
      (req as Request & { log?: { error: (e: unknown, msg: string) => void } }).log?.error?.(
        err,
        `rateLimitBudget ${opts.scope} failed open`,
      );
      next();
    }
  };
}

// Location updates: realistic phones update once every 5–30s. 30/min is plenty
// of headroom and shuts down spoof loops that hammer the endpoint.
export const locationUpdateLimiter = dbLimiter({
  scope: "location_update",
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many location updates, slow down." },
});

// Fitness logging: 60/min is enough for any legitimate sync.
export const fitnessLogLimiter = dbLimiter({
  scope: "fitness_log",
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many fitness updates, slow down." },
});

// Social writes (posts, comments, reacts, follows): cap aggressive posting.
export const socialWriteLimiter = dbLimiter({
  scope: "social_write",
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many social actions, slow down." },
});

// Coach / AI: expensive upstream calls; cap per-player harder.
export const aiCoachLimiter = dbLimiter({
  scope: "ai_coach",
  windowMs: 60 * 1000,
  max: 15,
  message: { error: "Too many coach requests. Please wait a moment." },
});

// Post views: more permissive than other social writes since legitimate
// browsing can fire many of these in a short window (feed scrolls, opening
// permalinks across tabs). Server-side dedup is per (post, viewerKey, day),
// so this limiter is the second line of defense against refresh-loop / bot
// inflation that rotates target posts.
//
// The view route accepts anonymous traffic, so the key generator prefers the
// Clerk user id when present (signed-in viewers sharing a NAT don't block
// each other) and falls back to the request IP for true anons.
//
// Intentionally kept on express-rate-limit's in-memory store: this is a
// pure noise-mitigation layer (120/min is well above any reasonable user
// pattern), it fires on every feed-scroll view ping, and adding a DB write
// per ping would dwarf the cost of the view itself. Survivability across
// restarts has no real value here — the only thing a restart "resets" is a
// scraper that was already getting throttled within the same minute.
export const postViewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clerkOrIpKey,
  message: { error: "Too many view pings, slow down." },
});

// Weekly recap preview: lets a player send themselves a sample notification
// after changing the recap day/time. Strictly 1/hour per player to prevent
// abuse (each preview computes a full recap + optional AI tip call).
export const recapPreviewLimiter = dbLimiter({
  scope: "recap_preview",
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: { error: "You can only send one recap preview per hour." },
});

// Email verification resends: each send hits the player's inbox and burns
// sender reputation if abused. Cap at 3/hour per authenticated player
// (falling back to IP for unauthenticated edge cases). Covers both the
// explicit POST /email/resend-verification and the implicit send fired
// from PATCH /players/:id/privacy-settings when the email changes.
const EMAIL_RESEND_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RESEND_MAX = 3;
const emailResendKey = (req: { playerId?: number; ip?: string }) =>
  req.playerId ? `player:${req.playerId}` : `ip:${req.ip ?? "unknown"}`;

/**
 * Consume one slot of the per-player email resend budget. Returns `true` when
 * the caller is under the cap (and the attempt has been recorded), `false`
 * when the cap is exhausted for the current window.
 *
 * Used both as the body of `emailResendLimiter` below and directly by
 * PATCH /privacy-settings, which has other side effects we still want to
 * commit even when the implicit email send is throttled — so we keep the
 * programmatic entrypoint distinct from the middleware response path.
 *
 * Backed by the shared `rate_limit_attempts` table via
 * `consumeRateLimitBudget`, the same durable store every other per-player
 * limiter in this file uses.
 */
export async function consumeEmailResendBudget(
  req: { playerId?: number; ip?: string },
): Promise<boolean> {
  return consumeRateLimitBudget(
    "email_resend",
    emailResendKey(req),
    EMAIL_RESEND_WINDOW_MS,
    EMAIL_RESEND_MAX,
  );
}

export async function emailResendLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const ok = await consumeEmailResendBudget({ playerId: req.playerId, ip: req.ip });
  if (!ok) {
    res.status(429).json({
      error: "too_many_email_resends",
      message: "You can only send 3 confirmation emails per hour. Please try again later.",
    });
    return;
  }
  next();
}

// Body / meal scan uploads: expensive vision calls.
export const scanLimiter = dbLimiter({
  scope: "scan",
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many scans. Please wait a moment before trying again." },
});
