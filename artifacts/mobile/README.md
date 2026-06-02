# HatchUp Games Mobile MVP

This artifact is the small, mock-first Expo React Native MVP for HatchUp Games.
It intentionally excludes battles, social features, payments, subscriptions,
nutrition, coaching, push notifications, backend authentication, and
leaderboards.

## Included flow

1. Welcome
2. Monster setup
3. Connect health
4. Home dashboard
5. Hatchery, evolution detail, and local hatchling collection
6. Settings and privacy

## Local-first alpha loop

The mobile alpha now keeps a small hatchery loop on-device:

- Health sync awards XP and adds only newly synced steps to the active egg.
- Incubator progress is capped at the egg's step requirement.
- Ready eggs hatch into a deterministic local collection with an element and
  rarity.
- A new egg is placed into the incubator after every hatch.
- Daily movement quests are derived from the current health summary.

This remains intentionally local-first. It makes the core habit loop testable
before account recovery, cloud saves, analytics, and broader game systems are
introduced.

## Run the mock-first app

This app uses Expo development builds because real health sync requires native
code. Do not use Expo Go.

```bash
pnpm install
pnpm --filter @workspace/mobile ios
```

For Android, use:

```bash
pnpm --filter @workspace/mobile android
```

The default is a deterministic mock service. Each sync increases the cumulative
daily values so the XP, quest, incubator, and hatchling collection UI can be
exercised without HealthKit or Health Connect.

## Native health adapter boundary

The foreground, read-only native adapter is implemented. Create a fresh
development build after installing dependencies, then run the app with:

```bash
EXPO_PUBLIC_HEALTH_MODE=native pnpm --filter @workspace/mobile ios
```

For Android, use:

```bash
EXPO_PUBLIC_HEALTH_MODE=native pnpm --filter @workspace/mobile android
```

The service contract is read-only. Keep it that way for MVP:

- iOS: read HealthKit step count, active energy burned, and workouts.
- Android: read Health Connect `StepsRecord`, `ActiveCaloriesBurnedRecord`, and
  `ExerciseSessionRecord`.
- Aggregate cumulative Health Connect step values instead of summing raw records
  so multiple sources do not double count movement.
- Never request write permissions.
- Never write health records.

The Expo app config includes the iOS HealthKit entitlement, the iOS read-usage
description, Android read permissions, and the native packages' Expo config
plugins. Android uses a minimum SDK version of 26, as required by Health
Connect.

Use a real iPhone for Apple Health testing. On Android 13 and lower, install
Health Connect from Google Play before testing. Starting with Android 14,
Health Connect is part of the framework.

## XP rules

- 1 XP per 250 steps, capped at 40 XP per day
- 1 XP per 25 active calories, capped at 20 XP per day
- 20 XP per workout, capped at 40 XP per day
- 100 XP total daily cap

The app stores the awarded daily total in AsyncStorage so repeated syncs only
credit newly earned XP.
