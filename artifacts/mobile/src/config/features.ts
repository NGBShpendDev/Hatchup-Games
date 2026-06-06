import { IS_PUBLIC_BUILD } from "./runtime";

function readBooleanFlag(
  value: "true" | "false" | undefined,
  fallback: boolean,
) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export const ENABLE_SHOP = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_SHOP,
  false,
);

export const ENABLE_WEEKLY_CHEST = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_WEEKLY_CHEST,
  true,
);

export const ENABLE_ADVANCED_QUESTS = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_ADVANCED_QUESTS,
  false,
);

export const ENABLE_LEADERBOARD = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_LEADERBOARD,
  true,
);

export const ENABLE_PROFILE_BADGES = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_PROFILE_BADGES,
  true,
);

export const ENABLE_TEST_LAB =
  !IS_PUBLIC_BUILD &&
  readBooleanFlag(process.env.EXPO_PUBLIC_ENABLE_TEST_LAB, false);

// Cloud save is still gated at runtime by the active auth session/user.
export const ENABLE_CLOUD_SYNC = readBooleanFlag(
  process.env.EXPO_PUBLIC_ENABLE_CLOUD_SYNC,
  true,
);
