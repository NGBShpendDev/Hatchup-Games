import "expo-dev-client";

import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthGate } from "./src/components/AuthGate";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { AuthProvider } from "./src/services/auth/AuthProvider";

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AuthProvider>
          <AuthGate>
            <AppNavigator />
          </AuthGate>
        </AuthProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
