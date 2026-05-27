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

## Gotchas

- Vite `strictPort: true` was removed — it caused the workflow restart tool to fail with DIDNT_OPEN_A_PORT even though the server was running
- `@replit/vite-plugin-dev-banner` was removed from hatchup Vite config (same reason)
- Always run `pnpm --filter @workspace/api-spec run codegen` after editing `lib/api-spec/openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after editing `lib/db/src/schema/index.ts`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
