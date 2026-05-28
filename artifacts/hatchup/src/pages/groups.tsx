import { useState, useRef, useEffect, type ReactElement } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { usePlayer } from "@/lib/playerContext";
import {
  useListMyGroups,
  getListMyGroupsQueryKey,
  useCreateGroup,
  getGetGroupUrl,
  getGetGroupQueryKey,
  useJoinGroupByCode,
  useLeaveGroup,
  useLogGroupWorkout,
  getListGroupMessagesUrl,
  getListGroupMessagesQueryKey,
  useSendGroupMessage,
  type WorkoutGroupDetail,
  type GroupMessage,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { NeonButton } from "@/components/ui/neon-button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Zap,
  Swords,
  Trophy,
  Plus,
  ChevronRight,
  ArrowLeft,
  Send,
  Heart,
  Flame,
  Star,
  Copy,
  LogIn,
  Dumbbell,
  Shield,
  MoreVertical,
} from "lucide-react";
import { SafetyBanner } from "@/components/safety-banner";
import { SafetyGuidelinesSheet } from "@/components/safety-guidelines-sheet";
import { ReportBlockMenu } from "@/components/report-block-menu";

const GROUP_TYPE_LABELS: Record<string, string> = {
  fitness_party: "Fitness Party",
  hatch_crew: "Hatch Crew",
  pal_squad: "Pal Squad",
};

const GROUP_TYPE_ICONS: Record<string, ReactElement> = {
  fitness_party: <Flame className="w-4 h-4 text-orange-400" />,
  hatch_crew: <Star className="w-4 h-4 text-yellow-400" />,
  pal_squad: <Heart className="w-4 h-4 text-pink-400" />,
};

const ENERGY_THRESHOLD = 500;

const MOTIVATIONAL_PROMPTS = [
  "Let's crush this workout! 💪",
  "You're all doing amazing! 🔥",
  "Team energy is rising! ⚡",
  "One more rep for the squad! 🏆",
  "We're unstoppable together! 🌟",
];

function EnergyBar({ current, max }: { current: number; max: number }) {
  const pct = Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold">
        <span className="flex items-center gap-1 text-yellow-400"><Zap className="w-3 h-3" /> Team Energy</span>
        <span>{current} / {max}</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function RaidBossCard({ raid }: { raid: WorkoutGroupDetail["raid"] }) {
  if (!raid) return null;
  const hpPct = raid.hpPct;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl bg-gradient-to-br from-red-950/60 to-purple-950/60 border border-red-800/50 p-4 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
    >
      <div className="flex items-center gap-2 mb-3">
        <Swords className="w-5 h-5 text-red-400 animate-pulse" />
        <h3 className="font-black text-lg text-red-200">RAID BOSS</h3>
        {raid.status === "defeated" && (
          <Badge className="bg-green-500 text-white font-black ml-auto">DEFEATED!</Badge>
        )}
        {raid.status === "active" && (
          <Badge className="bg-red-600 text-white font-black ml-auto animate-pulse">ACTIVE</Badge>
        )}
      </div>
      <p className="text-2xl font-black text-white mb-3">{raid.bossName}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-bold text-red-300">
          <span>Boss HP</span>
          <span>{Math.max(0, raid.bossHp - raid.currentDamage)} / {raid.bossHp}</span>
        </div>
        <div className="h-4 rounded-full bg-red-950 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400"
            initial={{ width: `${hpPct}%` }}
            animate={{ width: `${hpPct}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </div>
      {raid.status === "active" && (
        <p className="text-xs text-red-300/70 font-medium mt-2">
          Complete workouts to deal damage. Every step counts!
        </p>
      )}
    </motion.div>
  );
}

function GroupDetail({ groupId, onBack }: { groupId: number; onBack: () => void }) {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: group, isLoading } = useQuery<WorkoutGroupDetail>({
    queryKey: getGetGroupQueryKey(groupId),
    queryFn: async () => {
      const url = `${getGetGroupUrl(groupId)}?playerId=${pid}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load group: ${res.status}`);
      return res.json() as Promise<WorkoutGroupDetail>;
    },
    enabled: !!groupId && !!pid,
    refetchInterval: 10000,
  });

  const { data: messages, isLoading: msgsLoading } = useQuery<GroupMessage[]>({
    queryKey: getListGroupMessagesQueryKey(groupId),
    queryFn: async () => {
      const url = `${getListGroupMessagesUrl(groupId)}?playerId=${pid}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load messages: ${res.status}`);
      return res.json() as Promise<GroupMessage[]>;
    },
    enabled: !!groupId && !!pid,
    refetchInterval: 5000,
  });

  const logWorkout = useLogGroupWorkout();
  const sendMsg = useSendGroupMessage();
  const leaveGroup = useLeaveGroup();

  const [msgText, setMsgText] = useState("");
  const [workoutXp, setWorkoutXp] = useState("100");
  const [workoutSteps, setWorkoutSteps] = useState("1000");
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogWorkout = () => {
    const xp = Math.max(10, Number(workoutXp) || 100);
    const steps = Math.max(0, Number(workoutSteps) || 0);
    logWorkout.mutate(
      { id: groupId, data: { playerId: pid, baseXp: xp, steps } },
      {
        onSuccess: (res) => {
          toast({
            title: "Group Workout Logged!",
            description: `+${res.bonusXp} Bonus XP (${res.xpBonusPct}% group bonus) • +${res.energyGained} Team Energy${res.raidUnlocked ? " • ⚔️ RAID UNLOCKED!" : ""}`,
          });
          setWorkoutModalOpen(false);
          queryClient.invalidateQueries({ queryKey: getGetGroupQueryKey(groupId) });
          queryClient.invalidateQueries({ queryKey: getListMyGroupsQueryKey({ playerId: pid }) });
        },
      }
    );
  };

  const handleSendMessage = () => {
    if (!msgText.trim()) return;
    sendMsg.mutate(
      { id: groupId, data: { playerId: pid, content: msgText } },
      {
        onSuccess: () => {
          setMsgText("");
          queryClient.invalidateQueries({ queryKey: getListGroupMessagesQueryKey(groupId) });
        },
      }
    );
  };

  const handleLeave = () => {
    leaveGroup.mutate(
      { id: groupId, data: { playerId: pid } },
      {
        onSuccess: () => {
          toast({ title: "Left group", description: "You've left the group." });
          queryClient.invalidateQueries({ queryKey: getListMyGroupsQueryKey({ playerId: pid }) });
          onBack();
        },
      }
    );
  };

  const copyInviteCode = () => {
    if (group?.inviteCode) {
      navigator.clipboard.writeText(group.inviteCode).catch(() => {});
      toast({ title: "Invite code copied!", description: group.inviteCode });
    }
  };

  if (isLoading || !group) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const isMember = group.members.some(m => m.playerId === pid);
  const myMembership = group.members.find(m => m.playerId === pid);
  const memberCount = group.members.length;
  const xpBonus = memberCount >= 6 ? 50 : memberCount >= 4 ? 25 : memberCount >= 2 ? 10 : 0;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="p-2">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-2xl truncate">{group.name}</h2>
          <p className="text-xs text-muted-foreground font-bold uppercase">
            {GROUP_TYPE_LABELS[group.type] ?? group.type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyInviteCode} className="font-bold text-xs gap-1">
            <Copy className="w-3 h-3" /> {group.inviteCode}
          </Button>
        </div>
      </div>

      {/* Safety Banner */}
      <SafetyBanner variant="meetup" compact />

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <GlassCard className="p-3 text-center">
          <Users className="w-5 h-5 text-blue-400 mx-auto mb-1" />
          <p className="font-black text-xl">{memberCount}</p>
          <p className="text-[10px] text-muted-foreground font-bold uppercase">Members</p>
        </GlassCard>
        <GlassCard glow="yellow" className="p-3 text-center">
          <Zap className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
          <p className="font-black text-xl">{group.teamEnergy}</p>
          <p className="text-[10px] text-muted-foreground font-bold uppercase">Energy</p>
        </GlassCard>
        <GlassCard glow="primary" className="p-3 text-center">
          <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
          <p className="font-black text-xl">+{xpBonus}%</p>
          <p className="text-[10px] text-muted-foreground font-bold uppercase">XP Bonus</p>
        </GlassCard>
      </div>

      {/* Team Energy Bar */}
      <Card className="bg-card border">
        <CardContent className="p-4">
          <EnergyBar current={group.totalTeamEnergy} max={ENERGY_THRESHOLD} />
          {group.totalTeamEnergy >= ENERGY_THRESHOLD && !group.raid && (
            <p className="text-xs text-yellow-400 font-bold mt-2 animate-pulse">
              ⚔️ Team energy threshold reached! Raid boss incoming!
            </p>
          )}
          {group.totalTeamEnergy < ENERGY_THRESHOLD && (
            <p className="text-xs text-muted-foreground font-medium mt-2">
              {ENERGY_THRESHOLD - group.totalTeamEnergy} more energy needed to unlock Raid Boss
            </p>
          )}
        </CardContent>
      </Card>

      {/* Raid Boss */}
      {group.raid && <RaidBossCard raid={group.raid} />}

      {/* Log Group Workout */}
      {isMember && (
        <NeonButton
          variant="primary"
          size="lg"
          onClick={() => setWorkoutModalOpen(true)}
          className="w-full"
        >
          <Dumbbell className="w-5 h-5 mr-2 inline" />
          Log Group Workout (+{xpBonus}% XP Bonus)
        </NeonButton>
      )}

      {/* Group Challenges */}
      {group.challenges.length > 0 && (
        <section>
          <h3 className="font-black text-lg mb-3 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" /> Group Challenges
          </h3>
          <div className="space-y-3">
            {group.challenges.map((challenge) => (
              <Card key={challenge.id} className={`border ${challenge.isCompleted ? "border-green-500/40 bg-green-950/20" : "border-border"}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm">{challenge.title}</p>
                      <p className="text-xs text-muted-foreground">{challenge.description}</p>
                    </div>
                    {challenge.isCompleted ? (
                      <Badge className="bg-green-500 text-white font-black shrink-0 ml-2">Done!</Badge>
                    ) : (
                      <Badge variant="outline" className="font-bold shrink-0 ml-2">
                        {challenge.rewardType === "bonus_eggs" ? "🥚" : "⭐"} ×{challenge.rewardAmount}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground font-medium">
                      <span>{challenge.currentValue.toLocaleString()} / {challenge.targetValue.toLocaleString()}</span>
                      <span>{challenge.progressPct}%</span>
                    </div>
                    <Progress value={challenge.progressPct} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <h3 className="font-black text-lg mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-400" /> Members
        </h3>
        <div className="space-y-2">
          {group.members.map((member) => (
            <Card key={member.id} className="border">
              <CardContent className="p-3 flex items-center gap-3">
                <Link href={`/players/${member.playerId}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity" data-testid={`link-profile-${member.playerId}`}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                    <span className="font-black text-primary text-sm">
                      {(member.displayName ?? member.username).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{member.displayName ?? member.username}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-medium">{member.coWorkoutCount} co-workouts</span>
                      {member.playerId === group.creatorPlayerId && (
                        <Badge variant="secondary" className="text-[9px] font-black uppercase h-4 px-1">Leader</Badge>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {Array.from({ length: Math.min(member.friendshipLevel, 5) }).map((_, i) => (
                    <Heart key={i} className="w-3 h-3 fill-pink-500 text-pink-500" />
                  ))}
                </div>
                {member.playerId !== pid && (
                  <ReportBlockMenu
                    trigger={
                      <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    }
                    targetPlayerId={member.playerId}
                    targetName={member.displayName ?? member.username}
                    contentType="profile"
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Friendship Level */}
      {myMembership && myMembership.coWorkoutCount > 0 && (
        <Card className="border border-pink-500/30 bg-pink-950/10">
          <CardContent className="p-4 flex items-center gap-3">
            <Heart className="w-6 h-6 fill-pink-500 text-pink-500 shrink-0" />
            <div>
              <p className="font-bold text-sm">Friendship Level {myMembership.friendshipLevel}</p>
              <p className="text-xs text-muted-foreground">{myMembership.coWorkoutCount} co-workouts • Level up every 5!</p>
            </div>
            <div className="ml-auto flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full ${i < (myMembership.coWorkoutCount % 5) ? "bg-pink-500" : "bg-muted"}`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group Chat */}
      <section>
        <h3 className="font-black text-lg mb-3 flex items-center gap-2">
          <Send className="w-5 h-5 text-accent" /> Group Chat
        </h3>
        <Card className="border">
          <div className="h-56 overflow-y-auto p-3 space-y-2">
            {msgsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-3/4 rounded-xl" />)}
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 group ${msg.playerId === pid ? "flex-row-reverse" : ""}`}
                >
                  <div className={`px-3 py-1.5 rounded-2xl text-sm font-medium max-w-[75%] ${
                    msg.playerId === pid
                      ? "bg-primary text-white rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}>
                    {msg.playerId !== pid && (
                      <Link href={`/players/${msg.playerId}`} className="text-[10px] font-black text-muted-foreground block hover:text-primary transition-colors" data-testid={`link-profile-${msg.playerId}`}>{msg.playerName}</Link>
                    )}
                    {msg.content}
                  </div>
                  {msg.playerId !== pid && (
                    <ReportBlockMenu
                      trigger={
                        <button className="self-center p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-3 h-3" />
                        </button>
                      }
                      targetPlayerId={msg.playerId}
                      targetName={msg.playerName ?? "Trainer"}
                      contentType="message"
                      contentId={msg.id}
                    />
                  )}
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Send className="w-8 h-8 opacity-30" />
                <p className="text-sm font-medium">Be the first to say something!</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Prompt suggestions */}
          <div className="px-3 pb-2 flex gap-2 overflow-x-auto">
            {MOTIVATIONAL_PROMPTS.slice(0, 3).map((p) => (
              <button
                key={p}
                onClick={() => setMsgText(p)}
                className="text-[10px] font-bold bg-muted rounded-full px-2 py-1 whitespace-nowrap hover:bg-primary/20 transition-colors shrink-0"
              >
                {p}
              </button>
            ))}
          </div>

          <div className="p-2 border-t border-border flex gap-2">
            <Input
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSendMessage()}
              placeholder="Cheer on your squad..."
              className="flex-1 h-9 text-sm"
              maxLength={280}
            />
            <Button
              size="sm"
              onClick={handleSendMessage}
              disabled={!msgText.trim() || sendMsg.isPending}
              className="h-9 px-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </section>

      {/* Leave Group */}
      {isMember && group.creatorPlayerId !== pid && (
        <Button
          variant="outline"
          onClick={handleLeave}
          disabled={leaveGroup.isPending}
          className="w-full font-bold text-red-400 border-red-400/30 hover:bg-red-950/20"
        >
          Leave Group
        </Button>
      )}

      {/* Workout Log Modal */}
      <Dialog open={workoutModalOpen} onOpenChange={setWorkoutModalOpen}>
        <DialogContent className="bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-black text-xl">Log Group Workout</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-primary/10 rounded-xl p-3 text-sm font-bold text-primary flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Group size bonus: +{xpBonus}% XP for {memberCount} members
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground uppercase">Base XP Earned</label>
              <Input
                type="number"
                value={workoutXp}
                onChange={e => setWorkoutXp(e.target.value)}
                className="h-12 text-lg font-bold"
                min={10}
                max={500}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-muted-foreground uppercase">Steps (optional)</label>
              <Input
                type="number"
                value={workoutSteps}
                onChange={e => setWorkoutSteps(e.target.value)}
                className="h-12 text-lg font-bold"
                min={0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleLogWorkout}
              disabled={logWorkout.isPending}
              className="w-full font-black h-12 active-elevate"
            >
              {logWorkout.isPending ? "Logging..." : `Log & Earn ${Math.round(Number(workoutXp || 100) * (1 + xpBonus / 100))} XP`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Groups() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState<"fitness_party" | "hatch_crew" | "pal_squad">("fitness_party");
  const [inviteCode, setInviteCode] = useState("");

  const { data: groups, isLoading } = useListMyGroups(
    { playerId: pid },
    { query: { queryKey: getListMyGroupsQueryKey({ playerId: pid }), enabled: !!playerId } }
  );

  const createGroup = useCreateGroup();
  const joinGroupByCode = useJoinGroupByCode();

  const handleCreate = () => {
    if (!groupName.trim()) return;
    createGroup.mutate(
      { data: { name: groupName, type: groupType, creatorPlayerId: pid } },
      {
        onSuccess: (g) => {
          toast({ title: "Group created!", description: `Invite code: ${g.inviteCode}` });
          setCreateModalOpen(false);
          setGroupName("");
          queryClient.invalidateQueries({ queryKey: getListMyGroupsQueryKey({ playerId: pid }) });
          setSelectedGroupId(g.id);
        },
      }
    );
  };

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    joinGroupByCode.mutate(
      { data: { playerId: pid, inviteCode: inviteCode.toUpperCase() } },
      {
        onSuccess: (g) => {
          toast({ title: "Joined group!", description: `Welcome to ${g.name}!` });
          setJoinModalOpen(false);
          setInviteCode("");
          queryClient.invalidateQueries({ queryKey: getListMyGroupsQueryKey({ playerId: pid }) });
          setSelectedGroupId(g.id);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast({
            title: "Could not join",
            description: msg ?? "Invalid invite code or group is full.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (selectedGroupId) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto">
          <GroupDetail groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/20 to-purple-800/20 border border-primary/20 p-6 rounded-3xl">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3 mb-1">
            <Users className="text-primary w-7 h-7" /> Workout Groups
          </h1>
          <p className="text-muted-foreground font-medium text-sm">Team up, generate energy, and defeat raid bosses together.</p>
          <div className="flex items-center gap-2 mt-3">
            <SafetyGuidelinesSheet
              trigger={
                <button className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors">
                  <Shield className="w-3.5 h-3.5" /> Safety Guidelines
                </button>
              }
            />
          </div>
          <div className="flex gap-3 mt-3">
            <Button onClick={() => setCreateModalOpen(true)} className="font-bold gap-2 active-elevate flex-1">
              <Plus className="w-4 h-4" /> Create Group
            </Button>
            <Button variant="outline" onClick={() => setJoinModalOpen(true)} className="font-bold gap-2 flex-1">
              <LogIn className="w-4 h-4" /> Join Group
            </Button>
          </div>
        </div>

        {/* Groups List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
          </div>
        ) : groups && groups.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-black text-lg">My Groups ({groups.length})</h2>
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card
                  className="border-2 hover:border-primary/50 transition-colors cursor-pointer group active-elevate"
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        {GROUP_TYPE_ICONS[group.type] ?? <Shield className="w-4 h-4 text-muted-foreground" />}
                        <div>
                          <h3 className="font-black text-base leading-tight">{group.name}</h3>
                          <p className="text-xs text-muted-foreground font-medium">{GROUP_TYPE_LABELS[group.type] ?? group.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {group.hasActiveRaid && (
                          <Badge className="bg-red-600 text-white font-black text-[10px] animate-pulse">⚔️ RAID</Badge>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>

                    <EnergyBar current={group.totalTeamEnergy} max={ENERGY_THRESHOLD} />

                    <div className="flex items-center gap-4 mt-3 text-xs font-bold text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {group.memberCount} members</span>
                      <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-yellow-500" /> {group.activeChallenges} challenges</span>
                      <span className="flex items-center gap-1 text-primary"><Zap className="w-3 h-3" /> {group.teamEnergy} energy</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="p-10 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-black text-lg mb-2">No groups yet</h3>
              <p className="text-muted-foreground text-sm mb-6">Create a group or join one with an invite code to start working out together!</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => setCreateModalOpen(true)} className="font-bold gap-2">
                  <Plus className="w-4 h-4" /> Create Group
                </Button>
                <Button variant="outline" onClick={() => setJoinModalOpen(true)} className="font-bold gap-2">
                  <LogIn className="w-4 h-4" /> Join Group
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Group Modal */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="bg-card max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-black text-xl">Create a Workout Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground uppercase">Group Name</label>
                <Input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. Morning Warriors"
                  className="h-12"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground uppercase">Group Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["fitness_party", "hatch_crew", "pal_squad"] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setGroupType(type)}
                      className={`p-2.5 rounded-xl border-2 text-center transition-all ${
                        groupType === type
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex justify-center mb-1">{GROUP_TYPE_ICONS[type]}</div>
                      <span className="text-[10px] font-bold leading-tight block">{GROUP_TYPE_LABELS[type]}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreate}
                disabled={!groupName.trim() || createGroup.isPending}
                className="w-full font-black h-12 active-elevate"
              >
                {createGroup.isPending ? "Creating..." : "Create Group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Join Group Modal */}
        <Dialog open={joinModalOpen} onOpenChange={setJoinModalOpen}>
          <DialogContent className="bg-card max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-black text-xl">Join a Group</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <SafetyBanner variant="meetup" compact />
              <div className="space-y-2">
                <label className="text-sm font-bold text-muted-foreground uppercase">Invite Code</label>
                <Input
                  value={inviteCode}
                  onChange={e => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC123"
                  className="h-12 font-mono text-xl tracking-widest"
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground">Ask your friend for their group's 6-character invite code.</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase">Proximity check-in</p>
                <p className="text-xs text-muted-foreground">Working out in the same location? Use the invite code above for a manual check-in while you're together.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => handleJoin()}
                disabled={inviteCode.length < 6 || joinGroupByCode.isPending}
                className="w-full font-black h-12 active-elevate"
              >
                {joinGroupByCode.isPending ? "Joining..." : "Join Squad"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
