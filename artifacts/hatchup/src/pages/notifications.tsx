import { Layout } from "@/components/layout";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useAcceptBattleRematch,
  useDeclineBattleRematch,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Mail, Trophy, Clock, Sparkles, Users, Swords, Check, X, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const POLL_MS = 30_000;
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function extractRematchId(link: string | null | undefined): string | null {
  if (!link) return null;
  const m = link.match(/[?&]rematch=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function isPendingRematchInvite(n: Notification): boolean {
  if (n.type !== "rematch_invite") return false;
  if (!extractRematchId(n.link)) return false;
  // The follow-up notifications use titles like "accepted your rematch" /
  // "declined your rematch". The original challenge title is
  // "<name> wants a rematch!".
  return /wants a rematch/i.test(n.title);
}

function challengeInviteId(n: Notification): number | null {
  if (n.type !== "challenge_invite") return null;
  // The challenge-invite responder endpoint takes the invite id; the
  // creator stores it as the notification's sourceId.
  return typeof n.sourceId === "number" ? n.sourceId : null;
}

function isClubMention(n: Notification): boolean {
  return n.type === "club_mention";
}

function clubInviteId(n: Notification): number | null {
  if (n.type !== "club_invite") return null;
  return typeof n.sourceId === "number" ? n.sourceId : null;
}

const TYPE_META: Record<string, { icon: typeof Bell; color: string }> = {
  challenge_invite:   { icon: Mail,      color: "from-pink-500 to-rose-500" },
  challenge_ending:   { icon: Clock,     color: "from-amber-500 to-orange-500" },
  challenge_complete: { icon: Trophy,    color: "from-emerald-500 to-teal-500" },
  club_mention:       { icon: Users,     color: "from-indigo-500 to-violet-500" },
  club_invite:        { icon: Users,     color: "from-indigo-500 to-violet-500" },
  artifact_unlock:    { icon: Sparkles,  color: "from-fuchsia-500 to-purple-500" },
  rematch_invite:     { icon: Swords,    color: "from-red-500 to-pink-600" },
};

function iconFor(type: string) {
  return TYPE_META[type] ?? { icon: Bell, color: "from-primary to-accent" };
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busyInvite, setBusyInvite] = useState<{ id: number; action: "accept" | "decline" } | null>(null);

  const listParams = { limit: 50 };
  const { data, isLoading } = useListNotifications(listParams, {
    query: {
      queryKey: getListNotificationsQueryKey(listParams),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
  const { data: countData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const acceptInvite = useAcceptBattleRematch();
  const declineInvite = useDeclineBattleRematch();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey(listParams) });
    qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 20 }) });
  };

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate({ id: n.id }, { onSuccess: refresh });
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    markAllRead.mutate(undefined, { onSuccess: refresh });
  };

  const acceptRematch = async (n: Notification, inviteId: string) => {
    setBusyInvite({ id: n.id, action: "accept" });
    try {
      await acceptInvite.mutateAsync({ id: inviteId });
      if (!n.read) markRead.mutate({ id: n.id });
      refresh();
      // Drop the user into the battle queue with the invite-tagged hatchling.
      navigate(n.link ?? `/compete/battle?rematch=${inviteId}`);
    } catch (err) {
      toast({
        title: "Could not accept rematch",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusyInvite(null);
    }
  };

  const respondToChallengeInvite = async (
    n: Notification,
    inviteId: number,
    status: "accepted" | "declined",
  ) => {
    setBusyInvite({ id: n.id, action: status === "accepted" ? "accept" : "decline" });
    try {
      const res = await fetch(`${BASE}/api/challenge-invites/${inviteId}/respond`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      // The responder endpoint already marks the related notification read,
      // but invalidate locally so the UI reflects it immediately.
      if (!n.read) markRead.mutate({ id: n.id });
      refresh();
      if (status === "accepted") {
        toast({ title: "Challenge accepted", description: "You're in. Good luck!" });
        navigate(n.link ?? "/challenges");
      } else {
        toast({ title: "Challenge declined" });
      }
    } catch (err) {
      toast({
        title: status === "accepted" ? "Could not accept invite" : "Could not decline invite",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusyInvite(null);
    }
  };

  const respondToClubInvite = async (
    n: Notification,
    inviteId: number,
    status: "accepted" | "declined",
  ) => {
    setBusyInvite({ id: n.id, action: status === "accepted" ? "accept" : "decline" });
    try {
      const res = await fetch(`${BASE}/api/club-invites/${inviteId}/respond`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      if (!n.read) markRead.mutate({ id: n.id });
      refresh();
      if (status === "accepted") {
        toast({ title: "Joined the club", description: "Welcome aboard!" });
        navigate(n.link ?? "/club");
      } else {
        toast({ title: "Club invite declined" });
      }
    } catch (err) {
      toast({
        title: status === "accepted" ? "Could not accept invite" : "Could not decline invite",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusyInvite(null);
    }
  };

  const dismissNotification = async (n: Notification) => {
    setBusyInvite({ id: n.id, action: "decline" });
    try {
      if (!n.read) {
        await new Promise<void>((resolve, reject) => {
          markRead.mutate(
            { id: n.id },
            { onSuccess: () => resolve(), onError: (e) => reject(e) },
          );
        });
      }
      refresh();
      toast({ title: "Dismissed" });
    } catch (err) {
      toast({
        title: "Could not dismiss",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusyInvite(null);
    }
  };

  const declineRematch = async (n: Notification, inviteId: string) => {
    setBusyInvite({ id: n.id, action: "decline" });
    try {
      await declineInvite.mutateAsync({ id: inviteId });
      if (!n.read) markRead.mutate({ id: n.id });
      refresh();
      toast({ title: "Rematch declined" });
    } catch (err) {
      toast({
        title: "Could not decline rematch",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setBusyInvite(null);
    }
  };

  const items = data ?? [];
  const unread = countData?.count ?? 0;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Notifications</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAll}
              className="gap-1"
              data-testid="button-mark-all-read-page"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="mx-auto w-14 h-14 rounded-full bg-card border border-border/40 flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-bold">Nothing here yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Challenge invites, alerts, and results will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n: Notification, idx: number) => {
              const meta = iconFor(n.type);
              const Icon = meta.icon;
              const rematchId = isPendingRematchInvite(n) ? extractRematchId(n.link) : null;
              const challengeId = challengeInviteId(n);
              const clubInvId = !n.read ? clubInviteId(n) : null;
              const clubMention = isClubMention(n) && !n.read ? n : null;
              const hasInlineActions = Boolean(rematchId || challengeId || clubInvId || clubMention);
              const busy = busyInvite?.id === n.id ? busyInvite.action : null;
              const rowClass = `w-full text-left rounded-xl border bg-card/60 backdrop-blur p-3 flex items-start gap-3 transition-all hover:bg-card hover:border-border ${
                n.read ? "border-border/30 opacity-70" : "border-primary/40 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.6)]"
              }`;

              const inner = (
                <>
                  <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shadow-md`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold leading-tight flex-1 truncate">{n.title}</span>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0 shadow-[0_0_6px_rgba(var(--primary),0.8)]" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                    )}
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1">
                      {formatRelative(n.createdAt)}
                    </p>
                    {rematchId && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 gap-1 bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-500/90 hover:to-pink-600/90"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            acceptRematch(n, rematchId);
                          }}
                          data-testid={`button-accept-rematch-${n.id}`}
                        >
                          {busy === "accept"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            declineRematch(n, rematchId);
                          }}
                          data-testid={`button-decline-rematch-${n.id}`}
                        >
                          {busy === "decline"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />}
                          Decline
                        </Button>
                      </div>
                    )}
                    {challengeId !== null && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 gap-1 bg-gradient-to-br from-pink-500 to-rose-500 hover:from-pink-500/90 hover:to-rose-500/90"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            respondToChallengeInvite(n, challengeId, "accepted");
                          }}
                          data-testid={`button-accept-challenge-${n.id}`}
                        >
                          {busy === "accept"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            respondToChallengeInvite(n, challengeId, "declined");
                          }}
                          data-testid={`button-decline-challenge-${n.id}`}
                        >
                          {busy === "decline"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />}
                          Decline
                        </Button>
                      </div>
                    )}
                    {clubInvId !== null && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2.5 gap-1 bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-500/90 hover:to-violet-500/90"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            respondToClubInvite(n, clubInvId, "accepted");
                          }}
                          data-testid={`button-accept-club-invite-${n.id}`}
                        >
                          {busy === "accept"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            respondToClubInvite(n, clubInvId, "declined");
                          }}
                          data-testid={`button-decline-club-invite-${n.id}`}
                        >
                          {busy === "decline"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />}
                          Decline
                        </Button>
                      </div>
                    )}
                    {clubMention && (
                      <div className="mt-2 flex gap-2">
                        {n.link && (
                          <Button
                            size="sm"
                            className="h-7 px-2.5 gap-1 bg-gradient-to-br from-indigo-500 to-violet-500 hover:from-indigo-500/90 hover:to-violet-500/90"
                            disabled={busy !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              open(n);
                            }}
                            data-testid={`button-view-club-${n.id}`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            View
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 gap-1"
                          disabled={busy !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissNotification(n);
                          }}
                          data-testid={`button-dismiss-club-${n.id}`}
                        >
                          {busy === "decline"
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <X className="w-3.5 h-3.5" />}
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              );

              // For rows with inline action buttons we render a non-button
              // container so the nested buttons don't violate button-in-button
              // semantics. Tapping the body still opens the link.
              if (hasInlineActions) {
                return (
                  <motion.div
                    key={n.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.2) }}
                    onClick={() => open(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(n);
                      }
                    }}
                    className={`${rowClass} cursor-pointer`}
                    data-testid={`notification-row-${n.id}`}
                  >
                    {inner}
                  </motion.div>
                );
              }

              return (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.2) }}
                  onClick={() => open(n)}
                  className={rowClass}
                  data-testid={`notification-row-${n.id}`}
                >
                  {inner}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
