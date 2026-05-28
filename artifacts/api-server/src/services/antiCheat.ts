/**
 * Anti-cheat validators — pure heuristics for fitness + location integrity.
 *
 * These functions are intentionally pure so they can be unit-tested without
 * a DB. Each returns a structured result indicating whether the activity is
 * acceptable, suspicious, or hard-rejected. Callers decide what to do
 * (drop, log, queue for review, etc.).
 */

export type CheatVerdict = "ok" | "suspicious" | "reject";

export interface CheatResult {
  verdict: CheatVerdict;
  reason?: string;
  details?: Record<string, number | string>;
}

/**
 * Haversine distance in km between two lat/lng points.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Validate that a player's GPS update is physically plausible vs. the previous
 * recorded point. Flags impossible velocities (teleport / fake GPS) and
 * very-low-accuracy fixes.
 *
 *  - >300 km/h between fixes  → reject (faster than highway driving)
 *  - >120 km/h sustained      → suspicious (driving, not running)
 *  - accuracy worse than 500m → suspicious (very weak fix)
 */
export function validateGpsUpdate(args: {
  prevLat?: number | null;
  prevLng?: number | null;
  prevTimestamp?: Date | null;
  newLat: number;
  newLng: number;
  newTimestamp: Date;
  accuracyMeters?: number | null;
}): CheatResult {
  const { prevLat, prevLng, prevTimestamp, newLat, newLng, newTimestamp, accuracyMeters } = args;

  if (accuracyMeters != null && accuracyMeters > 500) {
    return {
      verdict: "suspicious",
      reason: "low_accuracy_fix",
      details: { accuracyMeters },
    };
  }

  if (prevLat == null || prevLng == null || !prevTimestamp) {
    return { verdict: "ok" };
  }

  const distKm = haversineKm(prevLat, prevLng, newLat, newLng);
  const elapsedHours = Math.max(
    0.0001,
    (newTimestamp.getTime() - prevTimestamp.getTime()) / 3_600_000,
  );
  const speedKmh = distKm / elapsedHours;

  if (speedKmh > 300) {
    return {
      verdict: "reject",
      reason: "impossible_velocity",
      details: { speedKmh: Math.round(speedKmh), distKm: Number(distKm.toFixed(2)) },
    };
  }
  if (speedKmh > 120) {
    return {
      verdict: "suspicious",
      reason: "vehicular_velocity",
      details: { speedKmh: Math.round(speedKmh) },
    };
  }
  return { verdict: "ok" };
}

/**
 * Validate a step delta. Real humans cap around ~250 steps/min sprinting and
 * ~180 steps/min running. We reject anything wildly above that and flag
 * sustained running-cadence-without-context as suspicious.
 *
 *  - >400 steps/min over the window     → reject (clearly spoofed)
 *  - >220 steps/min over a long window  → suspicious
 *  - negative or zero seconds elapsed   → reject (replay / time tampering)
 */
export function validateStepDelta(args: {
  stepsAdded: number;
  secondsElapsed: number;
}): CheatResult {
  const { stepsAdded, secondsElapsed } = args;
  if (stepsAdded < 0) {
    return { verdict: "reject", reason: "negative_steps" };
  }
  if (stepsAdded === 0) {
    return { verdict: "ok" };
  }
  if (secondsElapsed <= 0) {
    return { verdict: "reject", reason: "non_positive_elapsed" };
  }
  const stepsPerMin = (stepsAdded / secondsElapsed) * 60;
  if (stepsPerMin > 400) {
    return {
      verdict: "reject",
      reason: "step_rate_too_high",
      details: { stepsPerMin: Math.round(stepsPerMin) },
    };
  }
  if (stepsPerMin > 220 && secondsElapsed > 600) {
    return {
      verdict: "suspicious",
      reason: "sustained_sprint_cadence",
      details: { stepsPerMin: Math.round(stepsPerMin), secondsElapsed },
    };
  }
  return { verdict: "ok" };
}
