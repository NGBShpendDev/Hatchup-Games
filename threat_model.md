# Threat Model

## Project Overview

HatchUp is a publicly deployed social creature-hatching and fitness game with a React/Vite web frontend, an Express 5 API, PostgreSQL via Drizzle ORM, Clerk authentication, Stripe subscriptions, object storage for uploaded media, and health/location integrations. Production scope is the deployed application at `https://hatchup-games.replit.app`; mockup or sandbox-only code is out of scope unless production reachability is demonstrated. Replit terminates TLS for deployed traffic, and production is assumed to run with `NODE_ENV=production`.

## Assets

- **User accounts and sessions** — Clerk identities, authenticated API sessions, admin unlock sessions, and role flags (`isAdmin`, `isSuperAdmin`). Compromise enables account takeover or privileged moderation access.
- **Player privacy data** — profile data, blocked-user relationships, moderation reports, location visibility settings, family-group membership, weekly activity, encrypted coordinates, and any avatar/share-card imagery. Exposure can reveal sensitive behavior, relationship, or location information.
- **Competitive and progression state** — hatchlings, battles, rewards, subscriptions, entitlements, badges, fitness XP, battle history, leaderboards, and progression granted from client-pushed health activity. Tampering can create unfair advantage or unauthorized monetization benefits.
- **Uploaded media and object ACL metadata** — user-uploaded images, object ownership, and public/private visibility. Broken access control can expose private media or let attackers attach or reuse objects across accounts.
- **Payments and subscription state** — Stripe customer IDs, subscription status, webhook-driven entitlement updates, and premium gating logic. Abuse can unlock premium or affect billing state.
- **External integration tokens and health data** — OAuth-linked Google Fit, Fitbit, Garmin, Oura, and Apple sync data. Weak state validation, callback authorization, or trust in client-pushed Apple Health payloads could bind third-party data to the wrong player or let attackers forge progression-driving activity.
- **Application secrets** — `SESSION_SECRET`, database credentials, Stripe/webhook secrets, and any service tokens used by the API server. Leakage would undermine signing, encryption, or service trust.

## Trust Boundaries

- **Browser/mobile client to API** — all request bodies, route params, cookies, and query params are attacker-controlled and must be authenticated, authorized, and validated server-side.
- **Authenticated user to other authenticated users** — many routes expose social, family, group, and leaderboard data. The server must prevent IDOR, unauthorized enumeration, and privacy-setting bypasses.
- **User to admin boundary** — `/api/admin/*` routes and moderation actions must require both authentication and server-side privilege checks; admin unlock is a secondary trust boundary beyond normal user auth.
- **API to PostgreSQL** — the API has broad data access. Query construction must remain parameterized and scoped to the acting user or authorized cohort.
- **API to object storage** — uploaded objects cross from untrusted clients into persistent storage. ACL metadata and attachment flows must bind objects to the requesting owner and intended visibility.
- **API to external services** — Stripe, Clerk, Nominatim, OG/share-card remote image fetches, and health-provider OAuth callbacks/webhooks are separate trust domains. Signatures, callback state, redirect assumptions, and any client-originated health-sync claims must be validated. Any server-side fetch of user-controlled URLs is SSRF-sensitive and must not reach internal or private-network destinations.
- **Production vs dev-only code** — focus on `artifacts/api-server`, production frontend/mobile clients, shared libraries under `lib/`, and production-reachable integrations. Workflow helpers, mockups, and local-only tooling should usually be ignored unless reachable from the deployed app.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/api-server/src/middlewares/*.ts`
- **Highest-risk code areas:** auth/admin gates, social/privacy routes, location + family/group features, club/challenge membership gates, storage/object ACL flows, OG/share-card rendering routes that fetch remote media, health-sync OAuth callbacks plus Apple Health client-push ingestion, Stripe/webhook + entitlement logic
- **Public surfaces:** social post detail/view endpoints, event/club/leaderboard public reads, OG routes, selected webhook/callback endpoints, and any unauthenticated image-rendering path that dereferences stored remote URLs
- **Authenticated surfaces:** most `/api` gameplay, profile, social, storage, location, family/club/challenge, subscription, and health-sync routes
- **Admin surfaces:** `/api/admin/*`, moderation/report handling, admin session and allowlist management
- **Usually ignore unless proven reachable:** test files, workflow tooling, mockup-only artifacts, local scripts

## Threat Categories

### Spoofing

The application relies on Clerk identities plus database-backed player records and a separate admin unlock session. Every protected route MUST derive identity from trusted Clerk auth on the server, and any action that depends on a player record MUST bind the acting Clerk user to exactly one player row. OAuth callback flows and Stripe/email webhooks MUST verify state or signatures so attackers cannot impersonate external services or bind third-party accounts to the wrong player. Any client-pushed health payloads MUST be treated as attacker-controlled unless independently verified.

### Tampering

Players can submit gameplay actions, social content, uploads, subscription refreshes, and location/fitness updates. The server MUST treat client input as untrusted, enforce ownership on all `playerId` and resource-ID based actions, and keep business rules such as premium caps, anti-cheat checks, challenge/club access restrictions, and social/moderation controls server-side. Object attachment and ACL changes MUST only be possible for the uploader or an explicitly authorized workflow.

### Information Disclosure

HatchUp stores sensitive social and fitness-adjacent data including blocked-user relationships, family-group membership, club/challenge participation, moderation state, coarse or exact location, weekly activity, and private uploads. API responses MUST expose only the minimum fields authorized for the requesting user and MUST respect privacy settings, block lists, minor protections, membership rules, and visibility constraints. Secrets, raw coordinates, tokens, and internal error details MUST never be returned to clients or logged in plaintext in production.

### Denial of Service

The public deployment accepts internet traffic and includes unauthenticated as well as authenticated endpoints. Resource-intensive or high-abuse actions such as auth-adjacent flows, social writes, location updates, AI chat, uploads, and webhook/callback handling MUST have effective rate limits, bounded request sizes, and reasonable external-call timeouts so an attacker cannot cheaply exhaust API, database, or third-party quotas.

### Elevation of Privilege

The main risk is broken access control across user-to-user and user-to-admin boundaries. Routes that accept object paths, player IDs, group IDs, family-group IDs, club IDs, challenge IDs, battle identifiers, or stored remote media URLs MUST verify that the caller is the owner, a member, an invitee, or an authorized admin before exposing data or mutating state. Admin-only functions MUST not be reachable through client-controlled flags or partially protected helper endpoints. Query construction, object path handling, and server-side URL fetches must not let user input escalate into arbitrary database access, unauthorized file access, SSRF, or privilege changes.