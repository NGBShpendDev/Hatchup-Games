import { ShieldAlert } from "lucide-react";
import { usePlayer } from "@/lib/playerContext";

export const SUSPENDED_COPY = {
  title: "Your account is suspended",
  body: "A moderator has paused your ability to post, comment, react, follow, or send group messages. HatchUp is a safe, trusted, and family-friendly community — if you believe this is a mistake, please contact support to appeal.",
  cta: "Contact support",
  supportHref: "mailto:support@hatchup.app?subject=Account%20suspension%20appeal",
} as const;

export function formatSuspendedSince(suspendedAt: string | null | undefined): string | null {
  if (!suspendedAt) return null;
  const d = new Date(suspendedAt);
  if (isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function SuspendedBanner({ className = "" }: { className?: string }) {
  const { player } = usePlayer();
  if (!player?.isSuspended) return null;
  const since = formatSuspendedSince(player.suspendedAt);
  const reason = player.suspensionReason?.trim() || null;
  return (
    <div
      role="status"
      data-testid="banner-account-suspended"
      className={`flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/15 p-3 text-destructive-foreground ${className}`}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex-1 space-y-1">
        <p className="text-sm font-black text-destructive">{SUSPENDED_COPY.title}</p>
        {since && (
          <p
            className="text-[11px] font-black uppercase tracking-wider text-destructive/80"
            data-testid="text-suspended-since"
          >
            Suspended since {since}
          </p>
        )}
        <p className="text-xs font-medium leading-relaxed text-destructive/90">
          {SUSPENDED_COPY.body}
        </p>
        {reason && (
          <p
            className="text-xs font-medium leading-relaxed text-destructive/90 bg-destructive/10 border border-destructive/30 rounded-lg px-2 py-1.5"
            data-testid="text-suspended-reason"
          >
            <span className="font-black uppercase tracking-wider text-[10px] mr-1 text-destructive">Reason:</span>
            {reason}
          </p>
        )}
        <a
          href={SUSPENDED_COPY.supportHref}
          className="inline-block text-xs font-black text-destructive underline underline-offset-2 hover:opacity-80"
          data-testid="link-suspended-support"
        >
          {SUSPENDED_COPY.cta}
        </a>
      </div>
    </div>
  );
}

export function useIsSuspended(): boolean {
  const { player } = usePlayer();
  return !!player?.isSuspended;
}
