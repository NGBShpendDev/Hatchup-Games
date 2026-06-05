import type { HatchUpData } from "./models";

export type PublicReadinessStatus = "ready" | "action" | "optional";

export interface PublicReadinessItem {
  body: string;
  id: string;
  label: string;
  status: PublicReadinessStatus;
}

export interface PublicReadinessRuntime {
  isPublicBuild: boolean;
  privacyPolicyUrl: string | null;
  supportEmail: string;
  termsUrl: string | null;
}

export function getPublicReadinessItems(
  data: HatchUpData,
  runtime: PublicReadinessRuntime,
): PublicReadinessItem[] {
  return [
    {
      body:
        runtime.privacyPolicyUrl && runtime.termsUrl
          ? "Privacy and terms links are available before health permissions."
          : "Add public Privacy Policy and Terms URLs before a broad launch.",
      id: "legal-links",
      label: "Legal links",
      status: runtime.privacyPolicyUrl && runtime.termsUrl ? "ready" : "action",
    },
    {
      body: runtime.supportEmail
        ? `Support routes to ${runtime.supportEmail}.`
        : "Add a support email so public users have a clear help path.",
      id: "support",
      label: "Support path",
      status: runtime.supportEmail ? "ready" : "action",
    },
    {
      body:
        data.profileUsername && data.profileHatchlingId
          ? "Trainer identity has a username and showcase Pal."
          : "Ask users to finish their profile so sharing feels trustworthy.",
      id: "profile",
      label: "Profile identity",
      status:
        data.profileUsername && data.profileHatchlingId ? "ready" : "action",
    },
    {
      body:
        data.healthConnected || data.lastSyncedDate
          ? "The core movement-to-reward loop has been connected."
          : "Users can explore, but public retention depends on health sync.",
      id: "health-loop",
      label: "Health reward loop",
      status:
        data.healthConnected || data.lastSyncedDate ? "ready" : "action",
    },
    {
      body: data.leaderboardShareEnabled
        ? "Leaderboard sharing is enabled and opt-in."
        : "Rankings stay private until the user chooses to share.",
      id: "leaderboard",
      label: "Leaderboard sharing",
      status: data.leaderboardShareEnabled ? "ready" : "optional",
    },
    {
      body: runtime.isPublicBuild
        ? "Public build settings are active."
        : "Testing build settings are active for internal iteration.",
      id: "build-mode",
      label: "Build mode",
      status: runtime.isPublicBuild ? "ready" : "optional",
    },
  ];
}

export function getPublicReadinessScore(items: readonly PublicReadinessItem[]) {
  const requiredItems = items.filter((item) => item.status !== "optional");
  if (requiredItems.length === 0) return 1;
  return (
    requiredItems.filter((item) => item.status === "ready").length /
    requiredItems.length
  );
}
