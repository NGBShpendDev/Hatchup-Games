import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Flag, CheckCircle, X, AlertTriangle, User, Ban } from "lucide-react";
import { motion } from "framer-motion";

interface AdminReport {
  id: number;
  reporterId: number;
  reportedUserId: number | null;
  reason: string;
  contentType: string;
  contentId: number | null;
  description: string | null;
  status: string;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam / Advertising",
  harassment: "Harassment / Bullying",
  fake_account: "Fake / Impersonation",
  inappropriate: "Inappropriate Content",
  suspicious_meetup: "Suspicious Meetup",
  other: "Other",
};

const STATUS_TONES: Record<string, "yellow" | "green" | "violet"> = {
  open: "yellow",
  resolved: "green",
  dismissed: "violet",
};

export default function AdminReports() {
  const { playerId, player } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "resolved" | "dismissed" | "all">("open");

  const isAdmin = !!(player as { isAdmin?: boolean } | null)?.isAdmin;

  const { data: reports, isLoading } = useQuery<AdminReport[]>({
    queryKey: ["admin-reports", filter, playerId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/admin/reports?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAdmin && !!playerId,
  });

  const handleAction = async (reportId: number, action: "resolved" | "dismissed") => {
    const res = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action }),
    });
    if (res.ok) {
      toast({ title: action === "resolved" ? "Report resolved" : "Report dismissed" });
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    }
  };

  const handleSuspend = async (reportedUserId: number, reportId: number) => {
    if (!confirm(`Suspend account #${reportedUserId}? They will be blocked from posting, commenting, reacting, and following until you unsuspend them.`)) {
      return;
    }
    const res = await fetch(`/api/admin/players/${reportedUserId}/suspend`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuspended: true }),
    });
    if (res.ok) {
      toast({ title: `Account #${reportedUserId} suspended` });
      // Auto-resolve the report once the author is suspended.
      await fetch(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Failed to suspend", description: err.error ?? "Try again later", variant: "destructive" });
    }
  };

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
          <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <Flag className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-2xl">Moderation Dashboard</h1>
            <p className="text-xs text-muted-foreground font-medium">Review and resolve user reports</p>
          </div>
          <Link href="/admin/suspended">
            <Button variant="ghost" size="sm" data-testid="link-admin-suspended">
              <Ban className="w-3.5 h-3.5 mr-1" /> Suspended
            </Button>
          </Link>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {(["open", "resolved", "dismissed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl font-bold text-xs capitalize whitespace-nowrap transition-all ${
                filter === f ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : !reports || reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <CheckCircle className="w-10 h-10 opacity-30" />
            <p className="font-bold">No {filter === "all" ? "" : filter} reports</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <GlassCard className="p-4">
                  <div className="relative z-10 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="font-black text-sm">{REASON_LABELS[report.reason] ?? report.reason}</p>
                      </div>
                      <GlowBadge tone={STATUS_TONES[report.status] ?? "violet"}>
                        {report.status}
                      </GlowBadge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <User className="w-3 h-3" />
                        <span className="font-medium">Reporter: #{report.reporterId}</span>
                      </div>
                      {report.reportedUserId && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Flag className="w-3 h-3" />
                          <span className="font-medium">Reported: #{report.reportedUserId}</span>
                        </div>
                      )}
                      <div className="text-muted-foreground font-medium">
                        Type: {report.contentType}
                      </div>
                      <div className="text-muted-foreground font-medium">
                        {new Date(report.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    {report.description && (
                      <p className="text-xs text-muted-foreground font-medium bg-muted/30 px-3 py-2 rounded-xl">
                        "{report.description}"
                      </p>
                    )}

                    {report.status === "open" && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <NeonButton
                            size="sm"
                            onClick={() => handleAction(report.id, "resolved")}
                            className="flex-1"
                          >
                            <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                          </NeonButton>
                          <NeonButton
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(report.id, "dismissed")}
                            className="flex-1"
                          >
                            <X className="w-3 h-3 mr-1" /> Dismiss
                          </NeonButton>
                        </div>
                        {report.reportedUserId && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleSuspend(report.reportedUserId!, report.id)}
                            className="w-full"
                            data-testid={`button-suspend-${report.reportedUserId}`}
                          >
                            <Ban className="w-3 h-3 mr-1" /> Suspend author #{report.reportedUserId}
                          </Button>
                        )}
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
