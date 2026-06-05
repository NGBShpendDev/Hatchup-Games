import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppButton } from "../components/AppButton";
import { MonsterAvatar } from "../components/MonsterAvatar";
import { Screen } from "../components/Screen";
import { PRIVACY_POLICY_URL, TERMS_URL } from "../config/runtime";
import { useAuth } from "../services/auth/AuthProvider";
import { colors, radii, typography } from "../theme";

type AuthMode = "signin" | "signup" | "forgot";
type SubmitTarget = "email" | "google" | "apple" | null;

export function AuthScreen() {
  const {
    authError,
    isAppleSignInAvailable,
    isConfigured,
    resetPassword,
    signInWithApple,
    signInWithEmail,
    signInWithGoogle,
    signUpWithEmail,
  } = useAuth();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [localError, setLocalError] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState<SubmitTarget>(null);
  const validationError = useMemo(
    () => getValidationError({ confirmPassword, email, mode, password }),
    [confirmPassword, email, mode, password],
  );
  const canSubmit = isConfigured && !validationError;

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, [isAppleSignInAvailable]);

  function switchMode(nextMode: AuthMode) {
    setLocalError("");
    setLocalMessage("");
    setMode(nextMode);
  }

  async function handleEmailSubmit() {
    if (!canSubmit || submitting) {
      setLocalError(validationError ?? "");
      return;
    }

    setSubmitting("email");
    setLocalError("");
    setLocalMessage("");
    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        return;
      }
      if (mode === "forgot") {
        const sent = await resetPassword(email);
        if (sent) {
          setLocalMessage(
            "If a HatchUp account exists for that email, a reset link has been sent.",
          );
        }
        return;
      }

      const created = await signUpWithEmail(email, password);
      if (created.ok && created.verificationRequired) {
        setLocalMessage("Check your email to confirm your HatchUp account.");
        return;
      }
      if (created.ok) {
        setLocalMessage(
          "Account created. Preparing your HatchUp world...",
        );
      }
    } catch (caught) {
      setLocalError(
        formatAuthError(
          caught instanceof Error
            ? caught.message
            : "Something went wrong. Please try again.",
        ),
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleGoogle() {
    if (!isConfigured || submitting) return;

    setSubmitting("google");
    setLocalError("");
    setLocalMessage("");
    try {
      await signInWithGoogle();
    } catch (caught) {
      setLocalError(
        formatAuthError(
          caught instanceof Error
            ? caught.message
            : "Google sign-in could not finish. Please try again.",
        ),
      );
    } finally {
      setSubmitting(null);
    }
  }

  async function handleApple() {
    if (!isConfigured || !appleAvailable || submitting) return;

    setSubmitting("apple");
    setLocalError("");
    setLocalMessage("");
    try {
      await signInWithApple();
    } catch (caught) {
      setLocalError(
        formatAuthError(
          caught instanceof Error
            ? caught.message
            : "Apple Sign-In could not finish. Please try again.",
        ),
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <View style={styles.brand}>
          <Text style={styles.kicker}>HATCHUP ACCOUNT</Text>
          <Text style={styles.title}>Start your HatchUp journey.</Text>
          <Text style={styles.body}>
            Create an account to safely save your Pals, eggs, progress, and
            privacy settings.
          </Text>
        </View>
        <MonsterAvatar stage="egg" />
        <View style={styles.card}>
          <View style={styles.modeRow}>
            <ModeButton
              active={mode === "signin"}
              disabled={Boolean(submitting)}
              label="Sign in"
              onPress={() => switchMode("signin")}
            />
            <ModeButton
              active={mode === "signup"}
              disabled={Boolean(submitting)}
              label="Create"
              onPress={() => switchMode("signup")}
            />
            <ModeButton
              active={mode === "forgot"}
              disabled={Boolean(submitting)}
              label="Reset"
              onPress={() => switchMode("forgot")}
            />
          </View>
          <Text style={styles.modeTitle}>{getModeTitle(mode)}</Text>
          <Text style={styles.modeBody}>{getModeBody(mode)}</Text>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!submitting}
            onChangeText={(value) => {
              setEmail(value);
              setLocalError("");
            }}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />
          {mode !== "forgot" && (
            <>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                editable={!submitting}
                onChangeText={(value) => {
                  setPassword(value);
                  setLocalError("");
                }}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
                textContentType={mode === "signin" ? "password" : "newPassword"}
                value={password}
              />
            </>
          )}
          {mode === "signup" && (
            <>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!submitting}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  setLocalError("");
                }}
                placeholder="Re-enter password"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
                textContentType="newPassword"
                value={confirmPassword}
              />
            </>
          )}
          {!isConfigured && (
            <Text style={styles.error}>
              Supabase env vars are missing. Set EXPO_PUBLIC_SUPABASE_URL and
              EXPO_PUBLIC_SUPABASE_ANON_KEY for this build.
            </Text>
          )}
          {localMessage ? <Text style={styles.success}>{localMessage}</Text> : null}
          {localError ? <Text style={styles.error}>{localError}</Text> : null}
          {validationError && (email || password || confirmPassword) ? (
            <Text style={styles.error}>{validationError}</Text>
          ) : null}
          {authError && <Text style={styles.error}>{formatAuthError(authError)}</Text>}
          <AppButton
            disabled={!canSubmit || Boolean(submitting)}
            label={getEmailButtonLabel(mode, submitting === "email")}
            onPress={handleEmailSubmit}
          />
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>
          <AppButton
            disabled={!isConfigured || Boolean(submitting)}
            label={
              submitting === "google"
                ? "Opening Google..."
                : "Continue with Google"
            }
            onPress={handleGoogle}
            variant="secondary"
          />
          <AppButton
            disabled={!isConfigured || !appleAvailable || Boolean(submitting)}
            label={
              appleAvailable
                ? submitting === "apple"
                  ? "Opening Apple..."
                  : "Continue with Apple"
                : "Apple Sign-In unavailable"
            }
            onPress={handleApple}
            variant="secondary"
          />
          <Text style={styles.note}>
            HatchUp never stores your password manually. Passwords and providers
            are handled by Supabase Auth.
          </Text>
        </View>
        <View style={styles.legalCard}>
          <Text style={styles.legalText}>
            By continuing, you agree to HatchUp's{" "}
            <LegalLink label="Terms" url={TERMS_URL} /> and{" "}
            <LegalLink label="Privacy Policy" url={PRIVACY_POLICY_URL} />.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ModeButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.modeButton,
        active && styles.modeButtonActive,
        disabled && styles.modeButtonDisabled,
      ]}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function LegalLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return <Text style={styles.legalLinkDisabled}>{label}</Text>;
  }

  return (
    <Text
      onPress={() => {
        void Linking.openURL(url);
      }}
      style={styles.legalLink}
    >
      {label}
    </Text>
  );
}

function getValidationError({
  confirmPassword,
  email,
  mode,
  password,
}: {
  confirmPassword: string;
  email: string;
  mode: AuthMode;
  password: string;
}) {
  if (!email.trim()) return "Enter your email address.";
  if (!isValidEmail(email)) return "Enter a valid email address.";
  if (mode === "forgot") return null;
  if (!password) return "Enter your password.";
  if (password.length < 6) return "Password must be at least 6 characters.";
  if (mode === "signup" && password !== confirmPassword) {
    return "Passwords do not match.";
  }
  return null;
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

function getModeTitle(mode: AuthMode) {
  if (mode === "signin") return "Welcome back";
  if (mode === "forgot") return "Reset your password";
  return "Create your account";
}

function getModeBody(mode: AuthMode) {
  if (mode === "signin") return "Sign in to continue to your existing HatchUp world.";
  if (mode === "forgot") return "Enter your email and we will send a reset link.";
  return "Create a secure account before your first Egg starts growing.";
}

function getEmailButtonLabel(mode: AuthMode, loading: boolean) {
  if (loading && mode === "signin") return "Signing in...";
  if (loading && mode === "forgot") return "Sending reset...";
  if (loading) return "Creating account...";
  if (mode === "signin") return "Sign in";
  if (mode === "forgot") return "Send reset email";
  return "Create HatchUp account";
}

function formatAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("offline") ||
    normalized.includes("failed to fetch")
  ) {
    return "Network looks unavailable. Check your connection and try again.";
  }
  if (
    normalized.includes("invalid email") ||
    normalized.includes("email address is invalid")
  ) {
    return "Enter a valid email address.";
  }
  if (
    normalized.includes("password") &&
    (normalized.includes("short") || normalized.includes("six") || normalized.includes("6"))
  ) {
    return "Password must be at least 6 characters.";
  }
  if (
    normalized.includes("invalid login") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("email or password")
  ) {
    return "That email or password did not match. Try again or reset your password.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (
    normalized.includes("already registered") ||
    normalized.includes("already exists") ||
    normalized.includes("user already")
  ) {
    return "An account may already exist for this email. Try signing in or reset your password.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Take a short break, then try again.";
  }
  return message;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  brand: {
    marginTop: 20,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: typography.titleWeight,
    letterSpacing: -0.9,
    lineHeight: 40,
    marginTop: 10,
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.primarySoft,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  modeRow: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    padding: 5,
  },
  modeButton: {
    alignItems: "center",
    borderRadius: radii.pill,
    flex: 1,
    paddingVertical: 9,
  },
  modeButtonActive: {
    backgroundColor: colors.primaryDeep,
  },
  modeButtonDisabled: {
    opacity: 0.55,
  },
  modeButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  modeTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  modeBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.line,
    borderRadius: radii.button,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  success: {
    color: colors.primaryDeep,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  divider: {
    backgroundColor: colors.line,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  legalCard: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    borderRadius: radii.card,
    borderWidth: 1,
    marginTop: 14,
    padding: 14,
  },
  legalText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  legalLink: {
    color: colors.primaryDeep,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  legalLinkDisabled: {
    color: colors.primaryDeep,
    fontWeight: "900",
  },
});
