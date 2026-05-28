import { Link, useLocation } from "wouter";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import {
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
  useListNotifications,
  getListNotificationsQueryKey,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

const POLL_MS = 30_000;

export function NotificationsBell() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: countData } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
  const unread = countData?.count ?? 0;

  const { data: notifications } = useListNotifications(
    { limit: 20 },
    {
      query: {
        queryKey: getListNotificationsQueryKey({ limit: 20 }),
        refetchInterval: POLL_MS,
        refetchOnWindowFocus: true,
        staleTime: 10_000,
      },
    },
  );

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 20 }) });
  };

  const handleOpen = (n: Notification) => {
    if (!n.read) {
      markRead.mutate({ id: n.id }, { onSuccess: refresh });
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = () => {
    markAllRead.mutate(undefined, { onSuccess: refresh });
  };

  const items = notifications ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative w-8 h-8 rounded-full bg-card/60 backdrop-blur border border-border/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
          aria-label="Notifications"
          data-testid="button-notifications-bell"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-black flex items-center justify-center border-2 border-card shadow-[0_0_8px_rgba(var(--primary),0.8)] animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0 bg-card/95 backdrop-blur-xl border-border/50"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <span className="text-sm font-bold uppercase tracking-wider">Notifications</span>
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3 h-3" /> Mark all
            </button>
          )}
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            items.map((n: Notification) => (
              <button
                key={n.id}
                onClick={() => handleOpen(n)}
                className={`w-full text-left px-3 py-3 border-b border-border/20 hover:bg-card/80 transition-colors ${
                  n.read ? "opacity-60" : ""
                }`}
                data-testid={`notification-item-${n.id}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0 shadow-[0_0_6px_rgba(var(--primary),0.8)]" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-snug">{n.title}</div>
                    {n.body && (
                      <div className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {n.body}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                      {formatRelative(n.createdAt)}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-border/40">
          <Link href="/notifications">
            <button
              className="w-full px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-card/80 transition-colors inline-flex items-center justify-center gap-1"
              data-testid="link-view-all-notifications"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
