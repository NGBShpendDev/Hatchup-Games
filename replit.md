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

## Launch Readiness (Pre-launch Hardening pass)

These systems were added in the pre-launch hardening sweep and must stay wired:

### Auth & security
- Auth: Clerk (`@clerk/express`). MFA, account recovery, password resets are handled by Clerk's user portal at `/user`.
- All `/api` routes go through `helmet`, locked CORS (`REPLIT_DOMAINS`), and global rate limits (`generalLimiter` 100/min, `mutationLimiter` 20/min on writes).
- Per-endpoint stricter limiters live in `artifacts/api-server/src/middlewares/rateLimiters.ts`:
  - `locationUpdateLimiter` on `POST /players/me/location`
  - `fitnessLogLimiter` on `POST /fitness/log`
  - `socialWriteLimiter` on social writes (posts, comments, reacts, follows, reposts)
  - `aiCoachLimiter` on `POST /coach/chat`
  - `scanLimiter` reserved for body/meal scan endpoints when added
- GPS coordinates are AES-256-GCM encrypted via `SESSION_SECRET` (min 16 chars). `decryptCoordinate` is in-memory only — never serialize coords.

### Anti-cheat (`artifacts/api-server/src/services/antiCheat.ts`)
- `validateGpsUpdate` — rejects >300 km/h velocity, flags >120 km/h or weak (>500m) fixes as suspicious. Wired into `POST /players/me/location` using the decrypted previous fix.
- `validateStepDelta` — rejects >400 steps/min and negative/zero-time deltas; flags sustained sprint cadence.
- `POST /fitness/log` rejects sub-3:00/mile pace and >24h durations.
- Pure functions are unit-tested (`antiCheat.test.ts`) via Node's built-in `node:test` runner. Run with `pnpm --filter @workspace/api-server run test`.

### Minor / parental controls
- `playersTable.isMinor` toggles safer defaults. When enabled via `PATCH /players/:id/privacy-settings`, the API forces `locationVisibility="city"` and `requireWorkoutApproval=true`.
- Minor status is a **one-way self-service flag**: any user can mark themselves as a minor, but clearing the flag requires an admin (guardian) account. Non-admin requests that send `isMinor=false` against a currently-minor account get `403 minor_status_immutable`.
- `blockMinorSocialWrite` middleware (in `artifacts/api-server/src/middlewares/minorGuard.ts`) is applied to social posts/comments/reacts/reposts/follows and group chat messages. Returns `403 minor_account_restricted` for flagged accounts.
- Settings UI: `/settings/privacy` exposes the minor toggle, MFA portal link (`/user`), location visibility, workout approval, and emergency contact.

### Anti-cheat extensions to be aware of
- When adding a new fitness ingestion endpoint, call `validateStepDelta` before persisting.
- When adding a new location ingestion endpoint, call `validateGpsUpdate` against the previous decrypted fix.

## Subscriptions & Entitlement (Task #41)

Smart monetization that **never grants a competitive advantage**. Premium unlocks convenience, customization, analytics, and broader leaderboard scopes — never raw battle/race power.

### Pricing
- Monthly: $8.99 (`price.unit_amount = 899`)
- Yearly: $80 (`price.unit_amount = 8000`)
- Single Stripe product `metadata.app="hatchup"`, `metadata.kind="premium"`.
- Seed with `pnpm --filter @workspace/scripts exec tsx src/seed-stripe-products.ts`.

### Entitlement resolver (`services/entitlement.ts`)
Pure function over the player row. Premium precedence:
1. `paidUntil > now`  → source `paid`
2. `trialEndsAt > now` → source `trial` (7 days from signup)
3. `top10LastCheckedAt` within 24h AND `top10ContextLabel` set → source `top10`
4. Otherwise → free, source `expired`

### Free vs Premium caps
- Hatchlings: 6 vs unlimited (`enforceHatchlingCap` on `POST /hatchlings`)
- AI coach messages/day: 5 vs unlimited (`enforceCoachDailyCap` on `POST /coach/chat`)
- Battle entries/day: 5 vs unlimited (`enforceBattleDailyCap` on `POST /battles/queue/join`)
- Leaderboard scopes: `world`+`country` vs all (gated in `GET /leaderboards/scoped`)
- Customization slots, premium cosmetics, advanced analytics, unlimited social: premium-only

### Top-10 City Exemption (`services/top10.ts`)
Across 6 metrics — xp, steps, workouts, battle_wins, streaks, artifacts — if a player ranks ≤10 in their **city cohort** for ANY of them, they get free Premium. Recomputed lazily (24h cache) by `attachEntitlement` middleware.

### Stripe wiring
- `stripeClient.ts` — Replit-managed connection (never cache the client).
- `webhookHandlers.ts` — passes raw payload to `stripe-replit-sync` AND projects `customer.subscription.*` events onto `players.paidUntil` / `players.subscriptionTier` for fast entitlement reads.
- Webhook route `/api/stripe/webhook` registered **before** `express.json()` in `app.ts`.
- `initStripe()` in `index.ts` runs migrations + sets up managed webhook + `syncBackfill()` on boot (best-effort — server still boots if Stripe is offline).
- `stripe-replit-sync` is externalized in `build.mjs` because it loads SQL migration files from a sibling `./migrations` dir via `__dirname`; bundling breaks that path.

### Subscription routes (`routes/subscription.ts`)
- `GET /subscription/me` — full entitlement snapshot + pricing + `stripeConfigured`
- `POST /subscription/refresh-top10` — manual recheck
- `POST /subscription/checkout` — Stripe Checkout session (returns 503 if Stripe not connected)
- `POST /subscription/portal` — Stripe customer portal

### Frontend
- `/subscription` paywall page with plan picker, status block, feature comparison, Top-10 explainer.
- `<SubscriptionChip />` in `home.tsx` header — shows Premium / Trial Xd / Top-10 / Upgrade.
- New players are auto-seeded with `subscriptionTier="premium"`, `subscriptionSource="trial"`, `trialEndsAt=now+7d`.

## Gotchas

- Vite `strictPort: true` was removed — it caused the workflow restart tool to fail with DIDNT_OPEN_A_PORT even though the server was running
- `@replit/vite-plugin-dev-banner` was removed from hatchup Vite config (same reason)
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `lib/api-spec/openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after editing `lib/db/src/schema/index.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
