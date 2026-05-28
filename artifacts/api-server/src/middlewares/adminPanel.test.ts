import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashToken,
  constantTimeEqualHex,
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
