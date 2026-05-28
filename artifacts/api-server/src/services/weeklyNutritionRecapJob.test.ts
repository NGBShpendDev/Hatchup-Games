import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldDeliverForPlayer } from "./recapSchedule.ts";

describe("shouldDeliverForPlayer", () => {
  it("fires when UTC matches and the player is in UTC", () => {
    // Sunday 2026-01-04 09:00 UTC
    const now = new Date("2026-01-04T09:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 9, tzOffsetMinutes: 0 }),
      true,
    );
  });

  it("respects positive tz offset (e.g. Tokyo +09:00)", () => {
    // 2026-01-04 00:00 UTC = Sunday 09:00 in Tokyo
    const now = new Date("2026-01-04T00:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 9, tzOffsetMinutes: 9 * 60 }),
      true,
    );
  });

  it("respects negative tz offset (e.g. New York -05:00)", () => {
    // 2026-01-04 14:00 UTC = Sunday 09:00 in New York
    const now = new Date("2026-01-04T14:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 9, tzOffsetMinutes: -5 * 60 }),
      true,
    );
  });

  it("returns false when the local hour does not match", () => {
    const now = new Date("2026-01-04T08:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 9, tzOffsetMinutes: 0 }),
      false,
    );
  });

  it("returns false when the local day does not match", () => {
    // Monday 2026-01-05 09:00 UTC
    const now = new Date("2026-01-05T09:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 9, tzOffsetMinutes: 0 }),
      false,
    );
  });

  it("rolls the local day across UTC midnight for west-of-UTC players", () => {
    // 2026-01-05 02:00 UTC = Sunday 21:00 in New York (UTC-5)
    const now = new Date("2026-01-05T02:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, { dayOfWeek: 0, hourLocal: 21, tzOffsetMinutes: -5 * 60 }),
      true,
    );
  });

  it("prefers an IANA timezone over the stored offset (Tokyo)", () => {
    // 2026-01-04 00:00 UTC = Sunday 09:00 in Tokyo.
    // Stored offset is intentionally wrong to confirm timezone wins.
    const now = new Date("2026-01-04T00:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, {
        dayOfWeek: 0,
        hourLocal: 9,
        tzOffsetMinutes: 0,
        timezone: "Asia/Tokyo",
      }),
      true,
    );
  });

  it("handles DST automatically via IANA timezone (NY summer)", () => {
    // 2026-07-05 13:00 UTC = Sunday 09:00 in New York (EDT, UTC-4).
    // A stale -300 (EST) offset would say 08:00; IANA should say 09:00.
    const now = new Date("2026-07-05T13:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, {
        dayOfWeek: 0,
        hourLocal: 9,
        tzOffsetMinutes: -300,
        timezone: "America/New_York",
      }),
      true,
    );
  });

  it("falls back to stored offset when timezone is an unknown IANA name", () => {
    const now = new Date("2026-01-04T14:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, {
        dayOfWeek: 0,
        hourLocal: 9,
        tzOffsetMinutes: -5 * 60,
        timezone: "Not/A_Real_Zone",
      }),
      true,
    );
  });

  it("falls back to stored offset when timezone is null", () => {
    const now = new Date("2026-01-04T09:00:00Z");
    assert.equal(
      shouldDeliverForPlayer(now, {
        dayOfWeek: 0,
        hourLocal: 9,
        tzOffsetMinutes: 0,
        timezone: null,
      }),
      true,
    );
  });
});
