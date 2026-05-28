# Visual regression tests

Lightweight Playwright snapshot tests that protect the neon look of the
HatchUp frontend. They capture full-page screenshots of the highly
visual pages (`hatchlings`, `compete`, `social`, `groups`) and fail the
build if a glow disappears, a button loses its neon styling, or any
other unexpected pixel diff sneaks in.

## What it covers

The spec at `tests/neon-look.spec.ts` snapshots these routes:

- `/hatchlings`
- `/compete`
- `/social`
- `/groups`

Baselines live next to the spec under
`tests/neon-look.spec.ts-snapshots/`. The first run creates them; later
runs compare against them.

The spec at `tests/hatchling-share.spec.ts` exercises the mobile share
button on the Expo web server (see [Mobile share spec](#mobile-share-spec)
below).

## Running

The frontend (`@workspace/hatchup`) must be running and reachable at
`http://localhost:3000` (override with `HATCHUP_BASE_URL` or
`HATCHUP_PORT`).

```bash
# one-time install of the browser binary
pnpm --filter @workspace/visual-tests exec playwright install chromium

# run the suite
pnpm --filter @workspace/visual-tests run test

# accept intentional visual changes (regenerate baselines)
pnpm --filter @workspace/visual-tests run test:update
```

## Auth (Clerk storage state)

The target pages require an authenticated Clerk session. Playwright
loads a pre-captured storage state from
`tests/visual/auth/storageState.json` (override with
`HATCHUP_STORAGE_STATE`). If the file is missing every test is **skipped
with a clear reason** rather than silently snapshotting a sign-in page.

To capture the storage state automatically (no human in the loop):

```bash
# Requires CLERK_SECRET_KEY + DATABASE_URL in your env.
# The frontend (@workspace/hatchup) must be running on
# http://localhost:3000 (or set HATCHUP_BASE_URL).
pnpm --filter @workspace/visual-tests run capture-auth
```

What the script does:

1. Ensures a dedicated Clerk test user exists
   (default email: `visual-tests+clerk_test@hatchup.test`,
   username: `visual_tester`). The `+clerk_test` suffix tells Clerk
   to treat it as a test user in dev instances.
2. Upserts a matching `players` row and a starter hatchling so
   `/hatchlings` and the rest of the snapshot pages render with real
   content instead of an empty state.
3. Mints a one-shot Clerk sign-in token via the backend API and
   drives a headless Chromium through `/sign-in?__clerk_ticket=…`
   to obtain the authenticated cookies.
4. Writes the browser storage state to
   `tests/visual/auth/storageState.json`.
5. Copies the same state to `tests/visual/auth/mobileStorageState.json`
   so the mobile share spec also runs without skipping (see below).

The output files are git-ignored. For CI, run the same `capture-auth`
script as a job step (with `CLERK_SECRET_KEY`, `DATABASE_URL`, and a
running frontend) before `pnpm --filter @workspace/visual-tests run
test`, or upload the generated `storageState.json` once as a
secret-mounted file and point `HATCHUP_STORAGE_STATE` at it.

Override the defaults with any of these env vars:

- `HATCHUP_BASE_URL` — defaults to `http://localhost:3000`
- `HATCHUP_STORAGE_STATE` — web app output path
- `HATCHUP_MOBILE_STORAGE_STATE` — mobile app output path (defaults to
  `tests/visual/auth/mobileStorageState.json`)
- `HATCHUP_TEST_EMAIL` / `HATCHUP_TEST_USERNAME` /
  `HATCHUP_TEST_DISPLAY_NAME` — identity of the test account

## Mobile share spec

`tests/hatchling-share.spec.ts` exercises the share button on the Expo
mobile web server (default port `25366`). Override with:

- `HATCHUP_MOBILE_PORT` — Expo dev server port (default `25366`)
- `HATCHUP_MOBILE_BASE_URL` — full URL override (e.g. `http://localhost:25366`)
- `HATCHUP_MOBILE_STORAGE_STATE` — path to the mobile Clerk storage state

### Auth for the mobile spec

Clerk cookies are scoped to the **`localhost` domain**, not to a
specific port. This means the storage state captured for the web app at
`localhost:3000` also satisfies Clerk's auth check on the Expo dev
server at `localhost:25366`.

Running `capture-auth` once therefore covers both specs:

```bash
# Captures web state → tests/visual/auth/storageState.json
# Copies it         → tests/visual/auth/mobileStorageState.json
pnpm --filter @workspace/visual-tests run capture-auth
```

If you need a completely independent mobile storage state (e.g. a
different test account or a pre-built static export), set
`HATCHUP_MOBILE_STORAGE_STATE` to point at it:

```bash
HATCHUP_MOBILE_STORAGE_STATE=/path/to/mobile-auth.json \
  pnpm --filter @workspace/visual-tests run test
```

The spec checks `HATCHUP_MOBILE_STORAGE_STATE` first, then falls back
to `HATCHUP_STORAGE_STATE` / the shared `storageState.json`. The test
is skipped only when neither file is present.

### CI setup for the mobile spec

Add these steps **before** the test run:

```yaml
- name: Capture Clerk auth (web + mobile)
  env:
    CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
  run: pnpm --filter @workspace/visual-tests run capture-auth

- name: Run visual tests (includes hatchling-share)
  run: pnpm --filter @workspace/visual-tests run test
```

`capture-auth` writes both `storageState.json` and
`mobileStorageState.json`, so `hatchling-share.spec.ts` will not skip.

## CI

The suite is designed to run in CI:

- `forbidOnly` and `retries: 1` are enabled when `CI=1`.
- Reporter switches to GitHub annotations plus a `list` summary.
- A single worker keeps screenshots deterministic.

Add a CI step that:

1. Starts the API server and frontend (or a built `vite preview`).
2. Provides `HATCHUP_STORAGE_STATE` pointing at a stored Clerk session.
3. Runs `pnpm --filter @workspace/visual-tests run test`.

Failed diffs are uploaded as Playwright traces / report artifacts so
reviewers can see exactly which pixels moved.
