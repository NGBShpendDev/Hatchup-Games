import { useState } from "react";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Plus, LogIn, Crown, Flame, Footprints, Star, Copy, Shield, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SafetyBanner } from "@/components/safety-banner";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface FamilyMember {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  currentStreak: number;
  totalSteps: number;
  weeklySteps: number;
  fitnessLevel?: string;
  identityPath?: string;
}

interface FamilyGroup {
  id: number;
  name: string;
  creatorId: number;
  inviteCode: string;
  createdAt: string;
  hasParentalPin: boolean;
  members: FamilyMember[];
}

const IDENTITY_ICONS: Record<string, string> = {
  casual_explorer: "🌿",
  warrior:         "⚔️",
  athlete:         "🏅",
  recovery_master: "🌸",
  wellness_mystic: "✨",
  family_champion: "👨‍👩‍👧",
};

export default function FamilyPage() {
  const { player, refetch } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createName, setCreateName] = useState("");
  const [createPin, setCreatePin] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const groupId = player?.familyGroupId;

  const { data: group, isLoading } = useQuery<FamilyGroup>({
    queryKey: ["family-group", groupId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/family-groups/${groupId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!groupId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/family-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: createName, parentalPin: createPin || undefined }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Family group created!" });
      setCreateOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["family-group"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/family-groups/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteCode: joinCode, parentalPin: joinPin || undefined }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Joined ${data.groupName}!` });
      setJoinOpen(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["family-group"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/family-groups/${groupId}/leave`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to leave");
    },
    onSuccess: () => {
      toast({ title: "Left family group" });
      refetch();
      qc.invalidateQueries({ queryKey: ["family-group"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const copyCode = () => {
    if (group?.inviteCode) {
      navigator.clipboard.writeText(group.inviteCode).then(() => {
        toast({ title: "Invite code copied!" });
      });
    }
  };

  return (
    <Layout>
      <div className="px-4 pb-32 space-y-5 pt-2">
        <h1 className="text-xl font-black pt-2">Family Teams</h1>
        <SafetyBanner />

        {!groupId ? (
          /* No family group */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 pt-8"
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-4xl">
              👨‍👩‍👧‍👦
            </div>
            <div className="text-center">
              <h2 className="text-xl font-black mb-1">Family Teams</h2>
              <p className="text-white/50 text-sm max-w-xs">
                Move together as a family. Share challenges, track each other's progress, and celebrate wins.
              </p>
            </div>

            <div className="flex gap-3 w-full max-w-xs">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="flex-1 bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white font-bold">
                    <Plus className="w-4 h-4 mr-1" />
                    Create
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d0d14] border-white/10 text-white max-w-sm mx-auto">
                  <DialogHeader>
                    <DialogTitle>Create Family Group</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Group Name</label>
                      <Input
                        value={createName}
                        onChange={e => setCreateName(e.target.value)}
                        placeholder="The Johnsons"
                        className="bg-white/5 border-white/20 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Parental PIN (optional)</label>
                      <Input
                        type="password"
                        value={createPin}
                        onChange={e => setCreatePin(e.target.value)}
                        placeholder="4-digit PIN to protect your group"
                        className="bg-white/5 border-white/20 text-white"
                        maxLength={8}
                      />
                      <p className="text-xs text-white/30 mt-1">Others need this PIN to join</p>
                    </div>
                    <Button
                      className="w-full bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white font-bold"
                      onClick={() => createMutation.mutate()}
                      disabled={!createName.trim() || createMutation.isPending}
                    >
                      {createMutation.isPending ? "Creating…" : "Create Group"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 border-white/20 text-white bg-transparent hover:bg-white/5">
                    <LogIn className="w-4 h-4 mr-1" />
                    Join
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-[#0d0d14] border-white/10 text-white max-w-sm mx-auto">
                  <DialogHeader>
                    <DialogTitle>Join Family Group</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Invite Code</label>
                      <Input
                        value={joinCode}
                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="8-character code"
                        className="bg-white/5 border-white/20 text-white font-mono tracking-widest"
                        maxLength={8}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">PIN (if required)</label>
                      <Input
                        type="password"
                        value={joinPin}
                        onChange={e => setJoinPin(e.target.value)}
                        placeholder="Parental PIN"
                        className="bg-white/5 border-white/20 text-white"
                        maxLength={8}
                      />
                    </div>
                    <Button
                      className="w-full bg-gradient-to-r from-[#ff2d55] to-[#bf00ff] text-white font-bold"
                      onClick={() => joinMutation.mutate()}
                      disabled={!joinCode.trim() || joinMutation.isPending}
                    >
                      {joinMutation.isPending ? "Joining…" : "Join Group"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </motion.div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : group ? (
          /* Has family group */
          <div className="space-y-5">
            {/* Group header */}
            <Card className="bg-gradient-to-br from-violet-900/40 to-pink-900/40 border-violet-500/30">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-violet-400" />
                      <h2 className="font-black text-lg">{group.name}</h2>
                      {group.hasParentalPin && (
                        <Shield className="w-3.5 h-3.5 text-amber-400" />
                      )}
                    </div>
                    <p className="text-xs text-white/50">{group.members.length} member{group.members.length !== 1 ? "s" : ""}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/20 text-white bg-transparent hover:bg-white/5 text-xs"
                    onClick={leaveMutation.mutate as () => void}
                    disabled={leaveMutation.isPending}
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    Leave
                  </Button>
                </div>

                <div
                  className="mt-3 flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={copyCode}
                >
                  <span className="text-xs text-white/40">Invite code:</span>
                  <span className="font-mono font-bold text-sm tracking-widest text-pink-400">{group.inviteCode}</span>
                  <Copy className="w-3.5 h-3.5 text-white/30 ml-auto" />
                </div>
              </CardContent>
            </Card>

            {/* Weekly leaderboard */}
            <div>
              <h3 className="text-sm font-bold text-white/60 uppercase tracking-wider mb-3">Weekly Steps Board</h3>
              <div className="space-y-2">
                {group.members.map((member, i) => {
                  const isMe = member.id === player?.id;
                  const isCreator = member.id === group.creatorId;
                  return (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className={`${isMe ? "border-pink-500/40 bg-pink-900/10" : "border-white/10 bg-white/5"}`}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-black
                            ${i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                              i === 1 ? "bg-slate-400/20 text-slate-300" :
                              i === 2 ? "bg-amber-600/20 text-amber-400" :
                              "bg-white/5 text-white/40"}`}
                          >
                            {i + 1}
                          </div>
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-pink-600 flex items-center justify-center text-sm font-black flex-shrink-0">
                            {(member.displayName ?? member.username)[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="font-bold text-sm truncate">{member.displayName ?? member.username}</p>
                              {isCreator && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                              {isMe && <Badge className="text-[10px] px-1 py-0 bg-pink-600 text-white ml-1">You</Badge>}
                              {member.identityPath && (
                                <span className="text-xs ml-1">{IDENTITY_ICONS[member.identityPath] ?? ""}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Footprints className="w-3 h-3" />
                                {member.weeklySteps.toLocaleString()} steps
                              </span>
                              <span className="flex items-center gap-1">
                                <Flame className="w-3 h-3 text-orange-400" />
                                {member.currentStreak}d
                              </span>
                              <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-400" />
                                Lv {member.level}
                              </span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-pink-400">{member.weeklySteps.toLocaleString()}</p>
                            <p className="text-[10px] text-white/30">this week</p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Safety note */}
            <p className="text-xs text-white/30 text-center pb-4">
              HatchUp is a safe, trusted, and family-friendly community.
            </p>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
