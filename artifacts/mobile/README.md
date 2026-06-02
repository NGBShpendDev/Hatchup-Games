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
5. Monster detail
6. Settings and privacy

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
daily values so the XP UI can be exercised without HealthKit or Health Connect.

## Native health adapter boundary

Set `EXPO_PUBLIC_HEALTH_MODE=native` only after native reader modules are
installed and `src/services/health/nativeHealthService.ts` is implemented.

The service contract is read-only. Keep it that way for MVP:

- iOS: read HealthKit step count, active energy burned, and workouts.
- Android: read Health Connect `StepsRecord`, `ActiveCaloriesBurnedRecord`, and
  `ExerciseSessionRecord`.
- Aggregate cumulative Health Connect step values instead of summing raw records
  so multiple sources do not double count movement.
- Never request write permissions.
- Never write health records.

The Expo app config already includes the iOS HealthKit entitlement, the iOS
read-usage description, and Android read permissions. A native adapter package
may add its own config plugin requirements.

## XP rules

- 1 XP per 250 steps, capped at 40 XP per day
- 1 XP per 25 active calories, capped at 20 XP per day
- 20 XP per workout, capped at 40 XP per day
- 100 XP total daily cap

The app stores the awarded daily total in AsyncStorage so repeated syncs only
credit newly earned XP.
