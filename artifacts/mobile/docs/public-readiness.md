# HatchUp Public Readiness Notes

This beta is still local-first, but it now has the seams needed for public-ready
systems without breaking TestFlight.

## Backend Environment Hooks

- `EXPO_PUBLIC_HATCHUP_API_URL`: enables cloud-save POSTs to
  `/v1/cloud-save`.
- `EXPO_PUBLIC_LEADERBOARD_API_URL`: enables opted-in leaderboard ranking POSTs.
- `EXPO_PUBLIC_ANALYTICS_API_URL`: enables opt-in analytics event POSTs to
  `/events`.
- `EXPO_PUBLIC_CRASH_REPORT_URL`: enables crash report POSTs.

When these are absent, the app stays local-only and TestFlight-safe.

## Backend Requirements Before Public Launch

- Account creation and recovery.
- Cloud save conflict resolution.
- Leaderboard anti-cheat validation on the server, not only on the client.
- Data deletion and export endpoints.
- Privacy policy and support flows linked from App Store metadata.
- Production analytics dashboard with opt-out respected.

## Art Requirements Before Public Launch

- Keep creature PNGs on real transparency.
- Finish Leaf hatchlings, Tide egg, and Epic variants.
- Run `pnpm --filter @workspace/mobile clean:assets` after importing art with
  a baked checkerboard or solid light background.
- Run `pnpm --filter @workspace/mobile audit:assets` before each art build.

## Retention Requirements Before Public Launch

- Tune weekly goal values with real beta data.
- Add event-based egg drops.
- Add streak recovery messaging before adding push notifications.
- Avoid pressure mechanics that punish missed activity.
