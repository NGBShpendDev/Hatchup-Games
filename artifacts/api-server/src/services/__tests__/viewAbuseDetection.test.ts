// Unit tests for the per-post view-abuse detector. The detector is pure, so
// we can drive it directly with synthetic burst traffic without bringing up
// any HTTP / DB machinery.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectViewAbuse,
  BURST_MIN_VIEWS,
  BURST_RATIO,
  MIN_AGE_HOURS_FOR_BASELINE,
  NEW_POST_BURST_MIN,
} from "../viewAbuseDetection.ts";

describe("detectViewAbuse", () => {
  it("does not flag a mature post with a healthy organic rate", () => {
    // 24h old post with 500 prior views (~21/hr) and 30 in the last hour.
    const r = detectViewAbuse({
      postAgeHours: 24,
      totalViews: 530,
      recentViewsInWindow: 30,
      windowHours: 1,
    });
    assert.equal(r.abusive, false);
    assert.equal(r.reason, null);
  });

  it("flags a mature post when the recent rate dwarfs its baseline", () => {
    // Same baseline as above (~21/hr) but 1000 views in the last hour — a
    // botnet rotating through fresh viewerKeys.
    const r = detectViewAbuse({
      postAgeHours: 24,
      totalViews: 1500,
      recentViewsInWindow: 1000,
      windowHours: 1,
    });
    assert.equal(r.abusive, true);
    assert.ok(r.spikeRatio >= BURST_RATIO);
    assert.match(r.reason ?? "", /spike_ratio/);
  });

  it("does not flag mature posts whose burst is small in absolute terms", () => {
    // High spikeRatio (50/hr vs 1/hr baseline) but only BURST_MIN_VIEWS - 1
    // views in the window — too small to confidently call abuse.
    const r = detectViewAbuse({
      postAgeHours: 48,
      totalViews: 48 + (BURST_MIN_VIEWS - 1),
      recentViewsInWindow: BURST_MIN_VIEWS - 1,
      windowHours: 1,
    });
    assert.equal(r.abusive, false, "absolute-volume floor must protect tiny bursts");
  });

  it("does not flag brand-new posts on a normal viral spike", () => {
    // 1h old post with 200 views in the first hour — viral but not the
    // pathological rate we care about.
    const r = detectViewAbuse({
      postAgeHours: 1,
      totalViews: 200,
      recentViewsInWindow: 200,
      windowHours: 1,
    });
    assert.equal(r.abusive, false);
  });

  it("flags brand-new posts on an extreme burst above NEW_POST_BURST_MIN", () => {
    const r = detectViewAbuse({
      postAgeHours: 0.5,
      totalViews: NEW_POST_BURST_MIN + 5,
      recentViewsInWindow: NEW_POST_BURST_MIN + 5,
      windowHours: 1,
    });
    assert.equal(r.abusive, true);
    assert.match(r.reason ?? "", /new_post_burst/);
  });

  it("uses the new-post path for posts under MIN_AGE_HOURS_FOR_BASELINE", () => {
    // Slightly under the threshold — even with a great mature-post-looking
    // ratio we should fall through to the new-post threshold (which is much
    // higher in absolute terms).
    const ageJustUnder = MIN_AGE_HOURS_FOR_BASELINE - 0.5;
    const r = detectViewAbuse({
      postAgeHours: ageJustUnder,
      totalViews: 100,
      recentViewsInWindow: BURST_MIN_VIEWS + 5,
      windowHours: 1,
    });
    assert.equal(r.abusive, false, "below age threshold must not use the ratio rule");
  });

  it("reports baseline + recent rates so admins can verify the freeze", () => {
    const r = detectViewAbuse({
      postAgeHours: 10,
      totalViews: 120,
      recentViewsInWindow: 100,
      windowHours: 1,
    });
    // Prior: 20 views over 9 hours → ~2.2/hr baseline. Recent: 100/hr.
    assert.ok(r.baselineHourlyRate > 0);
    assert.equal(r.recentHourlyRate, 100);
    assert.ok(r.spikeRatio > 1);
  });
});
