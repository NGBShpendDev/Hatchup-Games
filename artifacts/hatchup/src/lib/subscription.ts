import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type Tier = "free" | "premium";
export type Source = "trial" | "top10" | "paid" | "expired";

export interface SubscriptionStatus {
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
  pricing: {
    monthly: { amount: number; currency: string; interval: string; label: string };
    yearly:  { amount: number; currency: string; interval: string; label: string };
  };
  stripeConfigured: boolean;
}

async function fetchSubscription(): Promise<SubscriptionStatus> {
  const res = await fetch("/api/subscription/me", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load subscription");
  return res.json();
}

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription", "me"],
    queryFn: fetchSubscription,
    staleTime: 60_000,
  });
}

export function useStartCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (interval: "month" | "year") => {
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Checkout failed");
      return data as { url: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscription"] }),
  });
}

export function useOpenPortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Portal failed");
      return data as { url: string };
    },
  });
}
