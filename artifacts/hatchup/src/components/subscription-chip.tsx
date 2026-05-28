import { Link } from "wouter";
import { Crown, Sparkles, Trophy, AlertCircle } from "lucide-react";
import { useSubscription } from "@/lib/subscription";

export function SubscriptionChip() {
  const { data, isLoading } = useSubscription();
  if (isLoading || !data) return null;

  let icon, label, classes;
  if (data.source === "paid") {
    icon = <Crown className="w-3.5 h-3.5" />;
    label = "Premium";
    classes = "bg-gradient-to-r from-amber-500 to-yellow-400 text-black";
  } else if (data.source === "trial") {
    icon = <Sparkles className="w-3.5 h-3.5" />;
    label = data.daysLeftInTrial && data.daysLeftInTrial > 0
      ? `Trial · ${data.daysLeftInTrial}d left`
      : "Trial ending";
    classes = "bg-gradient-to-r from-pink-500 to-violet-500 text-white";
  } else if (data.source === "top10") {
    icon = <Trophy className="w-3.5 h-3.5" />;
    label = data.top10ContextLabel ?? "City Top 10";
    classes = "bg-gradient-to-r from-emerald-500 to-teal-500 text-white";
  } else {
    icon = <AlertCircle className="w-3.5 h-3.5" />;
    label = "Upgrade";
    classes = "bg-white/10 text-white border border-white/15";
  }

  return (
    <Link href="/subscription">
      <button
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition hover:opacity-90 active:scale-95 ${classes}`}
        data-testid="button-subscription-chip"
      >
        {icon}
        <span>{label}</span>
      </button>
    </Link>
  );
}
