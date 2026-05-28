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

The output file is git-ignored. For CI, run the same `capture-auth`
script as a job step (with `CLERK_SECRET_KEY`, `DATABASE_URL`, and a
running frontend) before `pnpm --filter @workspace/visual-tests run
test`, or upload the generated `storageState.json` once as a
secret-mounted file and point `HATCHUP_STORAGE_STATE` at it.

Override the defaults with any of these env vars:

- `HATCHUP_BASE_URL` — defaults to `http://localhost:3000`
- `HATCHUP_STORAGE_STATE` — output path
- `HATCHUP_TEST_EMAIL` / `HATCHUP_TEST_USERNAME` /
  `HATCHUP_TEST_DISPLAY_NAME` — identity of the test account

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
