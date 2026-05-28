import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Crown, Check, Sparkles, Trophy, X, ExternalLink, ArrowLeft, Loader2 } from "lucide-react";
import { useSubscription, useStartCheckout, useOpenPortal } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";

const FREE_FEATURES = [
  "Up to 6 Hatchlings in your roster",
  "5 AI coach messages per day",
  "5 battle entries per day",
  "World & country leaderboards",
];

const PREMIUM_FEATURES = [
  "Unlimited Hatchlings",
  "Unlimited AI coach + advanced analytics",
  "Unlimited battles + ranked play",
  "Local leaderboards (nearby, city, county, state)",
  "Premium cosmetics + 12 customization slots",
  "Unlimited social posts and follows",
];

export default function SubscriptionPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useSubscription();
  const checkout = useStartCheckout();
  const portal = useOpenPortal();
  const { toast } = useToast();

  // Show success/cancelled toast from Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      toast({ title: "Welcome to Premium!", description: "Your subscription is active." });
    } else if (status === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charges were made." });
    }
  }, []);

  if (isLoading || !data) {
    return (
      <div className="min-h-[100dvh] bg-[#050508] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
      </div>
    );
  }

  const isPremium = data.tier === "premium";

  const handleCheckout = async (interval: "month" | "year") => {
    try {
      const { url } = await checkout.mutateAsync(interval);
      window.location.href = url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Checkout failed";
      toast({ title: "Checkout unavailable", description: msg, variant: "destructive" });
    }
  };

  const handlePortal = async () => {
    try {
      const { url } = await portal.mutateAsync();
      window.location.href = url;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Portal unavailable";
      toast({ title: "Couldn't open portal", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#050508] via-[#0d0820] to-[#050508] text-white pb-24">
      <header className="sticky top-0 z-10 backdrop-blur-xl bg-black/40 border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-1 -ml-1 text-white/70 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-black tracking-tight">HatchUp Premium</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6 space-y-6">
        {/* Status card */}
        <section
          className="rounded-3xl p-5 border border-white/10 bg-gradient-to-br from-pink-500/10 via-violet-500/10 to-transparent"
          data-testid="card-subscription-status"
        >
          <StatusBlock data={data} />
        </section>

        {/* Plan comparison */}
        {!isPremium && (
          <section className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/50 px-1">Choose a plan</h2>

            <PlanCard
              title="Monthly"
              price="$8.99"
              suffix="/ month"
              cta="Start Monthly"
              testid="button-checkout-monthly"
              onClick={() => handleCheckout("month")}
              loading={checkout.isPending}
            />

            <PlanCard
              title="Yearly"
              price="$80"
              suffix="/ year"
              badge="Save 26%"
              cta="Start Yearly"
              testid="button-checkout-yearly"
              onClick={() => handleCheckout("year")}
              loading={checkout.isPending}
              featured
            />
          </section>
        )}

        {isPremium && data.source === "paid" && (
          <button
            onClick={handlePortal}
            disabled={portal.isPending}
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition"
            data-testid="button-manage-billing"
          >
            {portal.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Manage Billing
          </button>
        )}

        {/* Feature comparison */}
        <section className="rounded-3xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          <div className="p-4">
            <h3 className="font-black text-sm mb-3 flex items-center gap-2">
              <X className="w-4 h-4 text-white/40" /> Free
            </h3>
            <ul className="space-y-2">
              {FREE_FEATURES.map(f => (
                <li key={f} className="text-sm text-white/70 flex items-start gap-2">
                  <span className="text-white/30 mt-0.5">·</span>{f}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-4 bg-gradient-to-br from-amber-500/5 to-transparent">
            <h3 className="font-black text-sm mb-3 flex items-center gap-2 text-amber-200">
              <Crown className="w-4 h-4" /> Premium
            </h3>
            <ul className="space-y-2">
              {PREMIUM_FEATURES.map(f => (
                <li key={f} className="text-sm text-white/90 flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Top 10 explainer */}
        <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <h3 className="font-black text-sm flex items-center gap-2 text-emerald-300">
            <Trophy className="w-4 h-4" /> City Top 10 = Free Premium
          </h3>
          <p className="text-xs text-white/70 mt-2 leading-relaxed">
            If you're ranked in the top 10 of your city on <strong>any</strong> tracked metric
            (XP, steps, workouts, battle wins, streaks, or artifacts), you get Premium free for
            as long as you hold that rank. We re-check daily.
          </p>
        </section>

        <p className="text-[11px] text-white/30 text-center px-4 leading-relaxed">
          HatchUp Premium never gives a competitive advantage in battles, races, or
          leaderboards. Premium unlocks convenience, customization, and analytics only.
        </p>

        <Link href="/">
          <button className="w-full text-center text-sm text-white/40 hover:text-white/60 py-2">
            Back to home
          </button>
        </Link>
      </main>
    </div>
  );
}

function StatusBlock({ data }: { data: NonNullable<ReturnType<typeof useSubscription>["data"]> }) {
  if (data.source === "paid") {
    return (
      <div className="text-center">
        <Crown className="w-10 h-10 mx-auto text-amber-400 mb-2" />
        <p className="text-xs uppercase tracking-widest text-amber-300/80 font-black">Active Subscriber</p>
        <p className="text-lg font-black mt-1">You're a Premium member</p>
        {data.paidUntil && (
          <p className="text-xs text-white/50 mt-1">
            Renews {new Date(data.paidUntil).toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }
  if (data.source === "trial") {
    return (
      <div className="text-center">
        <Sparkles className="w-10 h-10 mx-auto text-pink-400 mb-2" />
        <p className="text-xs uppercase tracking-widest text-pink-300/80 font-black">Free Trial</p>
        <p className="text-lg font-black mt-1">
          {data.daysLeftInTrial} day{data.daysLeftInTrial === 1 ? "" : "s"} left
        </p>
        <p className="text-xs text-white/50 mt-1">
          Subscribe before {data.trialEndsAt && new Date(data.trialEndsAt).toLocaleDateString()} to keep Premium.
        </p>
      </div>
    );
  }
  if (data.source === "top10") {
    return (
      <div className="text-center">
        <Trophy className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
        <p className="text-xs uppercase tracking-widest text-emerald-300/80 font-black">Top 10 Champion</p>
        <p className="text-lg font-black mt-1">{data.top10ContextLabel}</p>
        <p className="text-xs text-white/50 mt-1">Premium is on us while you hold this rank.</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <Crown className="w-10 h-10 mx-auto text-white/30 mb-2" />
      <p className="text-xs uppercase tracking-widest text-white/40 font-black">Free Account</p>
      <p className="text-lg font-black mt-1">Upgrade to unlock everything</p>
      <p className="text-xs text-white/50 mt-1">Start with a 7-day trial — cancel anytime.</p>
    </div>
  );
}

function PlanCard(props: {
  title: string; price: string; suffix: string; cta: string;
  badge?: string; featured?: boolean; loading?: boolean;
  onClick: () => void; testid: string;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.loading}
      data-testid={props.testid}
      className={`w-full text-left rounded-3xl p-5 transition active:scale-[0.98] disabled:opacity-50 ${
        props.featured
          ? "bg-gradient-to-br from-amber-500 to-pink-500 text-black"
          : "bg-white/[0.04] border border-white/10 hover:bg-white/[0.07]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-black uppercase tracking-widest ${props.featured ? "text-black/70" : "text-white/50"}`}>
          {props.title}
        </span>
        {props.badge && (
          <span className="bg-black/20 text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
            {props.badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-black">{props.price}</span>
        <span className={`text-sm ${props.featured ? "text-black/60" : "text-white/50"}`}>{props.suffix}</span>
      </div>
      <div className={`inline-flex items-center gap-2 text-sm font-bold ${props.featured ? "text-black" : "text-pink-300"}`}>
        {props.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {props.cta} →
      </div>
    </button>
  );
}
