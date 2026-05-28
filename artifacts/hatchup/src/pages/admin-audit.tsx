import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { useQuery } from "@tanstack/react-query";
import { Shield, ScrollText, User, Flag, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

interface AuditEntry {
  id: number;
  actorId: number;
  action: string;
  targetPlayerId: number | null;
  targetReportId: number | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  suspend: "Suspended account",
  unsuspend: "Unsuspended account",
  verify: "Verified profile",
  resolve_report: "Resolved report",
  dismiss_report: "Dismissed report",
};

const ACTION_TONES: Record<string, "yellow" | "green" | "violet" | "cyan"> = {
  suspend: "yellow",
  unsuspend: "green",
  verify: "cyan",
  resolve_report: "green",
  dismiss_report: "violet",
};

const ACTIONS = ["suspend", "unsuspend", "verify", "resolve_report", "dismiss_report"] as const;

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

export default function AdminAudit() {
  const { playerId, player } = usePlayer();
  const isAdmin = !!(player as { isAdmin?: boolean } | null)?.isAdmin;

  const [actorFilter, setActorFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");

  const { data: entries, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ["admin-audit", actorFilter, targetFilter, actionFilter, playerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actorFilter.trim()) params.set("actorId", actorFilter.trim());
      if (targetFilter.trim()) params.set("targetPlayerId", targetFilter.trim());
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAdmin && !!playerId,
  });

  if (!isAdmin) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Shield className="w-12 h-12 text-muted-foreground" />
          <p className="font-bold text-lg">Access Denied</p>
          <p className="text-sm text-muted-foreground">Admin access required.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto pb-24 space-y-6">
        <div className="flex items-center gap-3 pt-2">
          <Link href="/admin/reports">
            <Button variant="ghost" size="icon" data-testid="link-back-reports">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-2xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
            <ScrollText className="w-5 h-5 text-violet-400" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-2xl">Audit Log</h1>
            <p className="text-xs text-muted-foreground font-medium">
              Every admin moderation action, in order.
            </p>
          </div>
        </div>

        <GlassCard className="p-3">
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="number"
              placeholder="Actor ID"
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              data-testid="input-filter-actor"
              className="bg-muted/40 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/40"
            />
            <input
              type="number"
              placeholder="Target player ID"
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              data-testid="input-filter-target"
              className="bg-muted/40 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/40"
            />
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              data-testid="select-filter-action"
              className="bg-muted/40 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">All actions</option>
              {ACTIONS.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]}</option>
              ))}
            </select>
          </div>
        </GlassCard>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <ScrollText className="w-10 h-10 opacity-30" />
            <p className="font-bold">No audit entries match these filters</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassCard className="p-3">
                  <div className="relative z-10 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-sm">
                        {ACTION_LABELS[e.action] ?? e.action}
                      </p>
                      <GlowBadge tone={ACTION_TONES[e.action] ?? "violet"}>
                        {e.action}
                      </GlowBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3" />
                        <span className="font-medium">Actor: #{e.actorId}</span>
                      </div>
                      {e.targetPlayerId != null && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3" />
                          <span className="font-medium">Target: #{e.targetPlayerId}</span>
                        </div>
                      )}
                      {e.targetReportId != null && (
                        <div className="flex items-center gap-1.5">
                          <Flag className="w-3 h-3" />
                          <span className="font-medium">Report: #{e.targetReportId}</span>
                        </div>
                      )}
                      <div className="font-medium">{formatRelative(e.createdAt)}</div>
                    </div>
                    {e.reason && (
                      <p className="text-xs text-muted-foreground font-medium bg-muted/30 px-3 py-2 rounded-xl">
                        "{e.reason}"
                      </p>
                    )}
                    {e.metadata != null && (
                      <pre className="text-[10px] text-muted-foreground bg-muted/20 px-3 py-2 rounded-xl overflow-x-auto">
                        {JSON.stringify(e.metadata)}
                      </pre>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
