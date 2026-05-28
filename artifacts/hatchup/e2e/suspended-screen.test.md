# E2E: Suspended-user full-screen blocker

The runnable Playwright spec for this flow lives at
`tests/visual/tests/suspended-screen.spec.ts` (package
`@workspace/visual-tests`).

```bash
# install the chromium binary once
pnpm --filter @workspace/visual-tests exec playwright install chromium

# run just this spec (needs a captured Clerk storage state)
pnpm --filter @workspace/visual-tests exec playwright test suspended-screen.spec.ts
```

The spec skips with a clear reason when no Clerk storage state is
present at `tests/visual/auth/storageState.json` — see
`tests/visual/README.md` for how to capture it.

## What it locks in

- When `GET /api/players/me` returns a player whose `isSuspended=true`,
  the app shell is fully replaced by `<SuspendedScreen />` — the
  normal routes (home grid, primary nav links) never mount.
- The blocker reads `GET /api/players/me/suspension` and surfaces the
  recorded reason, the "Suspended since …" header, and the resolving
  admin's label.
- The "Submit appeal" CTA opens the dialog and clicking submit fires
  exactly one `POST /api/account/appeals` with the trimmed message
  verbatim.

## Backend mocking

All API responses are stubbed with `page.route`, so the only real
prerequisite is a Clerk-authenticated browser context. No DB seeding
is required.
