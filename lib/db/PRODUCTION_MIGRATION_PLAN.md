# Production DB schema sync plan (Task #244 follow-on)

The shared dev DB drifted from the Drizzle schema during the finalize/integration
work and was patched by hand. The dev DB is now back in sync — `pnpm --filter
@workspace/db run push` reports "No schema changes to apply." The same delta
still needs to be applied to the production DB before the next deploy.

## Delta to apply in prod

Columns / tables added in dev that may also be missing in prod:

- `players` — `club_role`, `active_hatchling_id`, `is_suspended`, `email`, plus
  the push-notification toggles and weekly-recap fields declared in
  `lib/db/src/schema/players.ts` (notify*, recap*, timezone, tzOffsetMinutes,
  etc.).
- `challenges.completed_push_sent_at`
- `challenge_participants.ending_soon_push_sent_at`
- `player_artifacts.featured_order`
- `notifications` table (see `lib/db/src/schema/notifications.ts`)
- Unique index `players_clerk_id_unique` on `players.clerk_id`

The authoritative source is `lib/db/src/schema/**`. `drizzle-kit` will compute
the exact diff against whatever prod currently has.

## Pre-flight (run against the prod DB, read-only)

1. Use the `database` skill with `environment: "production"` to dump the current
   schema:
   - `SELECT column_name FROM information_schema.columns WHERE table_name='players' ORDER BY 1;`
   - Repeat for `challenges`, `challenge_participants`, `player_artifacts`.
   - `SELECT to_regclass('public.notifications');`
2. Check for duplicate `clerk_id` rows that would block the unique index:
   ```sql
   SELECT clerk_id, count(*) FROM players
   WHERE clerk_id IS NOT NULL
   GROUP BY clerk_id HAVING count(*) > 1;
   ```
   If any rows come back, de-dupe before pushing (keep the row with the most
   recent `updated_at`, null-out `clerk_id` on the rest, or merge accounts).
   Dev currently has zero duplicates, so this is expected to be clean in prod
   too, but verify first.

## Apply

1. Point `DATABASE_URL` at the prod connection string in a one-off shell with
   the prod secret loaded (never commit it).
2. Dry-run first: `pnpm --filter @workspace/db run push` — the script prints
   every statement it will execute and refuses to run if drizzle reports
   data-loss.
3. If the only flagged statements are the additive ones above plus the
   `players_clerk_id_unique` index, run:
   `pnpm --filter @workspace/db run push`
   (no `--force` needed — these are additive).
4. If drizzle wants to drop or truncate anything, **stop** and inspect — that
   would mean the schema has diverged in another direction and needs manual
   review before using `push-force`.

## Verify

- Re-run the pre-flight queries; all listed columns / the `notifications` table
  / the unique index should now exist.
- Smoke-test the deployed API by hitting `/api/healthz` and a couple of
  endpoints that touch the new columns (e.g. `/api/players/me`, a notifications
  list endpoint) and confirm there are no "column does not exist" errors in the
  deployment logs (`fetch_deployment_logs`).

## Rollback

`drizzle-kit push` is not transactional across statements, but every change in
this delta is additive (new columns are nullable / have defaults, new table,
new unique index). Rollback = drop the added column/table/index. There is no
data migration to undo.
