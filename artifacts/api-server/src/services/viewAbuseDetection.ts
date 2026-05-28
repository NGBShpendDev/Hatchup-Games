// Detects anomalous view spikes on a single post and freezes its counter when
// the spike looks like coordinated abuse (e.g. a botnet hammering one post
// from many IPs to keep slipping past the per-(viewerKey, hour) cap on the
// view route).
//
// The detector is a pure function so it can be exhaustively unit-tested with
// synthetic burst traffic. The route layer feeds it the post's age, its
// historical view total, and the recent view count inside a short window;
// the detector returns a freeze recommendation.
//
// Tuning notes:
// - We only freeze when the recent burst is large in *absolute* terms
//   (BURST_MIN_VIEWS). Small/new posts naturally have noisy ratios.
// - For mature posts we compare the recent rate against the historical hourly
//   rate (`spikeRatio`). A ratio >= BURST_RATIO with enough volume is the
//   strongest signal — a real surge from organic traffic almost never beats
//   the baseline by that much without showing engagement (reactions/comments).
// - For brand-new posts (< MIN_AGE_HOURS_FOR_BASELINE) we can't trust the
//   baseline at all, so we only freeze on a very large absolute burst
//   (NEW_POST_BURST_MIN).

export interface ViewAbuseInputs {
  /** How long ago the post was created, in hours. */
  postAgeHours: number;
  /** Total views recorded on the post (including the recent window). */
  totalViews: number;
  /** Successful view inserts in the recent rolling window. */
  recentViewsInWindow: number;
  /** Window length in hours that recentViewsInWindow covers. */
  windowHours: number;
}

export interface ViewAbuseResult {
  abusive: boolean;
  /** Stored on the post as `viewsFreezeReason` for the admin UI. */
  reason: string | null;
  /** Diagnostics, surfaced to admins so they can sanity-check the freeze. */
  spikeRatio: number;
  baselineHourlyRate: number;
  recentHourlyRate: number;
}

export const BURST_MIN_VIEWS = 60;
export const BURST_RATIO = 20;
export const MIN_AGE_HOURS_FOR_BASELINE = 6;
export const NEW_POST_BURST_MIN = 250;

export function detectViewAbuse(inputs: ViewAbuseInputs): ViewAbuseResult {
  const windowHours = Math.max(0.01, inputs.windowHours);
  const recentHourlyRate = inputs.recentViewsInWindow / windowHours;

  const priorViews = Math.max(0, inputs.totalViews - inputs.recentViewsInWindow);
  const priorHours = Math.max(0, inputs.postAgeHours - windowHours);
  // Floor the baseline at ~1 view/hour so tiny posts don't trigger absurd
  // ratios on small bursts; the absolute BURST_MIN_VIEWS check is what
  // protects us either way.
  const baselineHourlyRate = priorHours > 0 ? Math.max(1, priorViews / priorHours) : 0;
  const spikeRatio = baselineHourlyRate > 0 ? recentHourlyRate / baselineHourlyRate : 0;

  const base = {
    spikeRatio,
    baselineHourlyRate,
    recentHourlyRate,
  };

  // Brand-new posts: no usable baseline → only freeze on a very large
  // absolute burst, since fresh viral posts can legitimately collect lots of
  // views in their first hour.
  if (inputs.postAgeHours < MIN_AGE_HOURS_FOR_BASELINE) {
    if (inputs.recentViewsInWindow >= NEW_POST_BURST_MIN) {
      return {
        ...base,
        abusive: true,
        reason: `new_post_burst:${inputs.recentViewsInWindow}_in_${windowHours}h`,
      };
    }
    return { ...base, abusive: false, reason: null };
  }

  // Mature posts: require both a meaningful absolute burst and a large jump
  // vs. the post's own historical rate.
  if (
    inputs.recentViewsInWindow >= BURST_MIN_VIEWS &&
    spikeRatio >= BURST_RATIO
  ) {
    return {
      ...base,
      abusive: true,
      reason: `spike_ratio_${spikeRatio.toFixed(1)}x_${inputs.recentViewsInWindow}_in_${windowHours}h`,
    };
  }

  return { ...base, abusive: false, reason: null };
}
