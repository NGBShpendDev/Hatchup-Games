import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "HatchUp Games",
  slug: "hatchup-games-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "hatchup",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.hatchup.games",
    infoPlist: {
      NSHealthShareUsageDescription:
        "HatchUp reads your steps, workouts, and active energy only to reward your monster with XP.",
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
    },
  },
  android: {
    package: "com.hatchup.games",
    permissions: [
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_ACTIVE_CALORIES_BURNED",
      "android.permission.health.READ_EXERCISE",
    ],
  },
  plugins: [
    [
      "expo-dev-client",
      {
        launchMode: "most-recent",
      },
    ],
  ],
};

export default config;
