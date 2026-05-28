# Upsell paywall coverage (Task #628)

Verifies every `/subscription?from=...` upsell entry point added in Task #623.

Run via the Replit testing skill (`runTest`) with `testClerkAuth: true`. This
plan is the source of truth for the assertions and can be copy-pasted into
the testing subagent verbatim.

## What it covers

For each upsell source key in
`[accent, hatchling_cap, coach_cap, battle_cap, leaderboard_scope, customization_slot]`:

- Visiting `/subscription?from=<key>` renders `banner-upsell-<key>` with the
  exact eyebrow/title/body from `UPSELL_SOURCE_COPY` in
  `artifacts/hatchup/src/pages/subscription.tsx`.
- The premium feature list shows `feature-highlight-<key>` with the matching
  highlighted feature text.
- `console.info("[subscription] upsell_view", { from })` fires **exactly once
  per visit** (verified across an initial nav + a page reload).

Plus the in-app source surfaces:

- B1 — leaderboard locked-scope click → `/subscription?from=leaderboard_scope`
- B2 — accent / customization upsell from `/settings/privacy` →
  `/subscription?from=accent`
- B3 — coach cap link (conditional: only present after the daily cap is hit;
  if present, its `href` must be `/subscription?from=coach_cap`)

## Setup notes

New players start on a 7-day Premium trial, which hides
`banner-upsell-<from>` because of the `!isPremium` guard in `subscription.tsx`.
The plan demotes the test user to free tier via a `[DB]` step right after
sign-in so the banners render:

```sql
UPDATE players
   SET subscription_tier = 'free',
       subscription_source = 'expired',
       trial_ends_at = NOW() - INTERVAL '1 day',
       paid_until = NULL
 WHERE email = '${test_email}';
```

## Test plan (paste into `runTest`)

```text
1. [New Context] Create a new browser context.
2. [Clerk Auth] Sign in as {firstName: "Upsell", lastName: "Tester", email: `upsell-${nanoid(6)}@example.com`}. Note the email as ${test_email}.
3. [Browser] Navigate to / and wait for the home page to load (triggers player upsert).
4. [DB] UPDATE players SET subscription_tier='free', subscription_source='expired',
        trial_ends_at = NOW() - INTERVAL '1 day', paid_until = NULL
        WHERE email = '${test_email}'; assert 1 row updated.
5. [Browser] Reload / to drop cached subscription state.

For EACH key in [accent, hatchling_cap, coach_cap, battle_cap, leaderboard_scope, customization_slot]:
  a. [Browser] Clear console, navigate to /subscription?from=<KEY>.
  b. [Verify]
     - data-testid="banner-upsell-<KEY>" visible
     - eyebrow / title / body match UPSELL_SOURCE_COPY[<KEY>]
     - data-testid="feature-highlight-<KEY>" exists with the highlighted feature text
     - exactly one console.info "[subscription] upsell_view" mentioning <KEY>
  c. [Browser] Reload.
  d. [Verify] exactly one additional "[subscription] upsell_view" log for <KEY>.

B1. /leaderboard → click data-testid="scope-city" → click data-testid="banner-leaderboard-scope-upsell"
    Verify URL is /subscription?from=leaderboard_scope and banner-upsell-leaderboard_scope renders.

B2. /settings/privacy → "Share card accent" → click data-testid="link-accent-upsell"
    (or first locked accent-option-*). Verify URL /subscription?from=accent + banner-upsell-accent.

B3. /coach → if data-testid="coach-cap-upsell" is present, its <a> href is /subscription?from=coach_cap.
    Otherwise, record observation (non-failing).
```

## Expected copy table

| from                 | eyebrow                  | title                                     | highlight feature                                  |
| -------------------- | ------------------------ | ----------------------------------------- | -------------------------------------------------- |
| accent               | Cosmetic upgrade         | Unlock the full accent palette            | Premium cosmetics + 12 customization slots         |
| hatchling_cap        | Roster full              | Hatch as many Pals as you want            | Unlimited Hatchlings                               |
| coach_cap            | Coach is tapped out      | Unlimited AI coaching                     | Unlimited AI coach + advanced analytics            |
| battle_cap           | Daily battles used       | Battle without the daily cap              | Unlimited battles + ranked play                    |
| leaderboard_scope    | Local boards locked      | Compete in your city, county, and state   | Local leaderboards (nearby, city, county, state)   |
| customization_slot   | Customization locked     | Unlock 12 customization slots             | Premium cosmetics + 12 customization slots         |

## Last verified

2026-05-28 — passed via `runTest` (Clerk auth, mobile viewport 400×720).
All six paywall sources rendered the correct banner + highlight, breadcrumb
fired once per visit, leaderboard and accent CTAs routed correctly, and the
coach cap link was absent (as expected without a real cap hit) — recorded as
a conditional observation per plan.
