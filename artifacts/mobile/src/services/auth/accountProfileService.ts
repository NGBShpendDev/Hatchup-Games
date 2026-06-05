import type { User } from "@supabase/supabase-js";
import { initialHatchUpData } from "../../domain/models";
import { getSupabaseClient } from "./supabaseClient";

type UntypedSupabaseClient = ReturnType<typeof getSupabaseClient> & {
  // Replace this local bridge with generated Supabase database types once the
  // production project schema is connected to the app.
  from(table: "profiles"): any;
};

export interface UserProfile {
  avatar_url: string | null;
  created_at: string;
  display_name: string | null;
  email: string | null;
  id: string;
  leaderboard_share_enabled: boolean;
  onboarding_status: string | null;
  privacy_consent_version: string | null;
  updated_at: string;
}

export type UserProfileUpdate = Partial<
  Pick<
    UserProfile,
    | "avatar_url"
    | "display_name"
    | "email"
    | "leaderboard_share_enabled"
    | "onboarding_status"
    | "privacy_consent_version"
  >
>;

export async function getCurrentUser() {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw new Error(error.message);
  return data.user;
}

export async function getUserProfile(userId?: string) {
  const currentUser = userId ? null : await getCurrentUser();
  const id = userId ?? currentUser?.id;
  if (!id) return null;

  const { data, error } = await getUntypedSupabase()
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as UserProfile | null;
}

export async function ensureUserProfile(user?: User) {
  const currentUser = user ?? (await getCurrentUser());
  if (!currentUser) {
    throw new Error("No signed-in HatchUp account was found.");
  }

  const existingProfile = await getUserProfile(currentUser.id);
  const profileDefaults = getProfileDefaults(currentUser);

  if (existingProfile) {
    const patch: UserProfileUpdate = {};
    if (!existingProfile.email && profileDefaults.email) {
      patch.email = profileDefaults.email;
    }
    if (!existingProfile.display_name && profileDefaults.display_name) {
      patch.display_name = profileDefaults.display_name;
    }
    if (!existingProfile.avatar_url && profileDefaults.avatar_url) {
      patch.avatar_url = profileDefaults.avatar_url;
    }
    if (!existingProfile.privacy_consent_version) {
      patch.privacy_consent_version = profileDefaults.privacy_consent_version;
    }

    return Object.keys(patch).length > 0
      ? updateUserProfile(currentUser.id, patch)
      : existingProfile;
  }

  const { data, error } = await getUntypedSupabase()
    .from("profiles")
    .insert({
      ...profileDefaults,
      id: currentUser.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as UserProfile;
}

export async function updateUserProfile(
  userId: string,
  profile: UserProfileUpdate,
) {
  const { data, error } = await getUntypedSupabase()
    .from("profiles")
    .update(profile)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as UserProfile;
}

function getUntypedSupabase() {
  return getSupabaseClient() as UntypedSupabaseClient;
}

function getProfileDefaults(user: User): UserProfileUpdate {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? getStringMetadata(metadata, "email");
  const displayName =
    getStringMetadata(metadata, "full_name") ??
    getStringMetadata(metadata, "name") ??
    getStringMetadata(metadata, "display_name") ??
    getStringMetadata(metadata, "preferred_username") ??
    getEmailName(email);

  return {
    avatar_url:
      getStringMetadata(metadata, "avatar_url") ??
      getStringMetadata(metadata, "picture") ??
      null,
    display_name: displayName,
    email,
    leaderboard_share_enabled: false,
    onboarding_status: initialHatchUpData.onboardingStatus,
    privacy_consent_version: initialHatchUpData.privacyConsentVersion,
  };
}

function getStringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getEmailName(email: string | null | undefined) {
  if (!email) return null;
  return email.split("@")[0] || null;
}
