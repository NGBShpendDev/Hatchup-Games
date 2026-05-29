import { Link } from "wouter";
import { ArrowLeft, ShoppingBag, ShieldCheck, ShoppingCart, Sparkles, Loader2, RefreshCw, Minus, Plus } from "lucide-react";
import {
  useGetDailyStreak, getGetDailyStreakQueryKey,
  useBuyStreakShield,
  useUpdateShieldAutoReplenish,
  useGetCurrentPlayer, getGetCurrentPlayerQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const SHIELD_COST = 200;

export default function ShopPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: player } = useGetCurrentPlayer();
  const { data: streak } = useGetDailyStreak();

  const coins = player?.coins ?? 0;
  const shieldCount = streak?.streakShields ?? 0;
  const autoReplenish = (player as any)?.autoReplenishShields ?? false;
  const replenishThreshold = (player as any)?.shieldAutoReplenishThreshold ?? 2;
  const canAffordShield = coins >= SHIELD_COST;

  const buyShield = useBuyStreakShield({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetDailyStreakQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() });
        toast({ title: `Shield purchased! You now have ${data.streakShields} shield${data.streakShields !== 1 ? "s" : ""}.` });
      },
      onError: (err: any) => {
        toast({ title: err?.response?.data?.error ?? "Could not purchase shield.", variant: "destructive" });
      },
    },
  });

  const shieldCheckout = useMutation({
    mutationFn: async (pack: "single" | "bundle") => {
      const res = await fetch("/api/shields/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Checkout failed");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (err: any) => {
      toast({ title: err.message ?? "Checkout unavailable.", variant: "destructive" });
    },
  });

  const updateAutoReplenish = useUpdateShieldAutoReplenish({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentPlayerQueryKey() });
      },
    },
  });

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h1 className="font-black text-xl">Shop</h1>
          </div>
        </div>

        {/* Streak Shield Section */}
        <section
          className="rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4"
          data-testid="section-streak-protection"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-400/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-sm text-cyan-200">Streak Protection</h3>
              <p className="text-xs text-white/60 mt-0.5 leading-relaxed">
                A Shield auto-saves your streak if you miss a day — no reset.
              </p>
            </div>
            {shieldCount > 0 && (
              <div className="shrink-0 flex flex-col items-center bg-cyan-950/50 border border-cyan-500/30 rounded-xl px-3 py-2">
                <span className="text-lg font-black text-cyan-300" data-testid="shield-count">{shieldCount}</span>
                <span className="text-[9px] font-bold text-cyan-400/70 uppercase tracking-wide">
                  {shieldCount === 1 ? "Shield" : "Shields"}
                </span>
              </div>
            )}
          </div>

          <div className="bg-white/5 rounded-2xl px-4 py-3 space-y-3">
            {/* Coin purchase */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-black">Buy a Streak Shield</p>
                <p className="text-xs text-white/50 mt-0.5">{SHIELD_COST} coins per shield</p>
                <p className="text-xs mt-1" data-testid="coin-balance">
                  <span className="text-white/40">Balance: </span>
                  <span className={canAffordShield ? "text-cyan-300 font-bold" : "text-amber-400 font-bold"}>{coins} coins</span>
                </p>
                {!canAffordShield && (
                  <>
                    <p className="text-xs text-amber-400 font-bold mt-0.5" data-testid="not-enough-coins">Not enough coins</p>
                    <p className="text-xs text-white/50 mt-1 leading-relaxed" data-testid="earn-coins-tip">
                      Earn coins by completing workouts, daily check-ins, and challenges.
                    </p>
                  </>
                )}
              </div>
              <button
                onClick={() => buyShield.mutate()}
                disabled={buyShield.isPending || !canAffordShield}
                data-testid="button-buy-shield"
                className="flex items-center gap-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-bold text-sm px-4 py-2 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {buyShield.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                {SHIELD_COST}¢
              </button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <hr className="flex-1 border-white/10" />
              <span className="text-[11px] text-white/30 font-medium">or pay with card</span>
              <hr className="flex-1 border-white/10" />
            </div>

            {/* USD purchase options */}
            <div className="flex gap-2">
              <button
                onClick={() => shieldCheckout.mutate("single")}
                disabled={shieldCheckout.isPending}
                data-testid="button-buy-shield-usd-single"
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-sm py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {shieldCheckout.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                $3.00 · 1 Shield
              </button>
              <button
                onClick={() => shieldCheckout.mutate("bundle")}
                disabled={shieldCheckout.isPending}
                data-testid="button-buy-shield-usd-bundle"
                className="flex-1 flex items-center justify-center gap-1.5 bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 text-violet-300 font-bold text-sm py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {shieldCheckout.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                $20 · 10 Shields
              </button>
            </div>
          </div>

          {/* Auto-replenish setting */}
          <div className="rounded-2xl border border-cyan-500/15 bg-white/[0.03] divide-y divide-white/5" data-testid="section-auto-replenish">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-black">Auto-replenish shields</p>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">
                    Automatically buy a shield with coins when you run low
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={autoReplenish}
                disabled={updateAutoReplenish.isPending}
                data-testid="toggle-auto-replenish"
                onClick={() =>
                  updateAutoReplenish.mutate({ data: { autoReplenishShields: !autoReplenish } })
                }
                className={`relative shrink-0 ml-3 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
                  autoReplenish ? "bg-cyan-500" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    autoReplenish ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {autoReplenish && (
              <div className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white/80">Keep at least</p>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    Auto-buy when shields drop below this
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-testid="threshold-decrement"
                    disabled={replenishThreshold <= 1 || updateAutoReplenish.isPending}
                    onClick={() =>
                      updateAutoReplenish.mutate({ data: { shieldAutoReplenishThreshold: replenishThreshold - 1 } })
                    }
                    className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold flex items-center justify-center disabled:opacity-30 transition"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-sm font-black w-6 text-center" data-testid="threshold-value">
                    {replenishThreshold}
                  </span>
                  <button
                    data-testid="threshold-increment"
                    disabled={replenishThreshold >= 10 || updateAutoReplenish.isPending}
                    onClick={() =>
                      updateAutoReplenish.mutate({ data: { shieldAutoReplenishThreshold: replenishThreshold + 1 } })
                    }
                    className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold flex items-center justify-center disabled:opacity-30 transition"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* More coming soon */}
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-6 text-center space-y-1">
          <ShoppingBag className="w-6 h-6 text-white/20 mx-auto" />
          <p className="text-sm text-white/30 font-medium">More items coming soon</p>
        </div>

      </div>
    </div>
  );
}
