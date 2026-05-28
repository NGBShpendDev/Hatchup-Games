import rateLimit from "express-rate-limit";

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

// Body / meal scan uploads: expensive vision calls.
export const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scans. Please wait a moment before trying again." },
});
