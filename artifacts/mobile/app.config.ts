import type { ExpoConfig } from "expo/config";

const healthReadDescription =
  "HatchUp reads your steps, distance, workouts, and active energy only to reward your monster with XP and show optional rankings.";

const config: ExpoConfig = {
  name: "HatchUp Games",
  slug: "hatchup-games-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "hatchup",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  extra: {
    eas: {
      projectId: "a5389b94-12db-48eb-9496-fee26451e369",
    },
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.hatchup.games",
    infoPlist: {
      NSHealthShareUsageDescription: healthReadDescription,
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "com.apple.developer.healthkit": true,
    },
  },
  android: {
    package: "com.hatchup.games",
    permissions: [
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_DISTANCE",
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
    [
      "@kingstinct/react-native-healthkit",
      {
        NSHealthShareUsageDescription: healthReadDescription,
        NSHealthUpdateUsageDescription:
          "HatchUp does not write data to Apple Health.",
        background: false,
      },
    ],
    "expo-health-connect",
    [
      "expo-build-properties",
      {
        android: {
          minSdkVersion: 26,
        },
      },
    ],
  ],
};

export default config;
