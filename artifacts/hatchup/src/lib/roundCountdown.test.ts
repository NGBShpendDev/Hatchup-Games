import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatRoundCountdown } from "./roundCountdown.ts";

// Anchor "now" so test results are deterministic regardless of wall clock.
const NOW = new Date("2026-05-01T00:00:00Z").getTime();
function at(deltaMs: number): string {
  return new Date(NOW + deltaMs).toISOString();
}

describe("formatRoundCountdown", () => {
  it("shows days+hours+minutes when >1 day remains", () => {
    const endAt = at(2 * 86400000 + 3 * 3600000 + 17 * 60000 + 42 * 1000);
    assert.equal(formatRoundCountdown(endAt, NOW), "2d 3h 17m");
  });

  it("drops days once <1 day remains, shows hours+minutes", () => {
    const endAt = at(5 * 3600000 + 30 * 60000 + 12 * 1000);
    assert.equal(formatRoundCountdown(endAt, NOW), "5h 30m");
  });

  it("at exactly 1 hour, formats as hours+minutes (1h 0m)", () => {
    const endAt = at(3600000);
    assert.equal(formatRoundCountdown(endAt, NOW), "1h 0m");
  });

  it("drops hours once <1 hour remains, shows minutes+seconds", () => {
    const endAt = at(45 * 60000 + 9 * 1000);
    assert.equal(formatRoundCountdown(endAt, NOW), "45m 9s");
  });

  it("at exactly 1 minute, formats as minutes+seconds (1m 0s)", () => {
    const endAt = at(60000);
    assert.equal(formatRoundCountdown(endAt, NOW), "1m 0s");
  });

  it("drops minutes in the last minute, shows just seconds", () => {
    const endAt = at(42 * 1000);
    assert.equal(formatRoundCountdown(endAt, NOW), "42s");
  });

  it("rounds down sub-second fractions", () => {
    const endAt = at(9999);
    assert.equal(formatRoundCountdown(endAt, NOW), "9s");
  });

  it("returns 'Cut imminent' at exactly zero", () => {
    assert.equal(formatRoundCountdown(at(0), NOW), "Cut imminent");
  });

  it("returns 'Cut imminent' when the deadline has passed", () => {
    assert.equal(formatRoundCountdown(at(-5000), NOW), "Cut imminent");
  });

  it("crosses the day boundary cleanly (1d 0h 0m at exactly 24h)", () => {
    const endAt = at(86400000);
    assert.equal(formatRoundCountdown(endAt, NOW), "1d 0h 0m");
  });
});
