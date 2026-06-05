import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../config/runtime";

type HatchUpSupabaseClient = ReturnType<typeof createClient>;

let client: HatchUpSupabaseClient | null = null;
let autoRefreshConfigured = false;

export function isSupabaseConfigured() {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
        storage: AsyncStorage,
      },
    });
    configureSessionAutoRefresh(client);
  }

  return client;
}

function configureSessionAutoRefresh(supabase: HatchUpSupabaseClient) {
  if (autoRefreshConfigured) return;
  autoRefreshConfigured = true;

  // Passwords and provider credentials are handled by Supabase Auth. HatchUp
  // only persists Supabase session tokens locally, plus the app's own game data.
  if (AppState.currentState === "active") {
    supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
      return;
    }

    supabase.auth.stopAutoRefresh();
  });
}

// The anon key is a public client identifier protected by Supabase Row Level
// Security. Do not put service-role keys or OAuth provider secrets in the app.
