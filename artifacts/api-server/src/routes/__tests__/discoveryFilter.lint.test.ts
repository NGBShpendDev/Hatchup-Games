// Repo-level safety guard.
//
// Task #315 collapsed the people-discovery exclusion rule (blocked users,
// hidden-visibility, minor accounts) into one shared helper:
//
//   filterDiscoverableCandidates(viewerId, players, opts?)
//     — in artifacts/api-server/src/routes/safety.ts
//
// Every endpoint that returns a list of player objects MUST route its
// candidate set through that helper so the policy lives in exactly one
// place. The per-endpoint suites only test the routes that exist today —
// nothing stops a future contributor from adding a new /players/foo or
// /leaderboards/bar that re-inlines `getHiddenPlayerIds(...)` +
// `.filter(p => !hiddenSet.has(p.id))` and silently re-introduces the
// drift this task fixes.
//
// This is the build-time guard for that. It scans every route file under
// artifacts/api-server/src/routes/*.ts (excluding test files and safety.ts
// itself, which defines the helper) for the telltale inline filter
// pattern, and fails the build if a new occurrence appears that isn't on
// the small ALLOWED_INLINE list. New entries to that list require a
// deliberate code review.
//
// Two patterns are flagged as the canonical "I forgot the helper" smell:
//   1.  things.filter(p => !someHiddenSet.has(p.id))
//   2.  things.filter(p => !hiddenIds.includes(p.id))
// Both filter a list of player-shaped objects in memory using a set/array
// of hidden ids — which is exactly what filterDiscoverableCandidates does
// (plus the visibility + minor checks).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Files we never lint:
//   - safety.ts: defines getHiddenPlayerIds + filterDiscoverableCandidates,
//     so it is allowed (and expected) to reference both names.
//   - any *.test.ts: tests legitimately reproduce the pattern to verify
//     the helper itself behaves correctly.
//   - the __tests__ directory: integration/lint tests, same reasoning.
const SKIP_FILES = new Set(["safety.ts"]);

// Files allowed to use the inline "filter player objects against a hidden
// id set" pattern. Adding to this list should be rare and reviewed — the
// default expectation is that people-discovery endpoints call
// filterDiscoverableCandidates instead.
//
// Each entry records WHERE the legacy pattern lives so the failure
// message can point reviewers at it.
const ALLOWED_INLINE: Array<{ file: string; reason: string }> = [
  {
    file: "leaderboards.ts",
    reason:
      "Legacy fallback paths in the mode-leaderboard handler (pace fallback + " +
      "no-step-activity fallback) pre-date filterDiscoverableCandidates. The " +
      "scoped /leaderboards/scoped endpoint in the same file already uses the " +
      "shared helper. Migrating the two fallback branches is tracked separately.",
  },
];

// Regexes that match the dangerous inline pattern. We deliberately keep
// these narrow so we don't false-positive on filtering posts/comments by
// authorId (which is the legitimate non-discovery use of
// getHiddenPlayerIds for content feeds).
//
//   .filter( <var> => !<something>.has(<var>.id) )
//   .filter( <var> => !<something>.includes(<var>.id) )
//
// The leading "!" + ".id" together distinguish people-discovery from
// content filtering (posts use .playerId / .authorId, not .id).
const INLINE_FILTER_PATTERNS: RegExp[] = [
  /\.filter\(\s*(\w+)\s*=>\s*!\s*\w+\.has\(\s*\1\.id\s*\)/,
  /\.filter\(\s*(\w+)\s*=>\s*!\s*\w+\.includes\(\s*\1\.id\s*\)/,
];

function listRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts"))
    .map((e) => e.name)
    .filter((name) => !name.endsWith(".test.ts"))
    .filter((name) => !SKIP_FILES.has(name));
}

function findInlineMatches(source: string): Array<{ line: number; text: string }> {
  const lines = source.split("\n");
  const hits: Array<{ line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const re of INLINE_FILTER_PATTERNS) {
      if (re.test(line)) {
        hits.push({ line: i + 1, text: line.trim() });
        break;
      }
    }
  }
  return hits;
}

describe("people-discovery routes must use filterDiscoverableCandidates", () => {
  it("no new route file inlines `!hiddenSet.has(p.id)` style filters", () => {
    const offenders: string[] = [];

    for (const file of listRouteFiles()) {
      const source = readFileSync(join(ROUTES_DIR, file), "utf8");
      const hits = findInlineMatches(source);
      if (hits.length === 0) continue;

      const allowed = ALLOWED_INLINE.find((e) => e.file === file);
      if (allowed) continue;

      for (const hit of hits) {
        offenders.push(
          `  ${file}:${hit.line}  ${hit.text}\n` +
            `      → Use filterDiscoverableCandidates(viewerId, candidates) from ./safety.ts instead.\n` +
            `        It applies the canonical blocked + hidden-visibility + minor-account\n` +
            `        exclusion rule for people-discovery surfaces.`,
        );
      }
    }

    assert.equal(
      offenders.length,
      0,
      "Found people-discovery filtering that bypasses the shared safety helper:\n\n" +
        offenders.join("\n\n") +
        "\n\nIf this really is a non-discovery use (e.g. filtering posts by authorId, " +
        "not players by id) restructure the predicate so it doesn't match `<p>.id`. " +
        "If it IS a people-discovery surface, switch to filterDiscoverableCandidates.",
    );
  });

  it("ALLOWED_INLINE entries still point at real inline-filter sites", () => {
    // Keep the allowlist honest: if someone migrates social.ts to use the
    // helper, this test reminds them to drop the stale exemption so the
    // guard stays meaningful for future drift.
    for (const entry of ALLOWED_INLINE) {
      const source = readFileSync(join(ROUTES_DIR, entry.file), "utf8");
      const hits = findInlineMatches(source);
      assert.ok(
        hits.length > 0,
        `ALLOWED_INLINE entry for "${entry.file}" no longer matches any inline ` +
          `hiddenSet/.includes(p.id) filter. The legacy site has likely been ` +
          `migrated to filterDiscoverableCandidates — please remove this ` +
          `exemption from discoveryFilter.lint.test.ts so the guard stays tight.`,
      );
    }
  });

  it("filterDiscoverableCandidates is actually exported from safety.ts", () => {
    // Defensive: if someone renames or removes the helper, this guard's
    // failure messages would be misleading. Fail loudly instead.
    const safetySrc = readFileSync(join(ROUTES_DIR, "safety.ts"), "utf8");
    assert.match(
      safetySrc,
      /export\s+async\s+function\s+filterDiscoverableCandidates\b/,
      "filterDiscoverableCandidates is no longer exported from safety.ts. " +
        "Update discoveryFilter.lint.test.ts to point at the new helper name.",
    );
  });
});
