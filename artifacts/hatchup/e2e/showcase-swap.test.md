# E2E: Showcase swap flow

The runnable Playwright spec for this flow lives at
`tests/visual/tests/showcase-swap.spec.ts` (package
`@workspace/visual-tests`).

```bash
# install the chromium binary once
pnpm --filter @workspace/visual-tests exec playwright install chromium

# run just this spec (needs DATABASE_URL + a captured Clerk storage state)
pnpm --filter @workspace/visual-tests exec playwright test showcase-swap.spec.ts
```

The spec skips with a clear reason when either prerequisite is missing
(no Clerk storage state at `tests/visual/auth/storageState.json` or no
`DATABASE_URL`) — see `tests/visual/README.md` for capturing the storage
state.

## What it locks in

- The "Add artifact" trigger flips to **"Swap artifact"** when the
  showcase is full (3/3).
- The picker sheet ("Swap into your showcase") lists only addable
  discovered artifacts.
- Picking one transitions to the swap-target step ("Swap with…") with
  one button per currently-featured artifact plus a back button.
- The back button returns to the picker without firing a toast.
- The actual swap fires **exactly one** "Showcase swapped" toast — not
  the two per-toggle toasts ("Removed from showcase" + "Featured on
  profile") that the underlying mutation would otherwise emit. This is
  the key regression guard.
- After the swap, the new artifact is featured, the old one no longer
  carries the FEATURED label, the count stays 3/3, and the persisted
  `player_artifacts.is_featured` flags match.

## Seed data

Per run, the spec:

1. Calls `GET /api/players/me` to discover the signed-in player id.
2. Picks the 4 lowest-id non-hidden catalog artifacts from `artifacts`.
3. Wipes the player's `player_artifacts` and inserts 3 featured rows
   (slots 0/1/2) plus 1 unfeatured discovered row.
