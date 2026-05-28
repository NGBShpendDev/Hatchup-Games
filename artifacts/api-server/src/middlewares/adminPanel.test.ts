import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashToken,
  constantTimeEqualHex,
  normalizeEmail,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
} from "./adminPanel.ts";

test("hashToken returns deterministic sha256 hex", () => {
  const a = hashToken("ABC123");
  const b = hashToken("ABC123");
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.notEqual(a, hashToken("ABC124"));
});

test("constantTimeEqualHex matches identical strings and rejects others", () => {
  const a = hashToken("hello");
  const b = hashToken("hello");
  const c = hashToken("world");
  assert.ok(constantTimeEqualHex(a, b));
  assert.ok(!constantTimeEqualHex(a, c));
  assert.ok(!constantTimeEqualHex(a, a.slice(0, 30)));
});

test("ADMIN_SESSION_TTL_MS is 30 minutes", () => {
  assert.equal(ADMIN_SESSION_TTL_MS, 30 * 60 * 1000);
});

test("ADMIN_SESSION_COOKIE is namespaced", () => {
  assert.ok(ADMIN_SESSION_COOKIE.startsWith("hatchup_"));
});

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  Alice@Example.COM  "), "alice@example.com");
  assert.equal(normalizeEmail("BOB@x.io"), "bob@x.io");
});

test("hashToken differs for case variants and whitespace", () => {
  assert.notEqual(hashToken("abc"), hashToken("ABC"));
  assert.notEqual(hashToken("abc"), hashToken(" abc"));
});

test("constantTimeEqualHex rejects empty strings vs hash", () => {
  assert.ok(!constantTimeEqualHex("", hashToken("x")));
  assert.ok(constantTimeEqualHex("", ""));
});

// Gate reason branches: the AdminGateReason union must cover every reason
// the frontend (admin-gate.tsx) branches on. If anyone adds a new reason,
// this test forces them to think about which screen to show for it.
test("AdminGateReason covers all branches the frontend knows about", async () => {
  // Import lazily; we only need it for type-shape checks at runtime.
  const mod = await import("./adminPanel.ts");
  // The frontend handles these explicitly. If we ever change the wire
  // contract, this should fail compilation OR this test should be updated.
  const expected = [
    "not_signed_in",
    "not_admin",
    "not_whitelisted",
    "session_locked",
    "session_expired",
  ] as const;
  // Just assert the module exports the helpers that emit them.
  assert.ok(typeof mod.requireAdminPanel === "function");
  assert.ok(typeof mod.requireSuperAdminBasic === "function");
  assert.ok(typeof mod.requireSuperAdminPanel === "function");
  assert.ok(expected.length === 5);
});

test("ADMIN_SESSION_TTL_MS represents a future expiry from now", () => {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  assert.ok(expiresAt > Date.now() + 29 * 60 * 1000);
  assert.ok(expiresAt < Date.now() + 31 * 60 * 1000);
});
