import { AdminGate } from "@/components/admin-gate";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { GlowBadge } from "@/components/ui/glow-badge";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Shield, ScrollText, User, Flag, ArrowLeft, Undo2 } from "lucide-react";
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
  actorUsername?: string | null;
  actorDisplayName?: string | null;
  targetUsername?: string | null;
  targetDisplayName?: string | null;
  isUndoable?: boolean;
  isUndone?: boolean;
  isUndoEntry?: boolean;
  undoOfId?: number | null;
  undoneByEntryId?: number | null;
}

function nameOf(username: string | null | undefined, displayName: string | null | undefined, id: number): string {
  if (displayName && displayName.trim()) return displayName;
  if (username) return `@${username}`;
  return `#${id}`;
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

const ACTIONS = ["suspend", "unsuspend", "verify", "unverify", "resolve_report", "dismiss_report", "reopen_report"] as const;

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

function AdminAuditInner() {
  const { playerId, player } = usePlayer();
  const isAdmin = !!(player as { isAdmin?: boolean } | null)?.isAdmin;
  const queryClient = useQueryClient();

  const [actorFilter, setActorFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [undoError, setUndoError] = useState<string | null>(null);

  // Allow deep links like /admin/audit?targetPlayerId=42 (from the
  // moderation-history panel on a player's admin view) to pre-fill the filter.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("targetPlayerId");
    if (t && Number.isFinite(Number(t))) setTargetFilter(t);
    const a = params.get("actorId");
    if (a && Number.isFinite(Number(a))) setActorFilter(a);
    const act = params.get("action");
    if (act) setActionFilter(act);
  }, []);

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

  const undoMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch(`/api/admin/audit/${entryId}/undo`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Failed to undo");
      return data;
    },
    onSuccess: () => {
      setUndoError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      queryClient.invalidateQueries({ queryKey: ["admin-suspended"] });
    },
    onError: (err: Error) => {
      setUndoError(err.message);
    },
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

        {undoError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium rounded-xl px-3 py-2" data-testid="text-undo-error">
            Couldn't undo: {undoError}
          </div>
        )}

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
                      <div className="space-y-0.5">
                        <p className="font-black text-sm">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </p>
                        {e.isUndoEntry && e.undoOfId != null && (
                          <p className="text-[10px] text-muted-foreground font-medium">
                            Undo of entry #{e.undoOfId}
                          </p>
                        )}
                        {e.isUndone && e.undoneByEntryId != null && (
                          <p className="text-[10px] text-muted-foreground font-medium">
                            Already undone by entry #{e.undoneByEntryId}
                          </p>
                        )}
                      </div>
                      <GlowBadge tone={ACTION_TONES[e.action] ?? "violet"}>
                        {e.action}
                      </GlowBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5" data-testid={`text-actor-${e.id}`}>
                        <Shield className="w-3 h-3" />
                        <span className="font-medium">
                          Actor: {nameOf(e.actorUsername, e.actorDisplayName, e.actorId)}
                        </span>
                      </div>
                      {e.targetPlayerId != null && (
                        <div className="flex items-center gap-1.5" data-testid={`text-target-${e.id}`}>
                          <User className="w-3 h-3" />
                          <span className="font-medium">
                            Target: {nameOf(e.targetUsername, e.targetDisplayName, e.targetPlayerId)}
                          </span>
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
                    {(e.isUndoable || e.isUndone || (!e.isUndoEntry && ["suspend", "verify", "resolve_report", "dismiss_report"].includes(e.action))) && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!e.isUndoable || undoMutation.isPending}
                          onClick={() => undoMutation.mutate(e.id)}
                          data-testid={`button-undo-${e.id}`}
                          className="h-7 text-xs font-bold gap-1.5"
                        >
                          <Undo2 className="w-3 h-3" />
                          {e.isUndone ? "Already undone" : "Undo"}
                        </Button>
                      </div>
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

export default function AdminAudit() {
  return (
    <AdminGate>
      <AdminAuditInner />
    </AdminGate>
  );
}
