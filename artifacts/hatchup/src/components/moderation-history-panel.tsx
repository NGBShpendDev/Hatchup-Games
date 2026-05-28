import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, Shield, Flag } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GlowBadge } from "@/components/ui/glow-badge";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface AuditEntry {
  id: number;
  actorId: number;
  action: string;
  targetPlayerId: number | null;
  targetReportId: number | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  suspend: "Suspended account",
  unsuspend: "Unsuspended account",
  verify: "Verified profile",
  unverify: "Removed verification",
  resolve_report: "Resolved report",
  dismiss_report: "Dismissed report",
  reopen_report: "Reopened report",
};

const ACTION_TONES: Record<string, "yellow" | "green" | "violet" | "cyan"> = {
  suspend: "yellow",
  unsuspend: "green",
  verify: "cyan",
  unverify: "yellow",
  resolve_report: "green",
  dismiss_report: "violet",
  reopen_report: "yellow",
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function actorName(e: AuditEntry): string {
  if (e.actorDisplayName && e.actorDisplayName.trim()) return e.actorDisplayName;
  if (e.actorUsername) return `@${e.actorUsername}`;
  return `#${e.actorId}`;
}

interface Props {
  targetPlayerId: number;
  limit?: number;
  testIdPrefix?: string;
}

export function ModerationHistoryPanel({ targetPlayerId, limit = 5, testIdPrefix = "moderation-history" }: Props) {
  const { data, isLoading, error } = useQuery<AuditEntry[]>({
    queryKey: ["moderation-history", targetPlayerId, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        targetPlayerId: String(targetPlayerId),
        limit: String(limit),
      });
      const res = await fetch(`${BASE}/api/admin/audit?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load moderation history");
      return res.json();
    },
    enabled: Number.isFinite(targetPlayerId) && targetPlayerId > 0,
  });

  const auditLink = `/admin/audit?targetPlayerId=${targetPlayerId}`;

  return (
    <div className="bg-card border border-border rounded-3xl p-4 space-y-3" data-testid={testIdPrefix}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-violet-400" />
          <h2 className="font-black text-sm text-white">Recent moderation history</h2>
        </div>
        <Link
          href={auditLink}
          className="text-[11px] font-bold text-violet-300 hover:text-violet-200"
          data-testid={`${testIdPrefix}-view-all`}
        >
          View all →
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground font-medium" data-testid={`${testIdPrefix}-error`}>
          Couldn't load history.
        </p>
      ) : !data || data.length === 0 ? (
        <p
          className="text-xs text-muted-foreground font-medium"
          data-testid={`${testIdPrefix}-empty`}
        >
          No moderation actions recorded for this player.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map(e => (
            <li key={e.id}>
              <Link
                href={`/admin/audit?targetPlayerId=${targetPlayerId}&action=${encodeURIComponent(e.action)}`}
                className="block rounded-xl bg-muted/30 px-3 py-2 hover:bg-muted/50 transition-colors"
                data-testid={`${testIdPrefix}-entry-${e.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-xs text-white truncate">
                    {ACTION_LABELS[e.action] ?? e.action}
                  </p>
                  <GlowBadge tone={ACTION_TONES[e.action] ?? "violet"}>{e.action}</GlowBadge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground font-medium">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" /> {actorName(e)}
                  </span>
                  {e.targetReportId != null && (
                    <span className="flex items-center gap-1">
                      <Flag className="w-3 h-3" /> Report #{e.targetReportId}
                    </span>
                  )}
                  <span>{formatRelative(e.createdAt)}</span>
                </div>
                {e.reason && (
                  <p className="mt-1 text-[11px] text-foreground/80 font-medium line-clamp-2">
                    "{e.reason}"
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
