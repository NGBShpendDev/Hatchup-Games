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
    infoPlist: {
      CFBundleDisplayName: "HatchUp",
    },
    ...(domain
      ? {
          associatedDomains: [`applinks:${domain}`, `webcredentials:${domain}`],
        }
      : {}),
  },
  android: {
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
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
