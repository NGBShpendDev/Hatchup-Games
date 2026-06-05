export type AppVariant = "development" | "preview" | "production";

export const APP_VARIANT: AppVariant =
  process.env.EXPO_PUBLIC_APP_VARIANT === "production"
    ? "production"
    : process.env.EXPO_PUBLIC_APP_VARIANT === "preview"
      ? "preview"
      : "development";

export const IS_PUBLIC_BUILD = APP_VARIANT === "production";

export const TEST_LOGIN_ENABLED =
  process.env.EXPO_PUBLIC_TEST_LOGIN_ENABLED === "true";

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "shpend_95@live.com";

export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? null;

export const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? null;

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function buildSupportMailto({
  body,
  subject,
}: {
  body?: string;
  subject: string;
}) {
  const params = new URLSearchParams({
    subject,
  });

  if (body) params.set("body", body);

  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}
