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
6. Creature Dex
7. Settings and privacy

## Local-first alpha loop

The mobile alpha now keeps a small hatchery loop on-device:

- Health sync awards XP and adds only newly synced steps to the active egg.
- Incubator progress is capped at the egg's step requirement.
- Ready eggs hatch into a deterministic local collection with an element and
  rarity.
- A new egg is placed into the incubator after every hatch.
- Daily movement quests are derived from the current health summary.
- The dashboard stores up to 14 daily sync summaries and shows a seven-day
  movement recap.
- The Creature Dex tracks 16 element and rarity combinations with locked
  silhouettes, owned counts, and completion progress.
- Every sync reports newly awarded XP and incubator steps.
- Hatching reveals a distinct local companion before it joins the collection.

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

## Accelerated beta tuning

The TestFlight cycle uses the `beta` progression profile so testers can reach
meaningful states during a short session:

- 1 XP per 100 steps, capped at 80 XP per day
- 1 XP per 10 active calories, capped at 40 XP per day
- 30 XP per workout, capped at 60 XP per day
- 20 XP per completed daily quest
- 15 XP for the first sync of the day
- 240 XP total daily cap
- Baby at 60 XP, Teen at 200 XP, and Final at 500 XP
- Eggs hatch after 1,500 to 5,000 steps depending on rarity

The original MVP values remain available as the `market` profile. Switch back
after beta data informs the launch economy:

```bash
EXPO_PUBLIC_PROGRESSION_PROFILE=market pnpm --filter @workspace/mobile ios
```

The app stores the awarded daily total in AsyncStorage so repeated syncs only
credit newly earned XP.

## Beta Test Lab

Accelerated beta builds include a local-only Test Lab in Settings. Testers can
preview Egg, Baby, Teen, and Final stages or mark the current incubator egg as
ready. These controls change only local HatchUp state and never write data to
Apple Health or Health Connect.

## Art Prompts

The app uses generated PNG art when available and falls back to code-drawn
avatars for missing variants. Copy-paste prompts for ChatGPT image generation
live in [`docs/art-prompts.md`](docs/art-prompts.md).

Current beta asset coverage:

- Mascot stages: Egg, Baby, Teen, and Final are wired in.
- Eggs: Leaf, Ember, and Storm common art are wired in. Non-epic variants reuse
  the common egg art for the same element when available.
- Hatchlings: Ember, Tide, and Storm common/uncommon/rare art are wired in.
- Pending: Leaf hatchlings, Tide egg, and all Epic variants.

Several generated source files currently have the checkerboard background baked
into the image instead of true alpha transparency. They work for beta testing,
but final export should be transparent PNGs with no checkerboard.

## TestFlight

TestFlight uses the `production` EAS build and submit profiles. The iOS bundle
identifier is `com.hatchup.games`. Before the first upload:

1. Create the matching App Store Connect app record.
2. Run `eas credentials --platform ios` privately in a local Terminal and let
   EAS create or attach the distribution certificate and provisioning profile.
3. Create an App Store Connect API key and store it through the private EAS
   credential flow. Do not commit the `.p8` file.

After the first-time credential setup, queue the store build and upload with:

```bash
eas build --platform ios --profile production --auto-submit
```

Apple Health access remains foreground-only and read-only in TestFlight.
