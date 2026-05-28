import { Layout } from "@/components/layout";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck, Mail, Trophy, Clock, Sparkles, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

const POLL_MS = 30_000;

const TYPE_META: Record<string, { icon: typeof Bell; color: string }> = {
  challenge_invite:   { icon: Mail,      color: "from-pink-500 to-rose-500" },
  challenge_ending:   { icon: Clock,     color: "from-amber-500 to-orange-500" },
  challenge_complete: { icon: Trophy,    color: "from-emerald-500 to-teal-500" },
  club_mention:       { icon: Users,     color: "from-indigo-500 to-violet-500" },
  artifact_unlock:    { icon: Sparkles,  color: "from-fuchsia-500 to-purple-500" },
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
              return (
                <motion.button
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.2) }}
                  onClick={() => open(n)}
                  className={`w-full text-left rounded-xl border bg-card/60 backdrop-blur p-3 flex items-start gap-3 transition-all hover:bg-card hover:border-border ${
                    n.read ? "border-border/30 opacity-70" : "border-primary/40 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.6)]"
                  }`}
                  data-testid={`notification-row-${n.id}`}
                >
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
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
