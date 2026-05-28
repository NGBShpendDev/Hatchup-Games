# Production DB schema sync plan (Task #244 follow-on)

## Status (Task #306)

As of Task #306, this project **does not have a production database yet** —
the app has never been deployed. Attempting a read-only query against prod
returns:

> Repl ... does not have a production Neon database. Deploy your app first
> to create a production database.

There is therefore nothing to migrate. The first Publish will create the
production database from the current dev schema (which is already in sync
with `lib/db/src/schema/**`), so prod will start out matching dev.

## Going forward: how schema changes reach production

Replit applies schema changes for you in exactly two places:

1. **Task merge → development DB.** Post-merge runs
   `pnpm --filter @workspace/db run push-force` for this repo.
2. **Publish → production DB.** The Publish flow diffs dev vs prod, asks
   the user to confirm any renames in the Publish UI, and applies the SQL
   as part of the publish.

The agent must **not** run DDL or `drizzle-kit push` against the production
database, add startup-time `CREATE TABLE IF NOT EXISTS` self-healing, or
wire `db:push` into the deploy build. If prod is missing a column/table,
the fix is: make sure dev is correct, then re-publish.

See `.local/skills/database/references/database-migrations-on-publish.md`
for the full rules.

## Delta that will be applied on first publish

These were added/patched in dev during Task #244 and will land in prod the
first time the user publishes:

- `players` — `club_role`, `active_hatchling_id`, `is_suspended`, `email`,
  push-notification toggles and weekly-recap fields declared in
  `lib/db/src/schema/players.ts` (notify*, recap*, timezone,
  tzOffsetMinutes, etc.).
- `challenges.completed_push_sent_at`
- `challenge_participants.ending_soon_push_sent_at`
- `player_artifacts.featured_order`
- `notifications` table (`lib/db/src/schema/notifications.ts`)
- Unique index `players_clerk_id_unique` on `players.clerk_id`

All of these are additive (new nullable columns / new table / new unique
index), so the publish diff should be backwards-compatible. If the user
ever does have duplicate `clerk_id` values in prod, the unique index will
fail to create — de-dupe in dev first or via the Publish UI's prompts.

## After the first publish

Once prod exists, you can sanity-check it with a read-only query through
the `database` skill (`environment: "production"`), e.g.:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='players' ORDER BY 1;
SELECT to_regclass('public.notifications');
```

and confirm the deployment logs are free of "column does not exist" /
"relation does not exist" errors via `fetch_deployment_logs`.
