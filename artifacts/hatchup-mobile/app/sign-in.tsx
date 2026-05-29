import { useSignIn, useSignUp, useSSO } from "@clerk/clerk-expo";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const PRIMARY = "#ee2b8c";
const BG = "#080912";
const CARD = "#111122";
const BORDER = "rgba(255,255,255,0.1)";
const MUTED = "rgba(255,255,255,0.5)";
const SOCIAL_BTN = "rgba(255,255,255,0.07)";

type Mode = "sign-in" | "sign-up";

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

function SocialButton({
  label,
  icon,
  onPress,
  loading,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      style={[styles.socialBtn, loading && styles.btnDisabled]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <>
          <Text style={styles.socialIcon}>{icon}</Text>
          <Text style={styles.socialBtnText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function SignInScreen() {
  const { signIn, setActive: setActiveSignIn, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  useWarmUpBrowser();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);

  const handleSignIn = async () => {
    if (!signInLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActiveSignIn({ session: result.createdSessionId });
        router.replace("/" as any);
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Sign in failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!signUpLoaded) return;
    setLoading(true);
    setError("");
    try {
      await signUp.create({ emailAddress: email, password, username });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Sign up failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signUpLoaded) return;
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActiveSignUp({ session: result.createdSessionId });
        router.replace("/" as any);
      }
    } catch (e: any) {
      setError(e.errors?.[0]?.message ?? "Verification failed. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = useCallback(
    async (strategy: "oauth_google" | "oauth_apple", setOAuthLoading: (v: boolean) => void) => {
      setOAuthLoading(true);
      setError("");
      try {
        const { createdSessionId, setActive, signUp: oauthSignUp } = await startSSOFlow({
          strategy,
          redirectUrl: AuthSession.makeRedirectUri({ scheme: "hatchup-mobile" }),
        });

        if (createdSessionId) {
          await setActive!({ session: createdSessionId });
          router.replace("/" as any);
        } else if (oauthSignUp?.status === "missing_requirements") {
          // Username is required by the Clerk instance — auto-generate one
          const emailBase = (oauthSignUp.emailAddress ?? "")
            .split("@")[0]
            ?.replace(/[^a-z0-9]/gi, "")
            .toLowerCase()
            .slice(0, 12) ?? "player";
          const autoUsername = `${emailBase || "player"}${Math.floor(Math.random() * 9000) + 1000}`;
          try {
            await oauthSignUp.update({ username: autoUsername });
            const completed = await oauthSignUp.create?.();
            const sessionId = completed?.createdSessionId ?? (oauthSignUp as any).createdSessionId;
            if (sessionId) {
              await setActive!({ session: sessionId });
              router.replace("/" as any);
            } else {
              setError("Could not complete sign-up. Please try again or use email.");
            }
          } catch (innerErr: any) {
            setError(innerErr.errors?.[0]?.message ?? "Sign-up incomplete. Please try email instead.");
          }
        }
      } catch (e: any) {
        setError(e.errors?.[0]?.message ?? "Social sign-in failed. Please try again.");
      } finally {
        setOAuthLoading(false);
      }
    },
    [startSSOFlow, router],
  );

  const anySocialLoading = googleLoading || appleLoading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.logo}>🥚 HatchUp</Text>
            <Text style={styles.tagline}>Every step hatches something amazing</Text>
          </View>

          <View style={styles.card}>
            {!pendingVerification ? (
              <>
                <Text style={styles.title}>{mode === "sign-in" ? "Welcome back" : "Create account"}</Text>

                <View style={styles.socialRow}>
                  <SocialButton
                    label="Continue with Google"
                    icon="G"
                    onPress={() => handleOAuth("oauth_google", setGoogleLoading)}
                    loading={googleLoading}
                  />
                  {Platform.OS === "ios" && (
                    <SocialButton
                      label="Continue with Apple"
                      icon=""
                      onPress={() => handleOAuth("oauth_apple", setAppleLoading)}
                      loading={appleLoading}
                    />
                  )}
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                {mode === "sign-up" && (
                  <View style={styles.field}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="your_username"
                      placeholderTextColor={MUTED}
                      value={username}
                      onChangeText={setUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={MUTED}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={MUTED}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.btn, (loading || anySocialLoading) && styles.btnDisabled]}
                  onPress={mode === "sign-in" ? handleSignIn : handleSignUp}
                  disabled={loading || anySocialLoading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>{mode === "sign-in" ? "Sign In" : "Create Account"}</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                    setError("");
                  }}
                >
                  <Text style={styles.toggle}>
                    {mode === "sign-in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.subtitle}>We sent a verification code to {email}</Text>

                <View style={styles.field}>
                  <Text style={styles.label}>Verification Code</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor={MUTED}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                  />
                </View>

                {!!error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={[styles.btn, loading && styles.btnDisabled]}
                  onPress={handleVerify}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify Email</Text>}
                </Pressable>

                <Pressable onPress={() => { setPendingVerification(false); setError(""); }}>
                  <Text style={styles.toggle}>Back</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  header: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 36, fontWeight: "900", color: PRIMARY, marginBottom: 8 },
  tagline: { fontSize: 14, color: MUTED, textAlign: "center" },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: BORDER,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#fff", marginBottom: 16 },
  subtitle: { fontSize: 14, color: MUTED, marginBottom: 20 },
  socialRow: { gap: 10, marginBottom: 4 },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SOCIAL_BTN,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 10,
  },
  socialIcon: { fontSize: 17, color: "#fff", fontWeight: "700", width: 22, textAlign: "center" },
  socialBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 18, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: { color: MUTED, fontSize: 13 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, color: MUTED, marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    color: "#fff",
    fontSize: 15,
  },
  error: { color: "#ff4455", fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: PRIMARY,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  toggle: { color: PRIMARY, textAlign: "center", fontSize: 14 },
});
