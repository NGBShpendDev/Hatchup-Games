import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Layout } from "@/components/layout";
import {
  useGetClub,
  getGetClubQueryKey,
  useListClubMembers,
  getListClubMembersQueryKey,
  useInviteToClub,
  useSearchPlayers,
  getSearchPlayersQueryKey,
  type PlayerStub,
  useListClubPendingInvites,
  getListClubPendingInvitesQueryKey,
  useCancelClubInvite,
  useUpdateClubMemberRole,
  useLeaveClub,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowDown, ArrowUp, Check, Crown, LogOut, Mail, Search, Shield, ShieldCheck, Trophy, UserPlus, Users, X } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

function roleStyle(role: string | null | undefined) {
  if (role === "owner") {
    return {
      icon: <Crown className="w-3.5 h-3.5" />,
      label: "Owner",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    };
  }
  if (role === "officer") {
    return {
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      label: "Officer",
      className: "bg-blue-500/15 text-blue-400 border-blue-500/40",
    };
  }
  return null;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function ClubDetail() {
  const [, params] = useRoute("/clubs/:id");
  const id = Number(params?.id);
  const { player } = usePlayer();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [invitedIds, setInvitedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(inviteSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [inviteSearch]);

  const { data: club, isLoading: clubLoading } = useGetClub(id, {
    query: { queryKey: getGetClubQueryKey(id), enabled: Number.isFinite(id) },
  });
  const { data: members, isLoading: membersLoading } = useListClubMembers(id, {
    query: { queryKey: getListClubMembersQueryKey(id), enabled: Number.isFinite(id) },
  });

  const searchParams = { q: debouncedSearch, limit: 20 };
  const { data: searchResults, isLoading: searchLoading, isFetching: searchFetching } = useSearchPlayers(
    searchParams,
    {
      query: {
        queryKey: getSearchPlayersQueryKey(searchParams),
        enabled: inviteOpen && debouncedSearch.length > 0,
      },
    }
  );

  const inviteMutation = useInviteToClub({
    mutation: {
      onSuccess: (_, vars) => {
        setInvitedIds((prev) => new Set(prev).add(vars.data.inviteeId));
        toast({ title: "Invite sent!", description: "They'll see it on their invites." });
        queryClient.invalidateQueries({ queryKey: getListClubMembersQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListClubPendingInvitesQueryKey(id) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({
          title: "Could not invite",
          description: err?.response?.data?.error ?? "Try again",
          variant: "destructive",
        });
      },
    },
  });

  // Pending invites — only loads if the viewer is an admin/leader/officer.
  // The endpoint returns 403 for everyone else, which we treat as "hide section".
  const {
    data: pendingInvites,
    isError: pendingError,
  } = useListClubPendingInvites(id, {
    query: {
      queryKey: getListClubPendingInvitesQueryKey(id),
      enabled: Number.isFinite(id),
      retry: false,
    },
  });

  const leaveMutation = useLeaveClub({
    mutation: {
      onSuccess: () => {
        toast({ title: "Left club", description: "You're no longer a member of this club." });
        queryClient.invalidateQueries({ queryKey: getGetClubQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getListClubMembersQueryKey(id) });
        setLeaveOpen(false);
        navigate("/club");
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({
          title: "Could not leave club",
          description: err?.response?.data?.error ?? "Try again",
          variant: "destructive",
        });
        setLeaveOpen(false);
      },
    },
  });

  const cancelInvite = useCancelClubInvite({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClubPendingInvitesQueryKey(id) });
      },
    },
  });

  const isAdmin = !pendingError && Array.isArray(pendingInvites);

  const sortedMembers = [...(members ?? [])].sort((a, b) => {
    const rank = (r: string | null | undefined) => (r === "owner" ? 0 : r === "officer" ? 1 : 2);
    const diff = rank(a.clubRole) - rank(b.clubRole);
    if (diff !== 0) return diff;
    return b.level - a.level;
  });

  const myMembership = player ? (members ?? []).find((m) => m.id === player.id) : null;
  const canInvite = myMembership?.clubRole === "owner" || myMembership?.clubRole === "officer";
  const isMember = !!myMembership;
  const isOwner = myMembership?.clubRole === "owner";

  const updateRole = useUpdateClubMemberRole({
    mutation: {
      onSuccess: (_, vars) => {
        const nextRole = vars.data.clubRole;
        toast({
          title:
            nextRole === "owner"
              ? "Ownership transferred"
              : nextRole === "officer"
              ? "Promoted to officer"
              : "Demoted to member",
        });
        queryClient.invalidateQueries({ queryKey: getListClubMembersQueryKey(id) });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast({
          title: "Could not update role",
          description: err?.response?.data?.error ?? "Try again",
          variant: "destructive",
        });
      },
    },
  });

  const memberIds = new Set((members ?? []).map((m) => m.id));
  const inviteResults: PlayerStub[] = (searchResults ?? []).filter(
    (p) => p.id !== player?.id && !memberIds.has(p.id)
  );
  const hasTypedQuery = inviteSearch.trim().length > 0;
  const searchIsLoading = (searchLoading || searchFetching) && debouncedSearch.length > 0;
  const queryStillDebouncing = hasTypedQuery && debouncedSearch !== inviteSearch.trim();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <Link href="/club">
          <a className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Club Hub
          </a>
        </Link>

        {clubLoading || !club ? (
          <Skeleton className="h-40 w-full rounded-3xl" />
        ) : (
          <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-8 h-8 text-primary" />
                  <h1 className="text-4xl font-black tracking-tight">{club.name}</h1>
                  <Badge variant="secondary" className="font-bold uppercase">{club.rank}</Badge>
                </div>
                <p className="text-muted-foreground font-medium max-w-2xl">{club.description}</p>
              </div>
              <div className="flex gap-6 items-center">
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center text-blue-500 font-bold">
                    <Users className="w-4 h-4" />
                    <span className="text-2xl">{club.memberCount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Members</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2 justify-center text-green-500 font-bold">
                    <Trophy className="w-4 h-4" />
                    <span className="text-2xl">{club.totalXp.toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-bold uppercase tracking-wide">Total XP</div>
                </div>
                {isMember && (
                  <Button
                    variant="outline"
                    onClick={() => setLeaveOpen(true)}
                    disabled={isOwner}
                    title={isOwner ? "Transfer ownership before leaving" : undefined}
                    className="font-bold gap-2 border-2 hover:border-destructive hover:text-destructive"
                    data-testid="button-leave-club"
                  >
                    <LogOut className="w-4 h-4" /> Leave Club
                  </Button>
                )}
              </div>
            </div>
            {isOwner && (
              <p className="text-xs text-muted-foreground font-medium mt-4">
                As the owner, you must transfer ownership before you can leave this club.
              </p>
            )}
          </div>
        )}

        <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {club?.name ?? "this club"}?</AlertDialogTitle>
              <AlertDialogDescription>
                You'll lose access to club chat, events, and the club leaderboard. You can join another club or come back later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={leaveMutation.isPending}>Stay</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  leaveMutation.mutate({ id });
                }}
                disabled={leaveMutation.isPending}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                data-testid="button-confirm-leave-club"
              >
                {leaveMutation.isPending ? "Leaving…" : "Leave Club"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isAdmin && (
          <div>
            <h2 className="text-2xl font-black tracking-tight mb-4 flex items-center gap-2">
              <Mail className="w-6 h-6 text-primary" /> Pending Invites
              {pendingInvites && pendingInvites.length > 0 && (
                <Badge variant="secondary" className="font-bold">{pendingInvites.length}</Badge>
              )}
            </h2>

            {pendingInvites && pendingInvites.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground font-medium">
                  No pending invites. Invite players to grow your club.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingInvites?.map((inv) => {
                  const name = inv.inviteeName;
                  const sent = (() => {
                    try {
                      return formatDistanceToNow(new Date(inv.sentAt), { addSuffix: true });
                    } catch {
                      return "recently";
                    }
                  })();
                  const isCancelling =
                    cancelInvite.isPending && cancelInvite.variables?.id === inv.id;
                  return (
                    <Card key={inv.id} className="border-2">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Avatar className="h-12 w-12 border-2 border-border">
                          {inv.inviteeAvatar && <AvatarImage src={inv.inviteeAvatar} alt={name} />}
                          <AvatarFallback className="font-bold">{initials(name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold truncate">{name}</div>
                          <div className="text-xs text-muted-foreground font-bold mt-1">
                            Invited {sent}
                            {inv.inviterName ? ` by ${inv.inviterName}` : ""}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isCancelling}
                          onClick={() => cancelInvite.mutate({ id: inv.id })}
                          data-testid={`button-cancel-club-invite-${inv.id}`}
                          className="gap-1 font-bold"
                        >
                          <X className="w-3.5 h-3.5" />
                          {isCancelling ? "Cancelling…" : "Cancel"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Members
            </h2>
            {canInvite && (
              <Button
                onClick={() => setInviteOpen(true)}
                className="bg-primary hover:bg-primary/90 font-bold"
                data-testid="button-open-invite"
              >
                <UserPlus className="w-4 h-4 mr-2" /> Invite player
              </Button>
            )}
          </div>

          {membersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : sortedMembers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground font-medium">
                No members in this club yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedMembers.map((member, index) => {
                const role = roleStyle(member.clubRole);
                const name = member.displayName || member.username;
                const memberRole = (member.clubRole ?? "member") as "owner" | "officer" | "member";
                const showRoleControls = isOwner && member.id !== player?.id && memberRole !== "owner";
                const isMutating =
                  updateRole.isPending && updateRole.variables?.playerId === member.id;
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Card className="hover:border-primary transition-colors border-2">
                      <CardContent className="p-4 flex items-center gap-4">
                        <Link href={`/players/${member.id}`}>
                          <a className="flex items-center gap-4 flex-1 min-w-0 cursor-pointer">
                            <Avatar className="h-12 w-12 border-2 border-border">
                              {member.avatarUrl && <AvatarImage src={member.avatarUrl} alt={name} />}
                              <AvatarFallback className="font-bold">{initials(name)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold truncate">{name}</span>
                                {role && (
                                  <Badge variant="outline" className={`gap-1 font-bold uppercase text-[10px] ${role.className}`}>
                                    {role.icon}
                                    {role.label}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground font-bold mt-1">
                                <span>Lvl {member.level}</span>
                                <span>•</span>
                                <span>{member.rank}</span>
                                <span>•</span>
                                <span>{member.totalWins} wins</span>
                              </div>
                            </div>
                          </a>
                        </Link>
                        {showRoleControls && (
                          <div className="flex flex-col gap-1 shrink-0">
                            {memberRole === "member" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isMutating}
                                onClick={() =>
                                  updateRole.mutate({
                                    id,
                                    playerId: member.id,
                                    data: { clubRole: "officer" },
                                  })
                                }
                                className="gap-1 font-bold"
                                data-testid={`button-promote-member-${member.id}`}
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                                {isMutating ? "…" : "Promote"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isMutating}
                                onClick={() =>
                                  updateRole.mutate({
                                    id,
                                    playerId: member.id,
                                    data: { clubRole: "member" },
                                  })
                                }
                                className="gap-1 font-bold"
                                data-testid={`button-demote-member-${member.id}`}
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                                {isMutating ? "…" : "Demote"}
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] flex flex-col">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <UserPlus className="w-5 h-5 text-primary" /> Invite to {club?.name ?? "club"}
            </SheetTitle>
            <SheetDescription>
              Search for a player to send a club invite.
            </SheetDescription>
          </SheetHeader>

          <div className="relative mt-4 px-4">
            <Search className="w-4 h-4 absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or username…"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              className="pl-9"
              data-testid="input-invite-search"
            />
          </div>

          <ScrollArea className="flex-1 mt-3 px-4 pb-4">
            {!hasTypedQuery ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-bold">Search for players to invite</p>
                <p className="text-xs mt-1">Type a name or username to get started.</p>
              </div>
            ) : searchIsLoading || queryStillDebouncing ? (
              <div className="space-y-2 py-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
              </div>
            ) : inviteResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-bold">No matches</p>
                <p className="text-xs mt-1">Try a different name or username.</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {inviteResults.map((p) => {
                  const invited = invitedIds.has(p.id);
                  const isPending =
                    inviteMutation.isPending &&
                    inviteMutation.variables?.data.inviteeId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 transition-colors"
                      data-testid={`invite-result-${p.id}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-black shrink-0 overflow-hidden">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (p.displayName ?? p.username).charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">
                          {p.displayName ?? p.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                      </div>
                      <Button
                        size="sm"
                        variant={invited ? "secondary" : "default"}
                        disabled={invited || isPending}
                        onClick={() =>
                          inviteMutation.mutate({
                            id,
                            data: { inviteeId: p.id },
                          })
                        }
                        className={invited ? "" : "bg-primary hover:bg-primary/90"}
                        data-testid={`button-send-invite-${p.id}`}
                      >
                        {invited ? (
                          <><Check className="w-3.5 h-3.5 mr-1" /> Invited</>
                        ) : isPending ? (
                          "Sending…"
                        ) : (
                          "Send"
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </Layout>
  );
}
