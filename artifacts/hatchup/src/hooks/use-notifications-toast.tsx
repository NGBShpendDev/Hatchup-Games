import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useToast } from "./use-toast";
import { ToastAction } from "@/components/ui/toast";

const POLL_MS = 30_000;
const SEEN_KEY = "hatchup:seen-notification-ids";
const MAX_TOASTS_PER_PASS = 1;

function readSeen(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSeen(set: Set<number>) {
  try {
    const arr = Array.from(set).slice(-500);
    localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function useNotificationsToast() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

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

  const firstPassRef = useRef(true);

  useEffect(() => {
    if (!notifications) return;
    const seen = readSeen();

    if (firstPassRef.current) {
      firstPassRef.current = false;
      for (const n of notifications as Notification[]) seen.add(n.id);
      writeSeen(seen);
      return;
    }

    const fresh = (notifications as Notification[]).filter(
      (n) => !seen.has(n.id) && !n.read,
    );
    if (fresh.length === 0) return;

    const toToast = fresh.slice(0, MAX_TOASTS_PER_PASS);
    const extra = fresh.length - toToast.length;

    for (const n of toToast) {
      const description =
        extra > 0
          ? `${n.body ?? ""}${n.body ? " " : ""}(+${extra} more)`
          : n.body ?? undefined;
      toast({
        title: n.title,
        description,
        action: n.link ? (
          <ToastAction
            altText="Open"
            onClick={() => navigate(n.link as string)}
          >
            Open
          </ToastAction>
        ) : undefined,
      });
    }

    for (const n of fresh) seen.add(n.id);
    writeSeen(seen);
  }, [notifications, navigate, toast]);
}
