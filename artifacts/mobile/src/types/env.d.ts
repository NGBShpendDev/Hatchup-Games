declare const process: {
  env: {
    EXPO_PUBLIC_APP_VARIANT?: "development" | "preview" | "production";
    EXPO_PUBLIC_ANALYTICS_API_URL?: string;
    EXPO_PUBLIC_CRASH_REPORT_URL?: string;
    EXPO_PUBLIC_HEALTH_MODE?: string;
    EXPO_PUBLIC_HATCHUP_API_URL?: string;
    EXPO_PUBLIC_LEADERBOARD_API_URL?: string;
    EXPO_PUBLIC_PROGRESSION_PROFILE?: "beta" | "market";
  };
};

declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}
