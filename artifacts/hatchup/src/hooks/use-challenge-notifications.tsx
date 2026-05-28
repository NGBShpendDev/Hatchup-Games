import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetMyChallengeInvites,
  getGetMyChallengeInvitesQueryKey,
  useListChallenges,
  getListChallengesQueryKey,
  useListPendingBattleRematches,
  getListPendingBattleRematchesQueryKey,
  useUpsertNotification,
  getListNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type ChallengeListItem,
  type ChallengeInvite,
} from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "./use-toast";
import { ToastAction } from "@/components/ui/toast";

const INVITE_POLL_MS = 30_000;
const CHALLENGE_POLL_MS = 60_000;
const ENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

const SEEN_INVITES_KEY = "hatchup:seen-invite-ids";
const SEEN_ENDING_KEY = "hatchup:seen-ending-challenge-ids";
const SEEN_COMPLETED_KEY = "hatchup:seen-completed-challenge-ids";

function readSeen(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSeen(key: string, set: Set<number>) {
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function usePendingInviteCount(): number {
  const { data } = useGetMyChallengeInvites({
    query: {
      queryKey: getGetMyChallengeInvitesQueryKey(),
      refetchInterval: INVITE_POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
  return data?.length ?? 0;
}

export function usePendingRematchInviteCount(): number {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const { data } = useListPendingBattleRematches({
    query: {
      queryKey: getListPendingBattleRematchesQueryKey(),
      enabled: !!pid,
      refetchInterval: INVITE_POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
  if (!data || !pid) return 0;
  return data.filter((inv) => inv.toPlayerId === pid).length;
}

export function useChallengeNotifications() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const upsertNotification = useUpsertNotification();

  const writeInbox = (params: {
    type: "challenge_invite" | "challenge_ending" | "challenge_complete";
    title: string;
    body: string;
    link: string;
    sourceId: number;
  }) => {
    upsertNotification.mutate(
      { data: params },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
          qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 20 }) });
          qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 50 }) });
        },
      },
    );
  };

  const { data: invites } = useGetMyChallengeInvites({
    query: {
      queryKey: getGetMyChallengeInvitesQueryKey(),
      refetchInterval: INVITE_POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });

  const myChallengesParams = { tab: "my" as const };
  const { data: myChallenges } = useListChallenges(myChallengesParams, {
    query: {
      queryKey: getListChallengesQueryKey(myChallengesParams),
      refetchInterval: CHALLENGE_POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  });

  const firstInvitePassRef = useRef(true);
  useEffect(() => {
    if (!invites) return;
    const seen = readSeen(SEEN_INVITES_KEY);

    if (firstInvitePassRef.current) {
      firstInvitePassRef.current = false;
      for (const inv of invites) seen.add(inv.id);
      writeSeen(SEEN_INVITES_KEY, seen);
      return;
    }

    const fresh = invites.filter((inv: ChallengeInvite) => !seen.has(inv.id));
    if (fresh.length === 0) return;

    const latest = fresh[0]!;
    const challengeTitle =
      (latest.challenge as { title?: string } | undefined)?.title ?? "a challenge";
    const more = fresh.length > 1 ? ` (+${fresh.length - 1} more)` : "";

    // Also invalidate the inbox — the server inserts a `challenge_invite`
    // notification when the invite is created, so the bell should refresh.
    qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
    qc.invalidateQueries({ queryKey: getListNotificationsQueryKey({ limit: 20 }) });

    toast({
      title: "New challenge invite",
      description: `You were invited to ${challengeTitle}${more}.`,
      action: (
        <ToastAction altText="View invites" onClick={() => navigate("/challenges")}>
          View
        </ToastAction>
      ),
    });

    for (const inv of fresh) seen.add(inv.id);
    writeSeen(SEEN_INVITES_KEY, seen);
  }, [invites, navigate, toast]);

  const firstChallengePassRef = useRef(true);
  useEffect(() => {
    if (!myChallenges) return;
    const endingSeen = readSeen(SEEN_ENDING_KEY);
    const completedSeen = readSeen(SEEN_COMPLETED_KEY);

    const now = Date.now();
    const isFirst = firstChallengePassRef.current;
    firstChallengePassRef.current = false;

    for (const c of myChallenges as ChallengeListItem[]) {
      if (!c.isJoined) continue;
      const end = new Date(c.endAt).getTime();

      if (c.status === "completed" || (Number.isFinite(end) && end <= now && c.status !== "active")) {
        if (completedSeen.has(c.id)) continue;
        completedSeen.add(c.id);
        writeInbox({
          type: "challenge_complete",
          title: "Challenge complete!",
          body: `"${c.title}" wrapped up — tap to see your final rank.`,
          link: `/challenges/${c.id}`,
          sourceId: c.id,
        });
        if (!isFirst) {
          toast({
            title: "Challenge complete!",
            description: `"${c.title}" wrapped up — tap to see your final rank.`,
            action: (
              <ToastAction altText="See results" onClick={() => navigate(`/challenges/${c.id}`)}>
                Results
              </ToastAction>
            ),
          });
        }
        continue;
      }

      if (c.status === "active" && Number.isFinite(end)) {
        const msLeft = end - now;
        if (msLeft > 0 && msLeft <= ENDING_WINDOW_MS) {
          if (endingSeen.has(c.id)) continue;
          endingSeen.add(c.id);
          const hoursLeft = Math.max(1, Math.round(msLeft / 3_600_000));
          writeInbox({
            type: "challenge_ending",
            title: "Challenge ending soon",
            body: `"${c.title}" ends in ~${hoursLeft}h. Push for the podium!`,
            link: `/challenges/${c.id}`,
            sourceId: c.id,
          });
          if (!isFirst) {
            toast({
              title: "Challenge ending soon",
              description: `"${c.title}" ends in ~${hoursLeft}h. Push for the podium!`,
              action: (
                <ToastAction altText="Open challenge" onClick={() => navigate(`/challenges/${c.id}`)}>
                  Open
                </ToastAction>
              ),
            });
          }
        }
      }
    }

    writeSeen(SEEN_ENDING_KEY, endingSeen);
    writeSeen(SEEN_COMPLETED_KEY, completedSeen);
  }, [myChallenges, navigate, toast]);
}
