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

To capture the storage state locally:

```bash
pnpm --filter @workspace/visual-tests exec playwright codegen \
  --save-storage=tests/visual/auth/storageState.json \
  http://localhost:3000
```

Sign in once in the launched browser, close it, and commit the
generated `storageState.json` (or wire it into CI as a secret-mounted
file). The file is git-ignored by default — opt in by force-adding it
or by storing it as a CI secret.

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
