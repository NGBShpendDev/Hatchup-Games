import type { Player } from "@workspace/db";

export type Tier = "free" | "premium";
export type Source = "trial" | "top10" | "paid" | "expired";

export interface Entitlement {
  tier: Tier;
  source: Source;
  trialEndsAt: string | null;
  paidUntil: string | null;
  daysLeftInTrial: number | null;
  top10ContextLabel: string | null;
  features: {
    hatchlingStorageCap: number;
    dailyCoachPromptCap: number;
    dailyBattleEntryCap: number;
    allowedScopes: string[];
    advancedAnalytics: boolean;
    premiumCosmetics: boolean;
    customizationSlots: number;
    unlimitedSocial: boolean;
  };
}

const FREE_FEATURES: Entitlement["features"] = {
  hatchlingStorageCap: 6,
  dailyCoachPromptCap: 5,
  dailyBattleEntryCap: 5,
  allowedScopes: ["county", "city", "nearby"],
  advancedAnalytics: false,
  premiumCosmetics: false,
  customizationSlots: 2,
  unlimitedSocial: false,
};

const PREMIUM_FEATURES: Entitlement["features"] = {
  hatchlingStorageCap: 9999,
  dailyCoachPromptCap: 9999,
  dailyBattleEntryCap: 9999,
  allowedScopes: ["world", "country", "state", "county", "city", "nearby"],
  advancedAnalytics: true,
  premiumCosmetics: true,
  customizationSlots: 12,
  unlimitedSocial: true,
};

/**
 * Pure, lazy entitlement resolver.
 * Does not mutate the player; callers decide whether to persist a downgrade.
 *
 * Premium is granted when ANY of these are true (in order of precedence):
 *   1. paid_until is in the future                    → source="paid"
 *   2. trial_ends_at is in the future                 → source="trial"
 * Otherwise the player is free with source="expired".
 *
 * NOTE: The "top10" Premium exemption path has been disabled. Top-10 city
 * rankings are derived from client-supplied GPS coordinates and cannot be made
 * trustworthy without device/provider attestation that does not exist in this
 * system. Treating attacker-controlled location data as an entitlement signal
 * is a broken trust boundary — any user can spoof coordinates for a small city
 * and self-grant Premium. `top10ContextLabel` and `top10LastCheckedAt` are
 * preserved in the DB for display purposes only and do NOT affect tier.
 */
export function getEntitlement(player: Player, now: Date = new Date()): Entitlement {
  const trialEndsAt = player.trialEndsAt ? new Date(player.trialEndsAt) : null;
  const paidUntil   = player.paidUntil   ? new Date(player.paidUntil)   : null;

  let tier: Tier = "free";
  let source: Source = "expired";

  if (paidUntil && paidUntil.getTime() > now.getTime()) {
    tier = "premium";
    source = "paid";
  } else if (trialEndsAt && trialEndsAt.getTime() > now.getTime()) {
    tier = "premium";
    source = "trial";
  }

  const daysLeftInTrial = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return {
    tier,
    source,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    paidUntil: paidUntil ? paidUntil.toISOString() : null,
    daysLeftInTrial,
    top10ContextLabel: player.top10ContextLabel ?? null,
    features: tier === "premium" ? PREMIUM_FEATURES : FREE_FEATURES,
  };
}

export function isPremium(player: Player): boolean {
  return getEntitlement(player).tier === "premium";
}
