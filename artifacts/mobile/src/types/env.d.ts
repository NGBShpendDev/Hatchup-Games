declare const process: {
  env: {
    EXPO_PUBLIC_APP_VARIANT?: "development" | "preview" | "production";
    EXPO_PUBLIC_ANALYTICS_API_URL?: string;
    EXPO_PUBLIC_CRASH_REPORT_URL?: string;
    EXPO_PUBLIC_HEALTH_MODE?: string;
    EXPO_PUBLIC_HATCHUP_API_URL?: string;
    EXPO_PUBLIC_HATCHUP_THEME?: "default" | "premiumGarden" | "creatureAdventure";
    EXPO_PUBLIC_LEADERBOARD_API_URL?: string;
    EXPO_PUBLIC_PRIVACY_POLICY_URL?: string;
    EXPO_PUBLIC_PROGRESSION_PROFILE?: "beta" | "market";
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPPORT_EMAIL?: string;
    EXPO_PUBLIC_TEST_LOGIN_ENABLED?: "true" | "false";
    EXPO_PUBLIC_TERMS_URL?: string;
  };
};

declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";

  const source: ImageSourcePropType;
  export default source;
}
