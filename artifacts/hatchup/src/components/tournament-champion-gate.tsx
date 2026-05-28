import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  getListNotificationsQueryKey,
  useGetChallenge,
  getGetChallengeQueryKey,
  useMarkNotificationRead,
  getGetUnreadNotificationCountQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { ChampionVictoryOverlay } from "@/components/champion-victory-overlay";

const SUPPRESSED_KEY = "hatchup:champion-overlay-suppressed-ids";

function readSuppressed(): Set<number> {
  try {
    const raw = localStorage.getItem(SUPPRESSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSuppressed(set: Set<number>) {
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(SUPPRESSED_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/**
 * Globally listens for the latest unread `tournament_champion` notification
 * and triggers the celebratory full-screen overlay on the player's next app
 * visit. Dismissing the overlay marks the notification as read so it won't
 * fire again. A local suppressed-id list guards against re-firing the
 * overlay while the mark-read mutation is in flight.
 *
 * Shares the same `{ limit: 20 }` notifications query as
 * `useNotificationsToast` so we don't double-poll the server.
 */
export function TournamentChampionGate() {
  const qc = useQueryClient();
  const listParams = { limit: 20 } as const;

  const { data: notifications } = useListNotifications(listParams, {
    query: {
      queryKey: getListNotificationsQueryKey(listParams),
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });

  const markRead = useMarkNotificationRead();

  const [suppressed, setSuppressed] = useState<Set<number>>(() => readSuppressed());

  const championNotif = useMemo<Notification | null>(() => {
    if (!notifications) return null;
    const list = notifications as Notification[];
    const unread = list.filter(
      (n) =>
        n.type === "tournament_champion" &&
        !n.read &&
        !suppressed.has(n.id) &&
        typeof n.sourceId === "number",
    );
    if (unread.length === 0) return null;
    // Newest first — celebrate the most recent win.
    unread.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return unread[0];
  }, [notifications, suppressed]);

  const challengeId = championNotif?.sourceId ?? null;

  const { data: challenge } = useGetChallenge(challengeId ?? 0, {
    query: {
      queryKey: getGetChallengeQueryKey(challengeId ?? 0),
      enabled: challengeId != null,
      staleTime: 60_000,
    },
  });

  // Reset stored suppressions opportunistically when their notifications are
  // gone from the visible list (e.g. marked read elsewhere). Keeps the set
  // from growing forever.
  useEffect(() => {
    if (!notifications) return;
    const visibleIds = new Set((notifications as Notification[]).map((n) => n.id));
    let changed = false;
    const next = new Set<number>();
    for (const id of suppressed) {
      if (visibleIds.has(id)) {
        next.add(id);
      } else {
        changed = true;
      }
    }
    if (changed) {
      setSuppressed(next);
      writeSuppressed(next);
    }
  }, [notifications, suppressed]);

  if (!championNotif) return null;

  const show = championNotif != null && challenge != null;

  const handleDismiss = () => {
    const id = championNotif.id;
    // Hide immediately so the overlay tears down before the mutation lands.
    const next = new Set(suppressed);
    next.add(id);
    setSuppressed(next);
    writeSuppressed(next);

    markRead.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListNotificationsQueryKey(listParams) });
          qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
        },
      },
    );
  };

  const rewardXp = (challenge as { rewardXp?: number } | undefined)?.rewardXp ?? 0;
  const rewardCoins = (challenge as { rewardCoins?: number } | undefined)?.rewardCoins ?? 0;
  const challengeTitle =
    (challenge as { title?: string } | undefined)?.title ?? championNotif.title;

  return (
    <ChampionVictoryOverlay
      show={show}
      challengeTitle={challengeTitle}
      boostedXp={rewardXp * 2}
      boostedCoins={rewardCoins * 2}
      onDismiss={handleDismiss}
    />
  );
}
