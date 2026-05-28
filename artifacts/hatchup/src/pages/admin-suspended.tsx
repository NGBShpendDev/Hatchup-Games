import { AdminGate } from "@/components/admin-gate";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Ban, RotateCcw, User as UserIcon, Flag, ScrollText } from "lucide-react";
import { motion } from "framer-motion";

interface SuspendedPlayer {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  suspendedByAdminId: number | null;
  suspendedByAdmin: {
    id: number;
    username: string;
    displayName: string | null;
  } | null;
}

function AdminSuspendedInner() {
  const { playerId, player } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = !!(player as { isAdmin?: boolean } | null)?.isAdmin;

  const { data: suspended, isLoading } = useQuery<SuspendedPlayer[]>({
    queryKey: ["admin-suspended", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/players/suspended`, { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAdmin && !!playerId,
  });

  const handleUnsuspend = async (target: SuspendedPlayer) => {
    if (!confirm(`Unsuspend @${target.username}? They will regain access to posting, commenting, reacting, and following.`)) {
      return;
    }
    const res = await fetch(`/api/admin/players/${target.id}/suspend`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuspended: false }),
    });
    if (res.ok) {
      toast({ title: `@${target.username} unsuspended` });
      qc.invalidateQueries({ queryKey: ["admin-suspended"] });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Failed to unsuspend", description: err.error ?? "Try again later", variant: "destructive" });
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
            <Ban className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-2xl">Suspended Accounts</h1>
            <p className="text-xs text-muted-foreground font-medium">Review and restore suspended players</p>
          </div>
          <Link href="/admin/audit">
            <Button variant="ghost" size="sm" data-testid="link-admin-audit">
              <ScrollText className="w-3.5 h-3.5 mr-1" /> Audit
            </Button>
          </Link>
          <Link href="/admin/reports">
            <Button variant="ghost" size="sm" data-testid="link-admin-reports">
              <Flag className="w-3.5 h-3.5 mr-1" /> Reports
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : !suspended || suspended.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Ban className="w-10 h-10 opacity-30" />
            <p className="font-bold">No suspended accounts</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suspended.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                data-testid={`row-suspended-${p.id}`}
              >
                <GlassCard className="p-4">
                  <div className="relative z-10 flex items-center gap-3">
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.displayName ?? p.username}
                        className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <Link href={`/players/${p.id}`}>
                        <p className="font-black text-sm truncate hover:underline" data-testid={`link-profile-${p.id}`}>
                          {p.displayName ?? p.username}
                        </p>
                      </Link>
                      <p className="text-xs text-muted-foreground font-medium truncate">@{p.username}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Suspended {p.suspendedAt ? new Date(p.suspendedAt).toLocaleDateString() : "—"}
                      </p>
                      {p.suspensionReason && (
                        <p
                          className="text-[11px] text-foreground/80 font-medium mt-1 line-clamp-2"
                          data-testid={`text-suspended-reason-${p.id}`}
                        >
                          <span className="font-black uppercase tracking-wider text-[9px] mr-1 text-red-400">Reason:</span>
                          {p.suspensionReason}
                        </p>
                      )}
                      {p.suspendedByAdmin && (
                        <p
                          className="text-[10px] text-muted-foreground font-medium mt-0.5"
                          data-testid={`text-suspended-by-${p.id}`}
                        >
                          By @{p.suspendedByAdmin.username}
                          {p.suspendedByAdmin.displayName ? ` (${p.suspendedByAdmin.displayName})` : ""}
                        </p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleUnsuspend(p)}
                      data-testid={`button-unsuspend-${p.id}`}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" /> Unsuspend
                    </Button>
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

export default function AdminSuspended() {
  return (
    <AdminGate>
      <AdminSuspendedInner />
    </AdminGate>
  );
}
