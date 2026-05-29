import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { setBaseUrl, setAuthTokenGetter, type AuthTokenGetter } from "@workspace/api-client-react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, AppState, AppStateStatus, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  registerBackgroundSync,
  unregisterBackgroundSync,
  persistAuthTokenForBackground,
  syncHealthNow,
} from "@/services/backgroundSync";

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

const SCREENS: Array<{ name: string }> = [
  { name: "sign-in" },
  { name: "(tabs)" },
  { name: "hatchling/[id]" },
  { name: "evolutions" },
  { name: "leaderboard" },
  { name: "events" },
  { name: "clubs" },
  { name: "feed" },
  { name: "coach" },
  { name: "fitness" },
  { name: "my-pal" },
  { name: "training" },
  { name: "nutrition" },
  { name: "nearby" },
  { name: "subscription" },
  { name: "notifications" },
  { name: "settings" },
  { name: "social/[id]" },
];

function AuthedStack() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const qc = useQueryClient();

  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Set the token getter synchronously before the Stack renders any screen,
  // so the first React Query fetch already has auth.
  if (isLoaded && isSignedIn) {
    setAuthTokenGetter(getToken as AuthTokenGetter);
  } else if (isLoaded && !isSignedIn) {
    setAuthTokenGetter(null);
  }

  // Clear cached data when sign-in status changes.
  useEffect(() => {
    qc.clear();
  }, [isSignedIn]);

  // Register background sync once user is signed in; unregister on sign-out.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      registerBackgroundSync();
      // Persist a fresh token so the background task can authenticate
      getToken().then(token => persistAuthTokenForBackground(token ?? null));
    } else {
      unregisterBackgroundSync();
      persistAuthTokenForBackground(null);
    }
  }, [isLoaded, isSignedIn]);

  // Refresh token & trigger foreground health sync whenever the app returns
  // to the foreground (user switches back from another app).
  useEffect(() => {
    if (!isSignedIn) return;
    const sub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        const token = await getToken();
        if (token) {
          await persistAuthTokenForBackground(token);
          // Fire-and-forget foreground step sync
          syncHealthNow(token);
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, [isSignedIn]);

  // Redirect after auth state settles.
  useEffect(() => {
    if (!isLoaded) return;
    const onSignInScreen = segments[0] === "sign-in";
    if (!isSignedIn && !onSignInScreen) {
      router.replace("/sign-in" as any);
    } else if (isSignedIn && onSignInScreen) {
      router.replace("/" as any);
    }
  }, [isLoaded, isSignedIn, segments]);

  // While Clerk is loading, show a splash-style indicator.
  // This prevents the Stack from mounting (and firing queries) too early.
  if (!isLoaded) {
    return (
      <View
        style={{ flex: 1, backgroundColor: "#080912", justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator color="#ee2b8c" size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: "Back" }}>
      {SCREENS.map((s) => (
        <Stack.Screen key={s.name} name={s.name} options={{ headerShown: false }} />
      ))}
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ClerkProvider publishableKey={publishableKey}>
          <QueryClientProvider client={queryClient}>
            <GestureHandlerRootView>
              <KeyboardProvider>
                <AuthedStack />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </QueryClientProvider>
        </ClerkProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
