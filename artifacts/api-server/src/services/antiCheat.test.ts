import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { haversineKm, validateGpsUpdate, validateStepDelta } from "./antiCheat.ts";

describe("haversineKm", () => {
  it("returns ~0 for identical points", () => {
    assert.ok(haversineKm(40, -74, 40, -74) < 0.001);
  });
  it("computes NYC → LA at ~3935km", () => {
    const d = haversineKm(40.7128, -74.006, 34.0522, -118.2437);
    assert.ok(d > 3900 && d < 4000, `got ${d}`);
  });
});

describe("validateGpsUpdate", () => {
  const base = { newLat: 40, newLng: -74, newTimestamp: new Date("2026-01-01T00:00:00Z") };

  it("accepts first fix (no previous)", () => {
    const v = validateGpsUpdate({ ...base });
    assert.equal(v.verdict, "ok");
  });

  it("rejects impossible velocity (NYC to LA in 1 minute)", () => {
    const v = validateGpsUpdate({
      prevLat: 40.7128, prevLng: -74.006,
      prevTimestamp: new Date("2026-01-01T00:00:00Z"),
      newLat: 34.0522, newLng: -118.2437,
      newTimestamp: new Date("2026-01-01T00:01:00Z"),
    });
    assert.equal(v.verdict, "reject");
    assert.equal(v.reason, "impossible_velocity");
  });

  it("flags vehicular speed as suspicious", () => {
    // ~150 km/h: 0.1 deg lat (~11km) in 4.4 min
    const v = validateGpsUpdate({
      prevLat: 40, prevLng: -74,
      prevTimestamp: new Date("2026-01-01T00:00:00Z"),
      newLat: 40.15, newLng: -74,
      newTimestamp: new Date("2026-01-01T00:07:00Z"),
    });
    assert.equal(v.verdict, "suspicious");
  });

  it("accepts a normal jog pace (~10km/h)", () => {
    const v = validateGpsUpdate({
      prevLat: 40, prevLng: -74,
      prevTimestamp: new Date("2026-01-01T00:00:00Z"),
      newLat: 40.005, newLng: -74,
      newTimestamp: new Date("2026-01-01T00:05:00Z"),
    });
    assert.equal(v.verdict, "ok");
  });

  it("flags low accuracy fixes", () => {
    const v = validateGpsUpdate({ ...base, accuracyMeters: 1000 });
    assert.equal(v.verdict, "suspicious");
    assert.equal(v.reason, "low_accuracy_fix");
  });
});

describe("validateStepDelta", () => {
  it("accepts zero steps", () => {
    assert.equal(validateStepDelta({ stepsAdded: 0, secondsElapsed: 60 }).verdict, "ok");
  });
  it("rejects negative steps", () => {
    assert.equal(validateStepDelta({ stepsAdded: -10, secondsElapsed: 60 }).verdict, "reject");
  });
  it("rejects non-positive elapsed time", () => {
    assert.equal(validateStepDelta({ stepsAdded: 100, secondsElapsed: 0 }).verdict, "reject");
  });
  it("rejects impossible step rate (>400/min)", () => {
    // 500 steps in 60s → 500/min
    assert.equal(validateStepDelta({ stepsAdded: 500, secondsElapsed: 60 }).verdict, "reject");
  });
  it("flags sustained sprint cadence as suspicious", () => {
    // 250 steps/min sustained over 15 minutes
    const v = validateStepDelta({ stepsAdded: 250 * 15, secondsElapsed: 15 * 60 });
    assert.equal(v.verdict, "suspicious");
  });
  it("accepts normal walking cadence", () => {
    // 110 steps/min for 10 min
    assert.equal(validateStepDelta({ stepsAdded: 1100, secondsElapsed: 600 }).verdict, "ok");
  });
});
