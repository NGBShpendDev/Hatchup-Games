import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Crown, Check, Sparkles, Trophy, X, ExternalLink, ArrowLeft, Loader2, Palette, Egg, Bot, Swords, MapPin } from "lucide-react";
import { useSubscription, useStartCheckout, useOpenPortal } from "@/lib/subscription";
import { useToast } from "@/hooks/use-toast";

type UpsellIcon = "palette" | "crown" | "egg" | "bot" | "swords" | "map";

const UPSELL_SOURCE_COPY: Record<string, { eyebrow: string; title: string; body: string; icon: UpsellIcon; highlightFeature?: string }> = {
  accent: {
    eyebrow: "Cosmetic upgrade",
    title: "Unlock the full accent palette",
    body: "Premium unlocks every share-card accent gradient plus 12 customization slots so your posts, profile, and club cards stand out.",
    icon: "palette",
    highlightFeature: "Premium cosmetics + 12 customization slots",
  },
  hatchling_cap: {
    eyebrow: "Roster full",
    title: "Hatch as many Pals as you want",
    body: "Free accounts cap at 6 Hatchlings. Premium removes the cap so every egg you hatch can join your roster — no swapping, no goodbyes.",
    icon: "egg",
    highlightFeature: "Unlimited Hatchlings",
  },
  coach_cap: {
    eyebrow: "Coach is tapped out",
    title: "Unlimited AI coaching",
    body: "Free accounts get 5 AI coach messages per day. Premium unlocks unlimited chats plus advanced analytics so Hatch can deep-dive on your training.",
    icon: "bot",
    highlightFeature: "Unlimited AI coach + advanced analytics",
  },
  battle_cap: {
    eyebrow: "Daily battles used",
    title: "Battle without the daily cap",
    body: "Free accounts get 5 battle entries per day. Premium unlocks unlimited matches plus ranked play so you can keep climbing the ladder.",
    icon: "swords",
    highlightFeature: "Unlimited battles + ranked play",
  },
  leaderboard_scope: {
    eyebrow: "Local boards locked",
    title: "Compete in your city, county, and state",
    body: "Free accounts see world and country leaderboards. Premium unlocks nearby, city, county, and state boards so you can see how you stack up locally.",
    icon: "map",
    highlightFeature: "Local leaderboards (nearby, city, county, state)",
  },
  customization_slot: {
    eyebrow: "Customization locked",
    title: "Unlock 12 customization slots",
    body: "Free accounts get 2 customization slots. Premium opens 12 slots plus every cosmetic gradient so your posts, profile, and club cards stand out.",
    icon: "palette",
    highlightFeature: "Premium cosmetics + 12 customization slots",
  },
};

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

function UpsellIconView({ icon }: { icon: UpsellIcon }) {
  const cls = "w-5 h-5 text-amber-300";
  switch (icon) {
    case "palette": return <Palette className={cls} />;
    case "egg":     return <Egg className={cls} />;
    case "bot":     return <Bot className={cls} />;
    case "swords":  return <Swords className={cls} />;
    case "map":     return <MapPin className={cls} />;
    case "crown":
    default:        return <Crown className={cls} />;
  }
}

export default function SubscriptionPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useSubscription();
  const checkout = useStartCheckout();
  const portal = useOpenPortal();
  const { toast } = useToast();

  const upsellSource = useMemo(() => {
    if (typeof window === "undefined") return null;
    const from = new URLSearchParams(window.location.search).get("from");
    return from && UPSELL_SOURCE_COPY[from] ? from : null;
  }, []);
  const upsellCopy = upsellSource ? UPSELL_SOURCE_COPY[upsellSource] : null;

  // Show success/cancelled toast from Stripe redirect, log upsell entry
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      toast({ title: "Welcome to Premium!", description: "Your subscription is active." });
    } else if (status === "cancelled") {
      toast({ title: "Checkout cancelled", description: "No charges were made." });
    }
    const from = params.get("from");
    if (from) {
      // Lightweight client-side tracking so we can measure conversion from upsell surfaces.
      // eslint-disable-next-line no-console
      console.info("[subscription] upsell_view", { from });
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
        {upsellCopy && !isPremium && (
          <section
            className="rounded-3xl p-5 border border-amber-400/30 bg-gradient-to-br from-amber-500/15 via-pink-500/10 to-violet-500/10"
            data-testid={`banner-upsell-${upsellSource}`}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-2xl bg-amber-400/20 flex items-center justify-center">
                <UpsellIconView icon={upsellCopy.icon} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300/80">
                  {upsellCopy.eyebrow}
                </p>
                <h2 className="text-base font-black mt-0.5">{upsellCopy.title}</h2>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">{upsellCopy.body}</p>
              </div>
            </div>
          </section>
        )}

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
              {PREMIUM_FEATURES.map(f => {
                const highlight = !!upsellCopy?.highlightFeature && f === upsellCopy.highlightFeature;
                return (
                  <li
                    key={f}
                    className={`text-sm flex items-start gap-2 ${
                      highlight
                        ? "text-amber-100 font-bold bg-amber-400/10 rounded-lg px-2 py-1 -mx-2 ring-1 ring-amber-400/30"
                        : "text-white/90"
                    }`}
                    data-testid={highlight ? `feature-highlight-${upsellSource}` : undefined}
                  >
                    <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${highlight ? "text-amber-300" : "text-emerald-400"}`} />
                    {f}
                  </li>
                );
              })}
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
