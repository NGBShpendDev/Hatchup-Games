import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";
import { TEST_LOGIN_ENABLED } from "../../config/runtime";
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabaseClient";
import {
  ensureUserProfile,
  type UserProfile,
} from "./accountProfileService";

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  accountLoading: boolean;
  accountProfile: UserProfile | null;
  authError: string | null;
  isAppleSignInAvailable: () => Promise<boolean>;
  isConfigured: boolean;
  isGuestMode: boolean;
  loading: boolean;
  signInAsGuest: () => Promise<void>;
  resetPassword: (email: string) => Promise<boolean>;
  refreshSession: () => Promise<void>;
  session: Session | null;
  signInWithApple: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
  ) => Promise<EmailSignUpResult>;
  user: User | null;
}

export interface EmailSignUpResult {
  ok: boolean;
  verificationRequired: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST_MODE_KEY = "@hatchup/auth-guest-mode";

export function AuthProvider({ children }: PropsWithChildren) {
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountProfile, setAccountProfile] = useState<UserProfile | null>(
    null,
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const isConfigured = isSupabaseConfigured();

  useEffect(() => {
    void AsyncStorage.getItem(GUEST_MODE_KEY).then((value) => {
      setIsGuestMode(TEST_LOGIN_ENABLED && value === "true");
    });
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) setAuthError(error.message);
        setSession(data.session);
      })
      .finally(() => setLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthError(null);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  useEffect(() => {
    let cancelled = false;

    if (!isConfigured || !session?.user) {
      setAccountLoading(false);
      setAccountProfile(null);
      return;
    }

    setAccountLoading(true);
    ensureUserProfile(session.user)
      .then((profile) => {
        if (cancelled) return;
        setAccountProfile(profile);
        setAuthError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setAuthError(
          "We signed you in, but could not prepare your HatchUp profile. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isConfigured, session?.user?.email, session?.user?.id]);

  async function refreshSession() {
    if (!isConfigured) return;

    setAuthError(null);
    const { data, error } = await getSupabaseClient().auth.refreshSession();
    if (error) {
      setAuthError(error.message);
      return;
    }
    setSession(data.session);
  }

  async function signInWithEmail(email: string, password: string) {
    if (!isConfigured) {
      setAuthError("Supabase is not configured for this build.");
      return false;
    }

    setAuthError(null);
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    setSession(data.session);
    return Boolean(data.session);
  }

  async function signUpWithEmail(email: string, password: string) {
    if (!isConfigured) {
      setAuthError("Supabase is not configured for this build.");
      return { ok: false, verificationRequired: false };
    }

    setAuthError(null);
    const { data, error } = await getSupabaseClient().auth.signUp({
      email: email.trim(),
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
      },
      password,
    });
    if (error) {
      setAuthError(error.message);
      return { ok: false, verificationRequired: false };
    }
    setSession(data.session);
    return {
      ok: true,
      verificationRequired: !data.session,
    };
  }

  async function resetPassword(email: string) {
    if (!isConfigured) {
      setAuthError("Supabase is not configured for this build.");
      return false;
    }

    setAuthError(null);
    const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: getAuthRedirectUrl(),
      },
    );
    if (error) {
      setAuthError(error.message);
      return false;
    }
    return true;
  }

  async function signInWithGoogle() {
    if (!isConfigured) {
      setAuthError("Supabase is not configured for this build.");
      return false;
    }

    setAuthError(null);
    const redirectTo = getAuthRedirectUrl();
    const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
      provider: "google",
    });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    if (!data.url) {
      setAuthError("Google sign-in could not start. Please try again.");
      return false;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") {
      setAuthError("Google sign-in was cancelled before it finished.");
      return false;
    }

    const tokens = getTokensFromUrl(result.url);
    if (tokens.error) {
      setAuthError(getOAuthErrorMessage(tokens.error, tokens.errorDescription));
      return false;
    }
    if (!tokens.accessToken || !tokens.refreshToken) {
      setAuthError(
        "Google sign-in returned to HatchUp without a valid session. Check Supabase redirect URLs and Google provider settings.",
      );
      return false;
    }

    const sessionResult = await getSupabaseClient().auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (sessionResult.error) {
      setAuthError(sessionResult.error.message);
      return false;
    }
    setSession(sessionResult.data.session);
    return Boolean(sessionResult.data.session);
  }

  async function signInWithApple() {
    if (!isConfigured) {
      setAuthError("Supabase is not configured for this build.");
      return false;
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      setAuthError("Apple Sign-In is not available on this device.");
      return false;
    }

    setAuthError(null);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });
    } catch (caught) {
      setAuthError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Apple Sign-In was cancelled before it finished.",
      );
      return false;
    }
    if (!credential.identityToken) {
      setAuthError("Apple Sign-In did not return a valid identity token.");
      return false;
    }

    const { data, error } = await getSupabaseClient().auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });
    if (error) {
      setAuthError(error.message);
      return false;
    }
    setSession(data.session);
    return Boolean(data.session);
  }

  async function isAppleSignInAvailable() {
    return AppleAuthentication.isAvailableAsync();
  }

  async function signOut() {
    if (isGuestMode) {
      await AsyncStorage.removeItem(GUEST_MODE_KEY);
      setIsGuestMode(false);
      setAuthError(null);
      return;
    }

    if (!isConfigured) return;

    setAuthError(null);
    const { error } = await getSupabaseClient().auth.signOut();
    if (error) {
      setAuthError(error.message);
      return;
    }
    setSession(null);
    setAccountProfile(null);
    setAccountLoading(false);
  }

  async function signInAsGuest() {
    if (!TEST_LOGIN_ENABLED) return;

    await AsyncStorage.setItem(GUEST_MODE_KEY, "true");
    setIsGuestMode(true);
    setAuthError(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      accountLoading,
      accountProfile,
      authError,
      isAppleSignInAvailable,
      isConfigured,
      isGuestMode,
      loading,
      resetPassword,
      refreshSession,
      session,
      signInWithApple,
      signInAsGuest,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      signUpWithEmail,
      user: session?.user ?? null,
    }),
    [
      accountLoading,
      accountProfile,
      authError,
      isConfigured,
      isGuestMode,
      loading,
      session,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function getAuthRedirectUrl() {
  return makeRedirectUri({
    path: "auth/callback",
    scheme: "hatchup",
  });
}

function getTokensFromUrl(url: string) {
  const [, fragment = ""] = url.split("#");
  const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] ?? "" : "";
  const params = new URLSearchParams(fragment || query);

  return {
    accessToken: params.get("access_token"),
    error: params.get("error"),
    errorDescription: params.get("error_description"),
    refreshToken: params.get("refresh_token"),
  };
}

function getOAuthErrorMessage(
  error: string,
  description: string | null,
) {
  const detail = description ? ` (${description.replace(/\+/g, " ")})` : "";

  if (error === "redirect_uri_mismatch") {
    return `Google sign-in is missing an allowed redirect URL${detail}.`;
  }
  if (error === "access_denied") {
    return "Google sign-in was cancelled before it finished.";
  }
  return `Google sign-in could not finish${detail}.`;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
