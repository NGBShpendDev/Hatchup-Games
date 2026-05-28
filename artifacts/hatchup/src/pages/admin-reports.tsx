import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { GlowBadge } from "@/components/ui/glow-badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Flag, CheckCircle, X, AlertTriangle, User, Ban, Trash2, RotateCcw, Clock, ScrollText, Snowflake } from "lucide-react";
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

interface DeletedPostReport {
  id: number;
  reporterId: number;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
}

interface DeletedPost {
  id: number;
  playerId: number;
  authorName: string;
  authorUsername: string | null;
  authorAvatar: string | null;
  content: string;
  mediaUrl: string | null;
  postType: string;
  createdAt: string;
  deletedAt: string;
  purgeAt: string;
  isFlagged: boolean;
  engagementScore: number;
  viewCount: number;
  reports: DeletedPostReport[];
}

interface DeletedPostsResponse {
  posts: DeletedPost[];
  retentionDays: number;
}

interface FrozenPost {
  id: number;
  playerId: number;
  authorName: string;
  authorUsername: string | null;
  content: string;
  postType: string;
  createdAt: string;
  viewCount: number;
  viewsFrozenAt: string;
  viewsFreezeReason: string | null;
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

function formatCountdown(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "purging soon";
  const days = Math.floor(diffMs / 86_400_000);
  if (days >= 1) return `purges in ${days}d`;
  const hours = Math.max(1, Math.floor(diffMs / 3_600_000));
  return `purges in ${hours}h`;
}

export default function AdminReports() {
  const { playerId, player } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"reports" | "deleted" | "frozen">("reports");
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
    enabled: isAdmin && !!playerId && tab === "reports",
  });

  const { data: deletedData, isLoading: deletedLoading } = useQuery<DeletedPostsResponse>({
    queryKey: ["admin-deleted-posts", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/social/deleted-posts`, { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAdmin && !!playerId && tab === "deleted",
  });

  const { data: frozenData, isLoading: frozenLoading } = useQuery<{ posts: FrozenPost[] }>({
    queryKey: ["admin-frozen-posts", playerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/social/frozen-posts`, { credentials: "include" });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
    enabled: isAdmin && !!playerId && tab === "frozen",
  });

  const handleUnfreeze = async (postId: number) => {
    if (!confirm(`Unfreeze post #${postId}? Views will start accruing again.`)) return;
    const res = await fetch(`/api/admin/social/posts/${postId}/unfreeze`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: `Post #${postId} unfrozen`, description: "View counter is live again." });
      qc.invalidateQueries({ queryKey: ["admin-frozen-posts"] });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Failed to unfreeze", description: err.error ?? "Try again later", variant: "destructive" });
    }
  };

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
    const reasonInput = window.prompt(
      `Reason for suspending account #${reportedUserId}? (Optional — shown to the player and on the suspended-users list. Max 500 chars.)`,
      "",
    );
    if (reasonInput === null) {
      // User cancelled the reason prompt — abort the suspend entirely so
      // they don't accidentally suspend someone without confirming intent.
      return;
    }
    const reason = reasonInput.trim().slice(0, 500);
    const res = await fetch(`/api/admin/players/${reportedUserId}/suspend`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuspended: true, reason: reason || undefined }),
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

  const handleRestore = async (postId: number) => {
    const res = await fetch(`/api/admin/social/posts/${postId}/restore`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: "Post restored", description: "It's visible in feeds and on the author's profile again." });
      qc.invalidateQueries({ queryKey: ["admin-deleted-posts"] });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Failed to restore", description: err.error ?? "Try again later", variant: "destructive" });
    }
  };

  const handlePurge = async (postId: number) => {
    if (!confirm(`Permanently delete post #${postId}? This skips the 30-day retention window and cannot be undone.`)) {
      return;
    }
    const res = await fetch(`/api/admin/social/posts/${postId}/purge`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      toast({ title: `Post #${postId} purged` });
      qc.invalidateQueries({ queryKey: ["admin-deleted-posts"] });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Failed to purge", description: err.error ?? "Try again later", variant: "destructive" });
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
            <p className="text-xs text-muted-foreground font-medium">Review reports and recently deleted posts</p>
          </div>
          <Link href="/admin/audit">
            <Button variant="ghost" size="sm" data-testid="link-admin-audit">
              <ScrollText className="w-3.5 h-3.5 mr-1" /> Audit
            </Button>
          </Link>
          <Link href="/admin/suspended">
            <Button variant="ghost" size="sm" data-testid="link-admin-suspended">
              <Ban className="w-3.5 h-3.5 mr-1" /> Suspended
            </Button>
          </Link>
        </div>

        {/* Top-level tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("reports")}
            data-testid="tab-reports"
            className={`px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
              tab === "reports" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setTab("deleted")}
            data-testid="tab-deleted"
            className={`px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
              tab === "deleted" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Deleted Posts
          </button>
          <button
            onClick={() => setTab("frozen")}
            data-testid="tab-frozen"
            className={`px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all ${
              tab === "frozen" ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Frozen
          </button>
        </div>

        {tab === "reports" ? (
          <>{/* reports panel below */}
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
          </>
        ) : tab === "deleted" ? (
          <>
            <p className="text-xs text-muted-foreground font-medium">
              Deleted posts are kept for {deletedData?.retentionDays ?? 30} days before they're permanently purged.
              Restore one to put it back in feeds, or purge early to remove it now.
            </p>

            {deletedLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}
              </div>
            ) : !deletedData || deletedData.posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Trash2 className="w-10 h-10 opacity-30" />
                <p className="font-bold">No deleted posts in the retention window</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deletedData.posts.map((post) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <GlassCard className="p-4">
                      <div className="relative z-10 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-black text-sm truncate">
                                {post.authorName}
                                {post.authorUsername && (
                                  <span className="text-muted-foreground font-medium"> @{post.authorUsername}</span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                Post #{post.id} · {post.postType}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-bold shrink-0">
                            <Clock className="w-3 h-3" />
                            {formatCountdown(post.purgeAt)}
                          </div>
                        </div>

                        <p className="text-xs whitespace-pre-wrap break-words bg-muted/30 px-3 py-2 rounded-xl">
                          {post.content}
                        </p>

                        {post.mediaUrl && (
                          <a
                            href={post.mediaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[10px] text-primary underline truncate"
                          >
                            {post.mediaUrl}
                          </a>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground font-medium">
                          <div>Posted {formatRelative(post.createdAt)}</div>
                          <div>Deleted {formatRelative(post.deletedAt)}</div>
                          <div>Views: {post.viewCount}</div>
                          <div>Engagement: {post.engagementScore}</div>
                        </div>

                        {post.reports.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                              {post.reports.length} linked report{post.reports.length === 1 ? "" : "s"}
                            </p>
                            <div className="space-y-1">
                              {post.reports.map(r => (
                                <div key={r.id} className="text-[11px] bg-amber-500/5 border border-amber-500/20 rounded-lg px-2 py-1.5 flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="font-bold">{REASON_LABELS[r.reason] ?? r.reason}</p>
                                    {r.description && (
                                      <p className="text-muted-foreground truncate">"{r.description}"</p>
                                    )}
                                    <p className="text-muted-foreground">
                                      Reporter #{r.reporterId} · {formatRelative(r.createdAt)}
                                    </p>
                                  </div>
                                  <GlowBadge tone={STATUS_TONES[r.status] ?? "violet"}>{r.status}</GlowBadge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <NeonButton
                            size="sm"
                            onClick={() => handleRestore(post.id)}
                            className="flex-1"
                            data-testid={`button-restore-${post.id}`}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Restore
                          </NeonButton>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handlePurge(post.id)}
                            className="flex-1"
                            data-testid={`button-purge-${post.id}`}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Purge now
                          </Button>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground font-medium">
              These posts had their view counts frozen by the automated abuse detector
              after an anomalous traffic spike. The displayed count is locked and no new
              views accrue. Unfreeze once you've verified the traffic is legitimate.
            </p>

            {frozenLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
              </div>
            ) : !frozenData || frozenData.posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                <Snowflake className="w-10 h-10 opacity-30" />
                <p className="font-bold">No frozen posts right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                {frozenData.posts.map((post) => (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <GlassCard className="p-4">
                      <div className="relative z-10 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Snowflake className="w-4 h-4 text-cyan-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-black text-sm truncate">
                                {post.authorName}
                                {post.authorUsername && (
                                  <span className="text-muted-foreground font-medium"> @{post.authorUsername}</span>
                                )}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-medium">
                                Post #{post.id} · {post.postType}
                              </p>
                            </div>
                          </div>
                          <GlowBadge tone="violet">frozen</GlowBadge>
                        </div>

                        <p className="text-xs whitespace-pre-wrap break-words bg-muted/30 px-3 py-2 rounded-xl">
                          {post.content}
                        </p>

                        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground font-medium">
                          <div>Posted {formatRelative(post.createdAt)}</div>
                          <div>Frozen {formatRelative(post.viewsFrozenAt)}</div>
                          <div>Locked views: {post.viewCount}</div>
                          <div className="truncate" title={post.viewsFreezeReason ?? ""}>
                            Reason: {post.viewsFreezeReason ?? "—"}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-1">
                          <NeonButton
                            size="sm"
                            onClick={() => handleUnfreeze(post.id)}
                            className="flex-1"
                            data-testid={`button-unfreeze-${post.id}`}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" /> Unfreeze
                          </NeonButton>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
