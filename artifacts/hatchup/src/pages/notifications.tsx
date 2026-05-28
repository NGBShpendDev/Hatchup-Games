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
  useGetMyChallengeInvites,
  getGetMyChallengeInvitesQueryKey,
  type Notification,
  type ChallengeInvite,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Bell, CheckCheck, Mail, Trophy, Clock, Sparkles, Users, Swords, Check, X, Loader2, ShieldAlert, ShieldCheck, BadgeCheck, Apple, Crown, Medal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePlayer } from "@/lib/playerContext";

type CategoryFilter = "all" | "moderation" | "recaps" | "tournaments" | "clubs" | "artifacts";

const CATEGORY_FILTER_VALUES: readonly CategoryFilter[] = [
  "all",
  "moderation",
  "recaps",
  "tournaments",
  "clubs",
  "artifacts",
] as const;

function inboxPrefsStorageKey(playerId: number | null): string | null {
  if (playerId == null) return null;
  return `hatchup:notifications:prefs:${playerId}`;
}

type StoredInboxPrefs = {
  categoryFilter: CategoryFilter;
  unreadOnly: boolean;
};

function readStoredInboxPrefs(playerId: number | null): StoredInboxPrefs | null {
  const key = inboxPrefsStorageKey(playerId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredInboxPrefs>;
    const categoryFilter = CATEGORY_FILTER_VALUES.includes(parsed.categoryFilter as CategoryFilter)
      ? (parsed.categoryFilter as CategoryFilter)
      : "all";
    const unreadOnly = typeof parsed.unreadOnly === "boolean" ? parsed.unreadOnly : false;
    return { categoryFilter, unreadOnly };
  } catch {
    return null;
  }
}

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
  account_suspended:  { icon: ShieldAlert, color: "from-red-600 to-rose-700" },
  account_restored:   { icon: ShieldCheck, color: "from-emerald-500 to-green-600" },
  account_verified:   { icon: BadgeCheck,  color: "from-sky-500 to-cyan-500" },
  nutrition_recap:    { icon: Apple,       color: "from-lime-500 to-emerald-500" },
  tournament_advanced:  { icon: Medal,  color: "from-yellow-500 to-amber-500" },
  tournament_eliminated:{ icon: Swords, color: "from-zinc-500 to-slate-600" },
  tournament_champion:  { icon: Crown,  color: "from-amber-400 to-yellow-500" },
};

function iconFor(type: string) {
  return TYPE_META[type] ?? { icon: Bell, color: "from-primary to-accent" };
}

type CategoryKey = "moderation" | "recaps" | "tournaments" | "clubs" | "artifacts";

const CATEGORY_TYPES: Record<CategoryKey, readonly string[]> = {
  moderation: ["account_suspended", "account_restored", "account_verified"],
  recaps: ["nutrition_recap"],
  tournaments: ["tournament_advanced", "tournament_eliminated", "tournament_champion"],
  clubs: ["club_mention", "club_invite"],
  artifacts: ["artifact_unlock"],
};

function categoryOf(type: string): CategoryKey | null {
  for (const [cat, types] of Object.entries(CATEGORY_TYPES) as [CategoryKey, readonly string[]][]) {
    if (types.includes(type)) return cat;
  }
  return null;
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

type BusyKey = string;

export default function NotificationsPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<{ key: BusyKey; action: "accept" | "decline" } | null>(null);
  const [tab, setTab] = useState<"all" | "invites">("all");
  const [inviteFilter, setInviteFilter] = useState<"all" | "challenge" | "rematch" | "club">("all");
  const { playerId } = usePlayer();
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [prefsHydratedFor, setPrefsHydratedFor] = useState<number | null>(null);

  // Hydrate from localStorage once we know which player is viewing. Defaults
  // ("All" + unread off) stay in place for first-time users.
  useEffect(() => {
    if (playerId == null) return;
    if (prefsHydratedFor === playerId) return;
    const stored = readStoredInboxPrefs(playerId);
    if (stored) {
      setCategoryFilter(stored.categoryFilter);
      setUnreadOnly(stored.unreadOnly);
    } else {
      setCategoryFilter("all");
      setUnreadOnly(false);
    }
    setPrefsHydratedFor(playerId);
  }, [playerId, prefsHydratedFor]);

  // Persist after hydration so we never overwrite stored prefs with defaults.
  useEffect(() => {
    if (playerId == null) return;
    if (prefsHydratedFor !== playerId) return;
    const key = inboxPrefsStorageKey(playerId);
    if (!key || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ categoryFilter, unreadOnly }),
      );
    } catch {
      // Ignore quota/serialization errors — prefs are best-effort.
    }
  }, [playerId, prefsHydratedFor, categoryFilter, unreadOnly]);

  const listParams = unreadOnly ? { limit: 50, unread: true } : { limit: 50 };
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
  const { data: challengeInvitesData, isLoading: isLoadingInvites } = useGetMyChallengeInvites({
    query: {
      queryKey: getGetMyChallengeInvitesQueryKey(),
      refetchInterval: POLL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
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
    qc.invalidateQueries({ queryKey: getGetMyChallengeInvitesQueryKey() });
  };

  const open = (n: Notification) => {
    if (!n.read) markRead.mutate({ id: n.id }, { onSuccess: refresh });
    if (n.link) navigate(n.link);
  };

  const markAll = () => {
    markAllRead.mutate(undefined, { onSuccess: refresh });
  };

  const acceptRematch = async (n: Notification, inviteId: string) => {
    setBusy({ key: `n-${n.id}`, action: "accept" });
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
      setBusy(null);
    }
  };

  const respondToChallengeInviteByNotification = async (
    n: Notification,
    inviteId: number,
    status: "accepted" | "declined",
  ) => {
    setBusy({ key: `n-${n.id}`, action: status === "accepted" ? "accept" : "decline" });
    try {
      await respondToInviteRequest(inviteId, status);
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
      setBusy(null);
    }
  };

  const respondToChallengeInviteRaw = async (
    invite: ChallengeInvite,
    status: "accepted" | "declined",
  ) => {
    setBusy({ key: `c-${invite.id}`, action: status === "accepted" ? "accept" : "decline" });
    try {
      await respondToInviteRequest(invite.id, status);
      refresh();
      if (status === "accepted") {
        toast({ title: "Challenge accepted", description: "You're in. Good luck!" });
        navigate(`/challenges/${invite.challengeId}`);
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
      setBusy(null);
    }
  };

  const respondToClubInvite = async (
    n: Notification,
    inviteId: number,
    status: "accepted" | "declined",
  ) => {
    setBusy({ key: `n-${n.id}`, action: status === "accepted" ? "accept" : "decline" });
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
      setBusy(null);
    }
  };

  const dismissNotification = async (n: Notification) => {
    setBusy({ key: `n-${n.id}`, action: "decline" });
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
      setBusy(null);
    }
  };

  const declineRematch = async (n: Notification, inviteId: string) => {
    setBusy({ key: `n-${n.id}`, action: "decline" });
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
      setBusy(null);
    }
  };

  const items = data ?? [];
  const unread = countData?.count ?? 0;
  const challengeInvites = challengeInvitesData ?? [];

  const pendingRematchNotifs = useMemo(
    () => items.filter(isPendingRematchInvite),
    [items],
  );

  const pendingClubInviteNotifs = useMemo(
    () => items.filter((n) => n.type === "club_invite" && !n.read && clubInviteId(n) !== null),
    [items],
  );

  // Build the unified Invites list. Challenge invites come from the dedicated
  // endpoint (source of truth for pending status). Rematch and club invites
  // only live as notifications today, so we surface those filtered.
  type InviteRow =
    | { kind: "challenge"; invite: ChallengeInvite; sortKey: number }
    | { kind: "rematch"; notification: Notification; rematchId: string; sortKey: number }
    | { kind: "club"; notification: Notification; sortKey: number };

  const inviteRows: InviteRow[] = useMemo(() => {
    const rows: InviteRow[] = [];
    for (const inv of challengeInvites) {
      rows.push({
        kind: "challenge",
        invite: inv,
        sortKey: new Date(inv.sentAt).getTime(),
      });
    }
    for (const n of pendingRematchNotifs) {
      const rematchId = extractRematchId(n.link);
      if (!rematchId) continue;
      rows.push({
        kind: "rematch",
        notification: n,
        rematchId,
        sortKey: new Date(n.createdAt).getTime(),
      });
    }
    for (const n of pendingClubInviteNotifs) {
      rows.push({
        kind: "club",
        notification: n,
        sortKey: new Date(n.createdAt).getTime(),
      });
    }
    rows.sort((a, b) => b.sortKey - a.sortKey);
    return rows;
  }, [challengeInvites, pendingRematchNotifs, pendingClubInviteNotifs]);

  const inviteCounts = useMemo(
    () => ({
      all: inviteRows.length,
      challenge: inviteRows.filter((r) => r.kind === "challenge").length,
      rematch: inviteRows.filter((r) => r.kind === "rematch").length,
      club: inviteRows.filter((r) => r.kind === "club").length,
    }),
    [inviteRows],
  );

  const inviteCount = inviteCounts.all;

  const filteredInviteRows = useMemo(() => {
    if (inviteFilter === "all") return inviteRows;
    return inviteRows.filter((r) => r.kind === inviteFilter);
  }, [inviteRows, inviteFilter]);

  const showClubChip = inviteCounts.club > 0 || inviteFilter === "club";

  const categoryCounts = useMemo(() => {
    const counts: Record<"all" | CategoryKey, number> = {
      all: items.length,
      moderation: 0,
      recaps: 0,
      tournaments: 0,
      clubs: 0,
      artifacts: 0,
    };
    for (const n of items) {
      const cat = categoryOf(n.type);
      if (cat) counts[cat] += 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (categoryFilter === "all") return items;
    const allowed = CATEGORY_TYPES[categoryFilter];
    return items.filter((n) => allowed.includes(n.type));
  }, [items, categoryFilter]);

  const renderNotificationRow = (n: Notification, idx: number) => {
    const meta = iconFor(n.type);
    const Icon = meta.icon;
    const rematchId = isPendingRematchInvite(n) ? extractRematchId(n.link) : null;
    const challengeId = challengeInviteId(n);
    const clubInvId = !n.read ? clubInviteId(n) : null;
    const clubMention = isClubMention(n) && !n.read ? n : null;
    const hasInlineActions = Boolean(rematchId || challengeId || clubInvId || clubMention);
    const rowBusy = busy?.key === `n-${n.id}` ? busy.action : null;
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
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  acceptRematch(n, rematchId);
                }}
                data-testid={`button-accept-rematch-${n.id}`}
              >
                {rowBusy === "accept"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 gap-1"
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  declineRematch(n, rematchId);
                }}
                data-testid={`button-decline-rematch-${n.id}`}
              >
                {rowBusy === "decline"
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
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  respondToChallengeInviteByNotification(n, challengeId, "accepted");
                }}
                data-testid={`button-accept-challenge-${n.id}`}
              >
                {rowBusy === "accept"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 gap-1"
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  respondToChallengeInviteByNotification(n, challengeId, "declined");
                }}
                data-testid={`button-decline-challenge-${n.id}`}
              >
                {rowBusy === "decline"
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
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  respondToClubInvite(n, clubInvId, "accepted");
                }}
                data-testid={`button-accept-club-invite-${n.id}`}
              >
                {rowBusy === "accept"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Check className="w-3.5 h-3.5" />}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 gap-1"
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  respondToClubInvite(n, clubInvId, "declined");
                }}
                data-testid={`button-decline-club-invite-${n.id}`}
              >
                {rowBusy === "decline"
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
                  disabled={rowBusy !== null}
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
                disabled={rowBusy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNotification(n);
                }}
                data-testid={`button-dismiss-club-${n.id}`}
              >
                {rowBusy === "decline"
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <X className="w-3.5 h-3.5" />}
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </>
    );

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
  };

  const renderChallengeInviteRow = (invite: ChallengeInvite, idx: number) => {
    const meta = iconFor("challenge_invite");
    const Icon = meta.icon;
    const rowBusy = busy?.key === `c-${invite.id}` ? busy.action : null;
    const challenge = invite.challenge as { title?: string; description?: string } | undefined;
    const challengeTitle = (challenge?.title as string | undefined) ?? "this challenge";
    const inviter = invite.inviter as { displayName?: string | null; avatarUrl?: string | null } | undefined | null;
    const inviterName = inviter?.displayName?.trim() || "Someone";
    const title = `${inviterName} invited you to ${challengeTitle}`;
    const body = (challenge?.description as string | undefined) ?? "Tap to view this challenge.";
    return (
      <motion.div
        key={`invite-challenge-${invite.id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: Math.min(idx * 0.02, 0.2) }}
        onClick={() => navigate(`/challenges/${invite.challengeId}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigate(`/challenges/${invite.challengeId}`);
          }
        }}
        className="w-full text-left rounded-xl border border-primary/40 bg-card/60 backdrop-blur p-3 flex items-start gap-3 transition-all hover:bg-card hover:border-border shadow-[0_0_12px_-4px_hsl(var(--primary)/0.6)] cursor-pointer"
        data-testid={`invite-row-challenge-${invite.id}`}
      >
        <div className={`shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-white shadow-md`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold leading-tight flex-1 truncate">{title}</span>
            <span className="w-2 h-2 rounded-full bg-primary shrink-0 shadow-[0_0_6px_rgba(var(--primary),0.8)]" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{body}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-1">
            {formatRelative(invite.sentAt)}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              className="h-7 px-2.5 gap-1 bg-gradient-to-br from-pink-500 to-rose-500 hover:from-pink-500/90 hover:to-rose-500/90"
              disabled={rowBusy !== null}
              onClick={(e) => {
                e.stopPropagation();
                respondToChallengeInviteRaw(invite, "accepted");
              }}
              data-testid={`button-accept-challenge-invite-${invite.id}`}
            >
              {rowBusy === "accept"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 gap-1"
              disabled={rowBusy !== null}
              onClick={(e) => {
                e.stopPropagation();
                respondToChallengeInviteRaw(invite, "declined");
              }}
              data-testid={`button-decline-challenge-invite-${invite.id}`}
            >
              {rowBusy === "decline"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <X className="w-3.5 h-3.5" />}
              Decline
            </Button>
          </div>
        </div>
      </motion.div>
    );
  };

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

        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "invites")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="invites" data-testid="tab-invites" className="gap-2">
              Invites
              {inviteCount > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none"
                  data-testid="invite-tab-badge"
                >
                  {inviteCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2" data-testid="category-filter-row">
                <div className="flex flex-wrap gap-2 flex-1" data-testid="category-filter-chips">
                  {([
                    { value: "all", label: "All", count: categoryCounts.all },
                    { value: "moderation", label: "Moderation", count: categoryCounts.moderation },
                    { value: "recaps", label: "Recaps", count: categoryCounts.recaps },
                    { value: "tournaments", label: "Tournaments", count: categoryCounts.tournaments },
                    { value: "clubs", label: "Clubs", count: categoryCounts.clubs },
                    { value: "artifacts", label: "Artifacts", count: categoryCounts.artifacts },
                  ] as const).map((chip) => {
                    const active = categoryFilter === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setCategoryFilter(chip.value)}
                        className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-bold transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_-2px_hsl(var(--primary)/0.7)]"
                            : "bg-card/60 backdrop-blur border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                        data-testid={`chip-category-filter-${chip.value}`}
                        aria-pressed={active}
                      >
                        <span>{chip.label}</span>
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] leading-none ${
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-border/60 text-foreground/80"
                          }`}
                          data-testid={`chip-category-filter-${chip.value}-count`}
                        >
                          {chip.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setUnreadOnly((v) => !v)}
                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-bold transition-colors ${
                    unreadOnly
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_-2px_hsl(var(--primary)/0.7)]"
                      : "bg-card/60 backdrop-blur border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                  data-testid="toggle-unread-only"
                  aria-pressed={unreadOnly}
                >
                  <Mail className="w-3.5 h-3.5" />
                  Unread only
                </button>
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
                  <p className="text-sm font-bold">
                    {unreadOnly ? "No unread notifications" : "Nothing here yet"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {unreadOnly
                      ? "You're all caught up."
                      : "Challenge invites, alerts, and results will show up here."}
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12" data-testid="category-filter-empty">
                  <div className="mx-auto w-14 h-14 rounded-full bg-card border border-border/40 flex items-center justify-center mb-3">
                    <Bell className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-bold">Nothing in this category</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Try another category to see your notifications.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((n: Notification, idx: number) => renderNotificationRow(n, idx))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invites">
            {isLoading || isLoadingInvites ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : inviteRows.length === 0 ? (
              <div className="text-center py-16" data-testid="invites-empty">
                <div className="mx-auto w-14 h-14 rounded-full bg-card border border-border/40 flex items-center justify-center mb-3">
                  <Mail className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold">No pending invites</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Challenge and rematch invites will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2" data-testid="invite-filter-chips">
                  {([
                    { value: "all", label: "All", count: inviteCounts.all },
                    { value: "challenge", label: "Challenges", count: inviteCounts.challenge },
                    { value: "rematch", label: "Rematches", count: inviteCounts.rematch },
                    ...(showClubChip
                      ? [{ value: "club" as const, label: "Clubs", count: inviteCounts.club }]
                      : []),
                  ] as const).map((chip) => {
                    const active = inviteFilter === chip.value;
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        onClick={() => setInviteFilter(chip.value)}
                        className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-xs font-bold transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary shadow-[0_0_10px_-2px_hsl(var(--primary)/0.7)]"
                            : "bg-card/60 backdrop-blur border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                        data-testid={`chip-invite-filter-${chip.value}`}
                        aria-pressed={active}
                      >
                        <span>{chip.label}</span>
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] leading-none ${
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-border/60 text-foreground/80"
                          }`}
                          data-testid={`chip-invite-filter-${chip.value}-count`}
                        >
                          {chip.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {filteredInviteRows.length === 0 ? (
                  <div className="text-center py-12" data-testid="invites-filter-empty">
                    <div className="mx-auto w-14 h-14 rounded-full bg-card border border-border/40 flex items-center justify-center mb-3">
                      <Mail className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-bold">No invites in this filter</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try another category to see pending invites.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredInviteRows.map((row, idx) =>
                      row.kind === "challenge"
                        ? renderChallengeInviteRow(row.invite, idx)
                        : renderNotificationRow(row.notification, idx),
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

async function respondToInviteRequest(inviteId: number, status: "accepted" | "declined") {
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
}
