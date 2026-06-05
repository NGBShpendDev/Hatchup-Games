import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthScreen } from "../screens/AuthScreen";
import { useAuth } from "../services/auth/AuthProvider";
import { colors, radii, typography } from "../theme";

export function AuthGate({ children }: PropsWithChildren) {
  const { accountLoading, isGuestMode, loading, session, user } = useAuth();
  const isLoading = loading || accountLoading;

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingTitle}>
            {accountLoading
              ? "Preparing your HatchUp account..."
              : "Opening your HatchUp garden"}
          </Text>
          <Text style={styles.loadingBody}>
            {accountLoading
              ? "Setting up your profile before loading your Pals."
              : "Checking your account session before loading your Pals."}
          </Text>
        </View>
      </View>
    );
  }

  if (!isGuestMode && (!session || !user)) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  loadingCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 12,
    padding: 22,
    width: "100%",
  },
  loadingTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: typography.titleWeight,
    textAlign: "center",
  },
  loadingBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
