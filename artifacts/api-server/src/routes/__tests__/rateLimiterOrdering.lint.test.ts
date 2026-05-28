// Repo-level safety guard for per-player rate limiter ordering.
//
// Every per-player limiter in
//   artifacts/api-server/src/middlewares/rateLimiters.ts
// is keyed on `req.playerId`, which is only populated after `requireAuth`
// and `attachPlayer` have run. If a future route mounts one of these
// limiters BEFORE that auth pair, the keyGenerator silently falls back to
// the request IP — and the shared-NAT bug returns: corporate Wi-Fi, school
// networks, and cellular CGNAT users start throttling each other.
//
// The runtime test suite (e.g. coachRateLimiter.test.ts) only covers the
// handful of routes that exist today. This lint test is the build-time
// guard for every NEW route that imports a per-player limiter: it
// statically walks every router.<METHOD>(...) call in
// artifacts/api-server/src/routes/*.ts, and for any call that includes one
// of the guarded limiter identifiers, it asserts that BOTH `requireAuth`
// and `attachPlayer` appear earlier in the same handler chain.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROUTES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// The per-player limiters that depend on `req.playerId`. Keep this list
// in sync with artifacts/api-server/src/middlewares/rateLimiters.ts —
// every NEW per-player limiter exported from that module must be added
// here so this guard covers it.
const GUARDED_LIMITERS = [
  "locationUpdateLimiter",
  "fitnessLogLimiter",
  "socialWriteLimiter",
  "aiCoachLimiter",
  "scanLimiter",
  "recapPreviewLimiter",
] as const;

const ROUTER_METHOD_RE =
  /\brouter\s*\.\s*(get|post|put|patch|delete|all|use)\s*\(/g;

/**
 * Walk forward from `openParenIdx` (the index of the `(` that opens the
 * call) and return the index of its matching `)`, skipping over nested
 * parens, brackets, braces, strings, template literals, and comments so
 * we don't misalign on arrow-function handler bodies.
 */
function findMatchingClose(src: string, openParenIdx: number): number {
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let i = openParenIdx;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    // line comment
    if (ch === "/" && next === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    // block comment
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // string / template literal
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < src.length) {
        const c = src[i];
        if (c === "\\") { i += 2; continue; }
        if (c === quote) { i += 1; break; }
        // template literal interpolation — skip the ${...} expression
        // so a `}` inside doesn't unbalance our outer brace counter.
        if (quote === "`" && c === "$" && src[i + 1] === "{") {
          let d = 1;
          i += 2;
          while (i < src.length && d > 0) {
            const cc = src[i];
            if (cc === "{") d += 1;
            else if (cc === "}") d -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "(") depthParen += 1;
    else if (ch === ")") {
      depthParen -= 1;
      if (depthParen === 0) return i;
    } else if (ch === "{") depthBrace += 1;
    else if (ch === "}") depthBrace -= 1;
    else if (ch === "[") depthBracket += 1;
    else if (ch === "]") depthBracket -= 1;
    i += 1;
  }
  return -1;
}

/**
 * Return the offsets of every top-level identifier reference to `name`
 * inside the argument-list slice. Skips matches inside strings, template
 * literals, comments, and any nested arrow-function body (depth > 0) so
 * a `requireAuth` reference inside `async (req, res) => { … }` isn't
 * counted as the route's middleware chain position.
 */
function findTopLevelIdentifierOffsets(slice: string, name: string): number[] {
  const out: number[] = [];
  const wordRe = new RegExp(`\\b${name}\\b`, "g");
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let i = 0;
  while (i < slice.length) {
    const ch = slice[i];
    const next = slice[i + 1];
    if (ch === "/" && next === "/") {
      const nl = slice.indexOf("\n", i);
      i = nl === -1 ? slice.length : nl + 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = slice.indexOf("*/", i + 2);
      i = end === -1 ? slice.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i += 1;
      while (i < slice.length) {
        const c = slice[i];
        if (c === "\\") { i += 2; continue; }
        if (c === quote) { i += 1; break; }
        if (quote === "`" && c === "$" && slice[i + 1] === "{") {
          let d = 1;
          i += 2;
          while (i < slice.length && d > 0) {
            const cc = slice[i];
            if (cc === "{") d += 1;
            else if (cc === "}") d -= 1;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "(") { depthParen += 1; i += 1; continue; }
    if (ch === ")") { depthParen -= 1; i += 1; continue; }
    if (ch === "{") { depthBrace += 1; i += 1; continue; }
    if (ch === "}") { depthBrace -= 1; i += 1; continue; }
    if (ch === "[") { depthBracket += 1; i += 1; continue; }
    if (ch === "]") { depthBracket -= 1; i += 1; continue; }

    // Identifier at top level only: the route's middleware-chain args are
    // the arguments that sit directly at depth 0 of the router call's
    // arg list. Nested paren/brace/bracket scopes are handler bodies,
    // option objects, etc., and don't represent middleware ordering.
    if (depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      wordRe.lastIndex = i;
      const m = wordRe.exec(slice);
      if (m && m.index === i) {
        out.push(m.index);
        i += m[0].length;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

function listRouteFiles(): string[] {
  return readdirSync(ROUTES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".ts"))
    // Skip *.test.ts (test files mock the limiters with passThrough stubs,
    // which would otherwise be flagged as the limiter "appearing first").
    .filter((d) => !d.name.endsWith(".test.ts"))
    .map((d) => join(ROUTES_DIR, d.name));
}

type Finding = {
  file: string;
  limiter: string;
  line: number;
  missing: string[];
  snippet: string;
};

function scanFile(path: string): Finding[] {
  const src = readFileSync(path, "utf8");
  const findings: Finding[] = [];

  // Quick early-out: file doesn't reference any guarded limiter at all.
  if (!GUARDED_LIMITERS.some((n) => src.includes(n))) return findings;

  ROUTER_METHOD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROUTER_METHOD_RE.exec(src)) !== null) {
    const openParenIdx = src.indexOf("(", match.index + match[0].length - 1);
    const closeIdx = findMatchingClose(src, openParenIdx);
    if (closeIdx === -1) continue;
    const slice = src.slice(openParenIdx + 1, closeIdx);

    for (const limiter of GUARDED_LIMITERS) {
      const limiterOffsets = findTopLevelIdentifierOffsets(slice, limiter);
      if (limiterOffsets.length === 0) continue;
      const firstLimiterOff = limiterOffsets[0]!;

      const authOffsets = findTopLevelIdentifierOffsets(slice, "requireAuth");
      const playerOffsets = findTopLevelIdentifierOffsets(slice, "attachPlayer");

      const authBefore = authOffsets.some((o) => o < firstLimiterOff);
      const playerBefore = playerOffsets.some((o) => o < firstLimiterOff);

      const missing: string[] = [];
      if (!authBefore) missing.push("requireAuth");
      if (!playerBefore) missing.push("attachPlayer");

      if (missing.length > 0) {
        const lineNo = src.slice(0, openParenIdx).split("\n").length;
        const snippet = src
          .slice(openParenIdx + 1, openParenIdx + 1 + Math.min(slice.length, 160))
          .replace(/\s+/g, " ")
          .trim();
        findings.push({ file: path, limiter, line: lineNo, missing, snippet });
      }
    }
  }
  return findings;
}

describe("per-player rate limiters must run AFTER requireAuth + attachPlayer", () => {
  it("every router.<method>() call that uses a guarded limiter has both auth middlewares earlier in the chain", () => {
    const allFindings: Finding[] = [];
    for (const file of listRouteFiles()) {
      allFindings.push(...scanFile(file));
    }
    if (allFindings.length > 0) {
      const lines = allFindings.map(
        (f) =>
          `  ${f.file}:${f.line}\n    limiter: ${f.limiter}\n    missing before limiter: ${f.missing.join(", ")}\n    handler chain: router…(${f.snippet})`,
      );
      assert.fail(
        `Per-player rate limiter ordering regression detected.\n\n` +
          `Each of these routes mounts a per-player limiter without first running the\n` +
          `auth middleware that populates req.playerId. The limiter will silently fall\n` +
          `back to IP keying and the shared-NAT bug returns.\n\n` +
          `Fix: put requireAuth and attachPlayer BEFORE the limiter in the handler chain.\n\n` +
          lines.join("\n\n"),
      );
    }
  });

  // Self-test: prove the scanner actually flags a misordered chain. Without
  // this, a bug in findTopLevelIdentifierOffsets that silently returns no
  // matches would make the lint above pass vacuously on a future regression.
  it("self-test: scanner flags a synthetic misordered route", () => {
    const dir = mkdtempSync(join(tmpdir(), "rl-lint-"));
    try {
      const bad = join(dir, "bad.ts");
      writeFileSync(
        bad,
        `import { aiCoachLimiter } from "x";\n` +
          `import { requireAuth, attachPlayer } from "y";\n` +
          `router.post("/bad", aiCoachLimiter, requireAuth, attachPlayer, async (req, res) => { res.end(); });\n`,
        "utf8",
      );
      const findings = scanFile(bad);
      assert.equal(findings.length, 1, "scanner should flag the synthetic misordered route");
      assert.equal(findings[0]!.limiter, "aiCoachLimiter");
      assert.deepEqual(findings[0]!.missing, ["requireAuth", "attachPlayer"]);

      const good = join(dir, "good.ts");
      writeFileSync(
        good,
        `import { aiCoachLimiter } from "x";\n` +
          `import { requireAuth, attachPlayer } from "y";\n` +
          `router.post("/good", requireAuth, attachPlayer, aiCoachLimiter, async (req, res) => { res.end(); });\n`,
        "utf8",
      );
      assert.equal(scanFile(good).length, 0, "scanner should accept correctly ordered route");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
