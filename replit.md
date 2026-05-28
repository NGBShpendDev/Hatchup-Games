# HATCHUP

A creature-hatching game universe where players hatch and evolve creatures called Hatchlings, compete in mini-games, climb rankings, join clubs, and participate in live events.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/hatchup run dev` — run the frontend (port 3000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Framer Motion + wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/db/src/schema/index.ts` — Database schema (Drizzle ORM)
- `lib/api-client-react/src/generated/` — Generated React Query hooks
- `lib/api-zod/src/generated/api.ts` — Generated Zod schemas
- `artifacts/hatchup/src/` — React frontend
  - `pages/` — All 10 pages (home, hatchlings, hatchling-detail, evolutions, compete, race, leaderboard, events, club, hatch)
  - `components/` — Layout, hatchling-card, rank-badge, shadcn/ui components
  - `index.css` — Dark neon theme (pink/red primary)
- `artifacts/api-server/src/routes/` — Express route handlers

## Architecture decisions

- Contract-first: OpenAPI spec drives both frontend hooks (Orval) and backend validation (Zod)
- Hardcoded player ID 1 ("DragonMaster") for the MVP — no auth yet
- All DB date columns serialized to `.toISOString()` in routes (Drizzle returns Date objects)
- `gameModesTable.isLive` stored as `text` ("true"/"false"), not boolean
- Vite config uses optional PORT env var (defaults to 3000) to work with the artifact workflow system

## Product

- **Hatch**: Open eggs to get new Hatchlings with randomized stats and rarity
- **My Hatchlings**: Browse, feed, and manage your creature collection
- **Hatchling Detail**: View stats (happiness, hunger, energy), abilities, and evolution progress
- **Evolutions**: See all evolution paths and what your creatures can become
- **Compete**: Enter races and mini-games with your Hatchlings
- **Leaderboard**: Global and mode-specific rankings
- **Events**: Live limited-time events with rewards
- **Club**: Join or create clubs, view club leaderboards

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Safety Master Prompt

HatchUp is a family-friendly social fitness platform. All agents must build with these safety-first constraints:

### Core Safety Rules (non-negotiable)
1. **Public locations only** — All workout partner meetups, group workouts, and live events must display the message "Meet in public locations only. Use caution when meeting new people." Any UI that facilitates real-world meetups must include a SafetyBanner component.
2. **Block & Report** — Every user profile card, group member list, and social post must have a three-dot menu with "Report" and "Block" options. Reports queue in `user_reports` table for moderation review.
3. **Privacy controls** — Users control their location visibility (exact / neighborhood / city / hidden). Default is `city`. Never expose exact location without user consent.
4. **Workout request approval** — The `requireWorkoutApproval` toggle must be respected server-side before allowing anyone to add a user as a workout partner.
5. **Emergency contact** — Users can designate an emergency contact (name + phone). This is stored in the players table and surfaced during live events.
6. **Profile verification** — Opt-in identity verification flow adds a blue checkmark badge (isVerified). No real ID scanning — photo + date stamp only.
7. **Anti-harassment** — All group chat and social post content runs through a basic profanity/filter check (isFiltered flag on group_messages). Flagged content is hidden with a "Message removed" placeholder.
8. **Admin moderation** — `/admin/reports` page (isAdmin flag on player) lets admins review, resolve, or dismiss reports.

### Safety Architecture
- `user_reports` table: reporter_id, reported_user_id, reason, content_type, content_id, status (open/resolved/dismissed)
- `blocked_users` table: blocker_id, blocked_id (unique pair)
- Players table safety columns: emergencyContactName, emergencyContactPhone, locationVisibility, requireWorkoutApproval, isAdmin, isVerified
- Safety components: SafetyBanner, SafetyGuidelinesSheet, ReportBlockMenu
- Privacy settings page: `/settings/privacy`
- Admin moderation: `/admin/reports`

### Approved Safety Copy
- "Meet in public locations only. Use caution when meeting new people."
- "Always meet workout partners in public places like gyms, parks, or recreation centers."
- "Report suspicious behavior immediately."
- "This is a public event. Meet only in the listed public location."
- "HatchUp is a safe, trusted, and family-friendly community."

## Gotchas

- Vite `strictPort: true` was removed — it caused the workflow restart tool to fail with DIDNT_OPEN_A_PORT even though the server was running
- `@replit/vite-plugin-dev-banner` was removed from hatchup Vite config (same reason)
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `lib/api-spec/openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after editing `lib/db/src/schema/index.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
