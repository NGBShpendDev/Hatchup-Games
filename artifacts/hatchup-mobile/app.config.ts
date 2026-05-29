import { ExpoConfig } from "expo/config";

const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";

const config: ExpoConfig = {
  name: "HatchUp Fitness Pals",
  slug: "hatchup-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "hatchup-mobile",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#080912",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.hatchup.fitnesspals",
    buildNumber: "1",
    infoPlist: {
      CFBundleDisplayName: "HatchUp",
      // Background fetch — lets iOS wake the app to sync steps every ~15 min
      UIBackgroundModes: ["fetch", "processing"],
      // HealthKit / Pedometer permission strings
      NSHealthShareUsageDescription:
        "HatchUp reads your steps, workouts, and sleep so your Pals grow — even when the app is closed.",
      NSHealthUpdateUsageDescription:
        "HatchUp does not write health data.",
      NSMotionUsageDescription:
        "HatchUp counts your steps with the motion sensor to earn XP for your Pals.",
    },
    ...(domain
      ? {
          associatedDomains: [`applinks:${domain}`, `webcredentials:${domain}`],
        }
      : {}),
  },
  android: {
    package: "com.hatchup.fitnesspals",
    versionCode: 1,
    permissions: [
      "android.permission.ACTIVITY_RECOGNITION",
      "android.permission.RECEIVE_BOOT_COMPLETED",
    ],
    ...(domain
      ? {
          intentFilters: [
            {
              action: "VIEW",
              autoVerify: true,
              data: [
                {
                  scheme: "https",
                  host: domain,
                  pathPattern: "/club/.*",
                },
              ],
              category: ["BROWSABLE", "DEFAULT"],
            },
          ],
        }
      : {}),
  },
  web: {
    favicon: "./assets/images/icon.png",
  },
  plugins: [
    [
      "expo-router",
      {
        origin: domain ? `https://${domain}/` : "https://replit.com/",
      },
    ],
    "expo-font",
    "expo-web-browser",
    // Enables background fetch capability on iOS (UIBackgroundModes: fetch)
    "expo-background-fetch",
    // Motion/pedometer permissions
    [
      "expo-sensors",
      {
        motionPermission:
          "HatchUp counts your steps to earn XP for your Pals.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
