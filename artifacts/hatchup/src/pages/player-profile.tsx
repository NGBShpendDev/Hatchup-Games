import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { motion, Reorder } from "framer-motion";
import { usePlayer } from "@/lib/playerContext";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, Flame, Trophy, Sparkles, ArrowLeft, Settings, GripVertical, X, Plus, Lock, BarChart3, Eye, Heart, MessageCircle, Repeat2, Crown, Ban, Swords, ChevronRight, Star, Share2 } from "lucide-react";
import { ShareCardDialog, buildPlayerOgImageUrl, buildPlayerShareUrl } from "@/components/share-card-dialog";
import { rankHatchlingsForRematch } from "@/lib/rematchSuggestions";
import { useGetMyPostInsights, getGetMyPostInsightsQueryKey } from "@workspace/api-client-react";
import type { PostInsight } from "@workspace/api-client-react";
import { useSubscription } from "@/lib/subscription";
import { MutualWorkoutPartnersLine, type MutualPartner } from "@/components/mutual-workout-partners";
import { ModerationHistoryPanel } from "@/components/moderation-history-panel";
import { CrownArt, isCrownSlug } from "@/lib/crownArt";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const MAX_FEATURED = 3;

const RARITY_STYLES: Record<string, { glow: string; border: string; text: string; bg: string; label: string }> = {
  Common:    { glow: "",                          border: "border-zinc-600",     text: "text-zinc-300",   bg: "bg-zinc-800/40",   label: "bg-zinc-700 text-zinc-200" },
  Rare:      { glow: "artifact-glow-rare",        border: "border-blue-500/60",  text: "text-blue-300",   bg: "bg-blue-950/30",   label: "bg-blue-600 text-white" },
  Epic:      { glow: "artifact-glow-epic",        border: "border-purple-500/70",text: "text-purple-300", bg: "bg-purple-950/30", label: "bg-purple-600 text-white" },
  Legendary: { glow: "artifact-glow-legendary",   border: "border-yellow-500/80",text: "text-yellow-300", bg: "bg-yellow-950/20", label: "bg-yellow-500 text-black" },
  Mythic:    { glow: "artifact-glow-mythic",      border: "border-pink-500/80",  text: "text-pink-300",   bg: "bg-pink-950/20",   label: "bg-gradient-to-r from-pink-500 to-rose-500 text-white" },
  Ancient:   { glow: "artifact-glow-ancient",     border: "border-orange-500/80",text: "text-orange-300", bg: "bg-orange-950/20", label: "bg-gradient-to-r from-orange-500 to-amber-600 text-white" },
  Celestial: { glow: "artifact-glow-celestial",   border: "border-cyan-400/90",  text: "text-cyan-200",   bg: "bg-cyan-950/20",   label: "bg-gradient-to-r from-cyan-400 to-indigo-500 text-white" },
};

const SLUG_EMOJIS: Record<string, string> = {
  ember_spark: "🔥", bronze_strider: "🥾", iron_pact: "⚙️",
  flame_keeper: "🕯️", crystal_horizon: "💎", iron_fist: "✊",
  steel_resolve: "🛡️", thunderstride: "⚡", iron_devotee: "💪",
  steel_form: "🗿", leg_day_legend: "🦵", centurion_flame: "👑",
  crown_of_the_bracket: "👑",
  marathon_spirit: "🏃", million_paces: "🌍", phoenix_core: "🦅",
  obsidian_sovereign: "⚫", stellar_epoch: "⭐", void_whisper: "🌑",
  agile_phantom: "🐆", eternal_vigil: "🌙",
};

// Per-tournament Crown of the Bracket variants share the slug prefix
// `crown_of_the_bracket__c<challengeId>`; each variant gets its own art via
// <CrownArt /> (color tint + season badge keyed off the challenge id) so a row
// of crowns from different brackets reads as visually distinct/collectible.
function emojiForSlug(slug: string): string {
  if (isCrownSlug(slug)) return "👑";
  return SLUG_EMOJIS[slug] ?? "🏺";
}

function ArtifactArt({ slug, size }: { slug: string; size: "sm" | "md" | "lg" }) {
  if (isCrownSlug(slug)) return <CrownArt slug={slug} size={size} />;
  return <span>{emojiForSlug(slug)}</span>;
}

interface ShowcaseArtifact {
  id: number;
  name: string;
  rarity: string;
  imageSlug: string;
  isFeatured: boolean;
  isEquipped: boolean;
}

interface MuseumArtifact {
  id: number;
  name: string;
  rarity: string;
  imageSlug: string;
  isFeatured: boolean;
  isEquipped: boolean;
  discovered: boolean;
}

interface PlayerProfile {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  rank: number | null;
  level: number;
  currentStreak: number;
  totalWorkouts: number;
  isVerified: boolean;
  isSuspended?: boolean;
  artifactShowcase: ShowcaseArtifact[];
  artifactCount: number;
  mutualWorkoutPartners?: MutualPartner[];
}

export default function PlayerProfilePage() {
  const [, params] = useRoute("/players/:id");
  const profileId = Number(params?.id);
  const { playerId: viewerId, player: viewer } = usePlayer();
  const isOwnProfile = viewerId === profileId;
  const viewerIsAdmin = !!(viewer as { isAdmin?: boolean } | null)?.isAdmin;

  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery<PlayerProfile>({
    queryKey: ["player-profile", profileId],
    queryFn: () => fetch(`${BASE}/api/players/${profileId}/profile`, { credentials: "include" }).then(r => r.json()),
    enabled: !isNaN(profileId),
  });

  // Only own profile needs the full museum (to populate the "Add artifact" sheet).
  const { data: museum } = useQuery<MuseumArtifact[]>({
    queryKey: ["artifacts-museum", viewerId],
    queryFn: () => fetch(`${BASE}/api/artifacts`, { credentials: "include" }).then(r => r.json()),
    enabled: isOwnProfile && !!viewerId,
  });

  const reorderFeatured = useMutation({
    mutationFn: async (artifactIds: number[]) => {
      const res = await fetch(`${BASE}/api/players/me/featured-order`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["player-profile", profileId] });
      qc.invalidateQueries({ queryKey: ["artifacts-museum", viewerId] });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't reorder", description: err.message, variant: "destructive" });
    },
  });

  const patchOwnedArtifact = async (artifactId: number, isFeatured: boolean) => {
    const res = await fetch(`${BASE}/api/players/me/artifacts/${artifactId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFeatured }),
    });
    if (!res.ok) throw new Error("Failed to update");
    return res.json();
  };

  const toggleFeatured = useMutation({
    mutationFn: ({ artifactId, isFeatured }: { artifactId: number; isFeatured: boolean }) =>
      patchOwnedArtifact(artifactId, isFeatured),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["player-profile", profileId] });
      qc.invalidateQueries({ queryKey: ["artifacts-museum", viewerId] });
      toast({
        title: vars.isFeatured ? "Featured on profile" : "Removed from showcase",
        description: vars.isFeatured ? "This artifact now shines on your profile." : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't update", description: err.message, variant: "destructive" });
    },
  });

  const swapFeatured = useMutation({
    mutationFn: async ({ removeId, addId }: { removeId: number; addId: number }) => {
      // Single atomic backend call — the server runs both updates in one DB
      // transaction so a dropped network mid-swap can never leave the player's
      // showcase half-updated.
      const res = await fetch(`${BASE}/api/players/me/featured-swap`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeId, addId }),
      });
      if (!res.ok) throw new Error("Failed to swap");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["player-profile", profileId] });
      qc.invalidateQueries({ queryKey: ["artifacts-museum", viewerId] });
      toast({
        title: "Showcase swapped",
        description: "Your new artifact now shines on your profile.",
      });
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: ["player-profile", profileId] });
      qc.invalidateQueries({ queryKey: ["artifacts-museum", viewerId] });
      toast({ title: "Couldn't swap", description: err.message, variant: "destructive" });
    },
  });

  const featuredCount = (profile?.artifactShowcase ?? []).filter(a => a.isFeatured).length;

  const handleAddFeatured = (artifactId: number) => {
    toggleFeatured.mutate({ artifactId, isFeatured: true });
  };

  const handleSwapFeatured = (removeId: number, addId: number) => {
    swapFeatured.mutate({ removeId, addId });
  };

  const handleRemoveFeatured = (artifactId: number) => {
    toggleFeatured.mutate({ artifactId, isFeatured: false });
  };

  if (isNaN(profileId)) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto py-12 text-center text-muted-foreground">Invalid player.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 pb-12">
        <div className="flex items-center justify-between">
          <Link href="/">
            <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors" data-testid="link-back">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </Link>
          {isOwnProfile && (
            <Link href="/artifacts">
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-white transition-colors" data-testid="link-manage-showcase">
                <Settings className="w-3.5 h-3.5" /> Manage showcase
              </button>
            </Link>
          )}
        </div>

        {isLoading || !profile ? (
          <ProfileSkeleton />
        ) : (
          <>
            <ProfileHeader profile={profile} viewerIsAdmin={viewerIsAdmin} isOwnProfile={isOwnProfile} />
            {!isOwnProfile && viewerId && (
              <RivalryCard viewerId={viewerId} opponentId={profileId} />
            )}
            <ShowcaseStrip
              artifacts={profile.artifactShowcase}
              totalCount={profile.artifactCount}
              isOwnProfile={isOwnProfile}
              museum={museum ?? []}
              featuredCount={featuredCount}
              onReorder={(ids) => reorderFeatured.mutate(ids)}
              onAddFeatured={handleAddFeatured}
              onSwapFeatured={handleSwapFeatured}
              onRemoveFeatured={handleRemoveFeatured}
              isToggling={toggleFeatured.isPending || swapFeatured.isPending}
            />
            {viewerIsAdmin && !isOwnProfile && (
              <ModerationHistoryPanel targetPlayerId={profileId} />
            )}
            {isOwnProfile && <PostInsightsSection />}
          </>
        )}
      </div>
    </Layout>
  );
}

function ProfileHeader({ profile, viewerIsAdmin, isOwnProfile }: { profile: PlayerProfile; viewerIsAdmin: boolean; isOwnProfile: boolean }) {
  const [, navigate] = useLocation();
  const mutualPartners = profile.mutualWorkoutPartners ?? [];
  const [shareOpen, setShareOpen] = useState(false);
  const displayName = profile.displayName ?? profile.username;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-3xl p-6 text-center space-y-3 relative"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShareOpen(true)}
        className="absolute top-4 right-4 rounded-full font-bold gap-1.5"
        data-testid="button-share-player"
      >
        <Share2 className="w-3.5 h-3.5" /> Share
      </Button>
      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        ogImageUrl={buildPlayerOgImageUrl(profile.username)}
        shareUrl={buildPlayerShareUrl(profile.username)}
        shareText={`Check out ${displayName} on HatchUp`}
        title={`Share ${displayName}'s profile`}
      />
      <div className="flex justify-center">
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.displayName ?? profile.username}
            className="w-20 h-20 rounded-full object-cover border-2 border-primary/40"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-3xl font-black text-white">
            {(profile.displayName ?? profile.username).charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center justify-center gap-1.5">
          <h1 className="text-2xl font-black tracking-tight text-white" data-testid="text-display-name">
            {profile.displayName ?? profile.username}
          </h1>
          {profile.isVerified && <BadgeCheck className="w-5 h-5 text-blue-400 fill-blue-400/20" />}
        </div>
        <p className="text-sm text-muted-foreground">@{profile.username}</p>
        {!isOwnProfile && mutualPartners.length > 0 && (
          <MutualWorkoutPartnersLine
            partners={mutualPartners}
            onViewProfile={(id) => navigate(`/players/${id}`)}
            testIdPrefix="profile"
            className="text-[11px] text-emerald-300 font-bold mt-2 flex items-center justify-center gap-1 truncate"
          />
        )}
        {viewerIsAdmin && profile.isSuspended && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 text-[10px] font-black uppercase tracking-wider"
            data-testid="badge-suspended"
          >
            <Ban className="w-3 h-3" /> Suspended
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 pt-2">
        <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Level" value={profile.level} />
        <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Streak" value={profile.currentStreak} />
        <Stat icon={<Sparkles className="w-3.5 h-3.5" />} label="Artifacts" value={profile.artifactCount} />
      </div>
    </motion.div>
  );
}

interface RivalryBattleLite {
  id: number;
  createdAt: string;
  outcome: "win" | "loss" | "draw" | string;
  myHatchlingId: number | null;
}

interface RivalrySummary {
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
  viewerEloDelta: number;
  lastBattleAt: string | null;
  lastBattleId: number | null;
  opponentDisplayName: string | null;
  opponentUsername: string | null;
  battles?: RivalryBattleLite[];
}

interface RivalHatchlingLite {
  id: number;
  name: string;
  level: number;
}

function RivalryCard({ viewerId, opponentId }: { viewerId: number; opponentId: number }) {
  const [, navigate] = useLocation();
  const [rematchOpen, setRematchOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data } = useQuery<RivalrySummary>({
    queryKey: ["rival-summary", viewerId, opponentId],
    queryFn: () =>
      fetch(`${BASE}/api/battles/rivals/${opponentId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error("Failed to load rivalry"))),
    enabled: !!viewerId && opponentId > 0 && viewerId !== opponentId,
  });

  const { data: myHatchlings = [] } = useQuery<RivalHatchlingLite[]>({
    queryKey: ["hatchlings-rival-card", viewerId],
    queryFn: () =>
      fetch(`${BASE}/api/hatchlings?playerId=${viewerId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!viewerId && rematchOpen,
  });

  if (!data || data.totalBattles === 0) return null;

  const { wins, losses, draws, viewerEloDelta, totalBattles, lastBattleId } = data;
  const eloLabel = viewerEloDelta > 0 ? `+${viewerEloDelta}` : `${viewerEloDelta}`;
  const eloClass = viewerEloDelta > 0 ? "text-green-400" : viewerEloDelta < 0 ? "text-red-400" : "text-muted-foreground";
  const opponentName = data.opponentDisplayName ?? data.opponentUsername ?? "your rival";

  async function sendRematch(hatchlingId: number) {
    if (!lastBattleId) return;
    setSending(true);
    try {
      const res = await fetch(`${BASE}/api/battles/rematch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: lastBattleId, hatchlingId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Could not send rematch");
      toast({
        title: "Rematch sent!",
        description: `Waiting for ${opponentName}…`,
      });
      setRematchOpen(false);
      navigate("/compete/battle");
    } catch (err) {
      toast({
        title: "Could not send rematch",
        description: String((err as Error).message),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="block bg-card border border-border rounded-3xl p-4 hover:border-primary/60 transition-colors"
        data-testid="card-rivalry"
      >
        <Link href={`/compete/rivals/${opponentId}`}>
          <div className="cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Swords className="w-4 h-4 text-primary" />
                <h2 className="font-black text-base text-white">Head to Head</h2>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
              <RivalStat label="Battles" value={String(totalBattles)} className="text-white" testId="rivalry-total" />
              <RivalStat label="Wins" value={String(wins)} className="text-green-400" testId="rivalry-wins" />
              <RivalStat label="Losses" value={String(losses)} className="text-red-400" testId="rivalry-losses" />
              <RivalStat label="ELO" value={eloLabel} className={eloClass} testId="rivalry-elo" />
            </div>
            {draws > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2 text-center font-bold uppercase tracking-wider">
                {draws} {draws === 1 ? "draw" : "draws"}
              </p>
            )}
          </div>
        </Link>
        {lastBattleId && (
          <Button
            onClick={() => setRematchOpen(true)}
            className="w-full mt-3 font-bold"
            size="sm"
            data-testid="button-rematch-profile"
          >
            <Swords className="w-4 h-4 mr-1.5" /> Rematch
          </Button>
        )}
      </motion.div>

      <Dialog open={rematchOpen} onOpenChange={(open) => { if (!open) setRematchOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rematch {opponentName}?</DialogTitle>
            <DialogDescription>
              You're {wins}–{losses}{draws > 0 ? `–${draws}` : ""} against them.
              Pick a Hatchling to send into the arena.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2">
            {myHatchlings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You need a Hatchling first.
              </p>
            ) : (
              rankHatchlingsForRematch(myHatchlings, data?.battles ?? []).map(r => {
                const h = r.hatchling;
                const subLabel = r.reason === "last-used"
                  ? "Last used vs this rival"
                  : r.wins > 0
                    ? `${r.wins}W vs this rival`
                    : `Lv. ${h.level}`;
                return (
                  <button
                    key={h.id}
                    disabled={sending}
                    onClick={() => sendRematch(h.id)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                      r.isRecommended
                        ? "border-primary/60 bg-primary/10 hover:bg-primary/15"
                        : "border-border bg-card/40 hover:border-primary/50 hover:bg-primary/5"
                    }`}
                    data-testid={`button-pick-hatchling-rematch-${h.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold truncate">{h.name}</p>
                        {r.isRecommended && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary"
                            data-testid={`badge-recommended-rematch-${h.id}`}
                          >
                            <Star className="w-2.5 h-2.5" /> Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Lv. {h.level} · {subLabel}
                      </p>
                    </div>
                    <Swords className="w-4 h-4 text-primary shrink-0" />
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRematchOpen(false)} disabled={sending}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RivalStat({ label, value, className, testId }: { label: string; value: string; className: string; testId: string }) {
  return (
    <div className="bg-muted/30 rounded-2xl py-2 px-2 text-center" data-testid={testId}>
      <p className="text-[9px] uppercase font-black tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-base font-black ${className}`}>{value}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-muted/30 rounded-2xl py-2.5 px-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase font-black tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-black text-white">{value}</p>
    </div>
  );
}

function ShowcaseStrip({
  artifacts,
  totalCount,
  isOwnProfile,
  museum,
  featuredCount,
  onReorder,
  onAddFeatured,
  onSwapFeatured,
  onRemoveFeatured,
  isToggling,
}: {
  artifacts: ShowcaseArtifact[];
  totalCount: number;
  isOwnProfile: boolean;
  museum: MuseumArtifact[];
  featuredCount: number;
  onReorder: (ids: number[]) => void;
  onAddFeatured: (id: number) => void;
  onSwapFeatured: (removeId: number, addId: number) => void;
  onRemoveFeatured: (id: number) => void;
  isToggling: boolean;
}) {
  // Only featured artifacts are reorderable — the server's featured-order
  // endpoint rejects any IDs that aren't currently featured. Equipped-but-not-
  // featured cards stay in place after the featured group.
  const featured = artifacts.filter(a => a.isFeatured);
  const nonFeatured = artifacts.filter(a => !a.isFeatured);
  const canReorder = isOwnProfile && featured.length > 1;
  const canAddMore = isOwnProfile && featuredCount < MAX_FEATURED;

  // Unfeatured discovered artifacts available to add from the profile.
  const addableArtifacts = museum.filter(a => a.discovered && !a.isFeatured);

  const [orderedFeatured, setOrderedFeatured] = useState<ShowcaseArtifact[]>(featured);
  useEffect(() => {
    setOrderedFeatured(featured);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifacts]);

  const commitReorder = (next: ShowcaseArtifact[]) => {
    setOrderedFeatured(next);
    const ids = next.map(a => a.id);
    const prevIds = featured.map(a => a.id);
    const changed = ids.length !== prevIds.length || ids.some((id, i) => id !== prevIds[i]);
    if (changed) onReorder(ids);
  };

  const addTile = isOwnProfile ? (
    <AddArtifactTile
      addable={addableArtifacts}
      featured={featured}
      canAddMore={canAddMore}
      featuredCount={featuredCount}
      isToggling={isToggling}
      onAdd={onAddFeatured}
      onSwap={onSwapFeatured}
    />
  ) : null;

  return (
    <div className="space-y-3" data-testid="section-showcase">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <h2 className="font-black text-base text-white">Artifact Showcase</h2>
        </div>
        <span className="text-[11px] text-muted-foreground font-bold">
          {isOwnProfile ? `${featuredCount}/${MAX_FEATURED} featured · ${totalCount} total` : `${totalCount} total`}
        </span>
      </div>

      {artifacts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-8 text-center space-y-3">
          <span className="text-3xl block">🏺</span>
          <p className="text-sm text-muted-foreground">
            {isOwnProfile ? "No artifacts featured yet." : "This player hasn't featured any artifacts."}
          </p>
          {isOwnProfile && (
            <div className="flex items-center justify-center">
              {addableArtifacts.length > 0 ? (
                <AddArtifactTile
                  addable={addableArtifacts}
                  featured={featured}
                  canAddMore={canAddMore}
                  featuredCount={featuredCount}
                  isToggling={isToggling}
                  onAdd={onAddFeatured}
                  onSwap={onSwapFeatured}
                  variant="inline"
                />
              ) : (
                <Link href="/artifacts">
                  <button className="text-xs font-bold text-primary hover:underline" data-testid="link-go-to-museum">
                    Visit the Museum →
                  </button>
                </Link>
              )}
            </div>
          )}
        </div>
      ) : canReorder ? (
        <>
          <p className="text-[11px] text-muted-foreground px-1">Drag to reorder how your featured artifacts appear on your profile.</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            <Reorder.Group
              axis="x"
              values={orderedFeatured}
              onReorder={commitReorder}
              className="flex gap-3"
              data-testid="profile-featured-reorder-list"
            >
              {orderedFeatured.map((artifact, i) => (
                <Reorder.Item
                  key={artifact.id}
                  value={artifact}
                  className="flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
                  whileDrag={{ scale: 1.04, zIndex: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
                  data-testid={`profile-featured-item-${artifact.id}`}
                >
                  <ShowcaseCard
                    artifact={artifact}
                    index={i}
                    draggable
                    removable={isOwnProfile}
                    onRemove={() => onRemoveFeatured(artifact.id)}
                    isToggling={isToggling}
                  />
                </Reorder.Item>
              ))}
            </Reorder.Group>
            {nonFeatured.map((artifact, i) => (
              <ShowcaseCard key={artifact.id} artifact={artifact} index={orderedFeatured.length + i} />
            ))}
            {addTile}
          </div>
        </>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {artifacts.map((artifact, i) => (
            <ShowcaseCard
              key={artifact.id}
              artifact={artifact}
              index={i}
              removable={isOwnProfile && artifact.isFeatured}
              onRemove={() => onRemoveFeatured(artifact.id)}
              isToggling={isToggling}
            />
          ))}
          {addTile}
        </div>
      )}
    </div>
  );
}

function ShowcaseCard({
  artifact,
  index,
  draggable = false,
  removable = false,
  onRemove,
  isToggling = false,
}: {
  artifact: ShowcaseArtifact;
  index: number;
  draggable?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  isToggling?: boolean;
}) {
  const styles = RARITY_STYLES[artifact.rarity] ?? RARITY_STYLES.Common!;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={`flex-shrink-0 w-40 rounded-3xl border-2 ${styles.border} ${styles.bg} ${styles.glow} p-4 ${draggable ? "relative" : "snap-center relative"}`}
      data-testid={`card-showcase-artifact-${artifact.id}`}
    >
      {removable && artifact.isFeatured && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove?.();
          }}
          disabled={isToggling}
          aria-label="Remove from showcase"
          title="Remove from showcase"
          data-testid={`button-remove-featured-${artifact.id}`}
          className="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-black/70 border border-white/20 text-white hover:bg-red-600/90 hover:border-red-400 transition-colors flex items-center justify-center disabled:opacity-50 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {draggable && (
        <div className="absolute top-2 right-2 text-muted-foreground/70">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}
      <div className={`w-full aspect-square rounded-2xl ${styles.bg} border ${styles.border} flex items-center justify-center text-5xl mb-3 overflow-hidden`}>
        {isCrownSlug(artifact.imageSlug)
          ? <CrownArt slug={artifact.imageSlug} size="lg" />
          : emojiForSlug(artifact.imageSlug)}
      </div>
      <Badge className={`text-[9px] font-black uppercase tracking-wider mb-1.5 ${styles.label}`}>
        {artifact.rarity}
      </Badge>
      <p className={`text-sm font-black leading-tight ${styles.text}`} data-testid={`text-artifact-name-${artifact.id}`}>
        {artifact.name}
      </p>
      {(artifact.isFeatured || artifact.isEquipped) && (
        <div className="flex gap-1 mt-2">
          {artifact.isFeatured && <span className="text-[9px] font-bold text-yellow-400">★ FEATURED</span>}
          {artifact.isEquipped && <span className="text-[9px] font-bold text-green-400">✓ EQUIPPED</span>}
        </div>
      )}
    </motion.div>
  );
}

function AddArtifactTile({
  addable,
  featured,
  canAddMore,
  featuredCount,
  isToggling,
  onAdd,
  onSwap,
  variant = "card",
}: {
  addable: MuseumArtifact[];
  featured: ShowcaseArtifact[];
  canAddMore: boolean;
  featuredCount: number;
  isToggling: boolean;
  onAdd: (id: number) => void;
  onSwap: (removeId: number, addId: number) => void;
  variant?: "card" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [pendingAddId, setPendingAddId] = useState<number | null>(null);

  // Sheet stays usable when the showcase is full — picking an artifact then
  // prompts for a swap target. Only fully disable when nothing is available.
  const disabled = addable.length === 0;
  const triggerLabel = addable.length === 0
    ? "Nothing to add yet"
    : canAddMore
      ? "Add artifact"
      : "Swap artifact";

  // Reset swap pick whenever the sheet closes so a fresh open starts at step 1.
  useEffect(() => {
    if (!open) setPendingAddId(null);
  }, [open]);

  const pendingArtifact = pendingAddId != null
    ? addable.find(a => a.id === pendingAddId) ?? null
    : null;

  const handlePick = (id: number) => {
    if (canAddMore) {
      onAdd(id);
      setOpen(false);
      return;
    }
    setPendingAddId(id);
  };

  const handleSwapTarget = (removeId: number) => {
    if (pendingAddId == null) return;
    onSwap(removeId, pendingAddId);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === "inline" ? (
          <button
            type="button"
            disabled={disabled || isToggling}
            data-testid="button-add-featured"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            {triggerLabel}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || isToggling}
            data-testid="button-add-featured"
            className="flex-shrink-0 w-40 rounded-3xl border-2 border-dashed border-border bg-muted/10 hover:border-primary/60 hover:bg-primary/5 transition-colors p-4 flex flex-col items-center justify-center gap-2 text-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-muted/10"
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/40 flex items-center justify-center">
              {addable.length === 0 ? (
                <Lock className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Plus className="w-5 h-5 text-primary" />
              )}
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-white leading-tight">
              {triggerLabel}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {addable.length === 0
                ? "Earn more to feature"
                : canAddMore
                  ? `${addable.length} to choose from`
                  : `${featuredCount}/${MAX_FEATURED} featured · tap to swap`}
            </p>
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        {pendingArtifact ? (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-white">Swap with…</SheetTitle>
              <p className="text-xs text-muted-foreground">
                Your showcase is full ({featuredCount}/{MAX_FEATURED}). Pick which featured artifact to replace with{" "}
                <span className={RARITY_STYLES[pendingArtifact.rarity]?.text ?? "text-white"}>
                  {pendingArtifact.name}
                </span>
                .
              </p>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-3 pb-3">
              {featured.map((artifact) => {
                const s = RARITY_STYLES[artifact.rarity] ?? RARITY_STYLES.Common!;
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => handleSwapTarget(artifact.id)}
                    disabled={isToggling}
                    data-testid={`button-swap-target-${artifact.id}`}
                    className={`text-left rounded-2xl border-2 ${s.border} ${s.bg} p-3 hover:brightness-125 transition-all disabled:opacity-50`}
                  >
                    <div className={`w-full aspect-square rounded-xl ${s.bg} border ${s.border} flex items-center justify-center text-3xl mb-2 overflow-hidden`}>
                      {isCrownSlug(artifact.imageSlug)
                        ? <CrownArt slug={artifact.imageSlug} size="md" />
                        : emojiForSlug(artifact.imageSlug)}
                    </div>
                    <Badge className={`text-[9px] font-black uppercase tracking-wider mb-1 ${s.label}`}>
                      {artifact.rarity}
                    </Badge>
                    <p className={`text-xs font-black leading-tight ${s.text}`}>{artifact.name}</p>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPendingAddId(null)}
              disabled={isToggling}
              data-testid="button-swap-cancel"
              className="w-full text-center text-xs font-bold text-muted-foreground hover:text-white py-2 mb-4 disabled:opacity-50"
            >
              ← Pick a different artifact
            </button>
          </>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-white">
                {canAddMore ? "Feature on your profile" : "Swap into your showcase"}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                {canAddMore
                  ? `Pick an artifact to add to your showcase (${featuredCount}/${MAX_FEATURED} used).`
                  : `Showcase full (${featuredCount}/${MAX_FEATURED}). Pick a new artifact — you'll choose which one it replaces next.`}
              </p>
            </SheetHeader>
            {addable.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <span className="text-4xl block">🏺</span>
                <p className="text-sm text-muted-foreground">
                  You've already featured everything you've discovered. Earn more artifacts in the Museum.
                </p>
                <Link href="/artifacts">
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xs font-bold text-primary hover:underline"
                    data-testid="link-sheet-to-museum"
                  >
                    Visit the Museum →
                  </button>
                </Link>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 pb-6">
                {addable.map((artifact) => {
                  const s = RARITY_STYLES[artifact.rarity] ?? RARITY_STYLES.Common!;
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => handlePick(artifact.id)}
                      disabled={isToggling}
                      data-testid={`button-feature-from-sheet-${artifact.id}`}
                      className={`text-left rounded-2xl border-2 ${s.border} ${s.bg} p-3 hover:brightness-125 transition-all disabled:opacity-50`}
                    >
                      <div className={`w-full aspect-square rounded-xl ${s.bg} border ${s.border} flex items-center justify-center text-3xl mb-2 overflow-hidden`}>
                        {isCrownSlug(artifact.imageSlug)
                          ? <CrownArt slug={artifact.imageSlug} size="md" />
                          : emojiForSlug(artifact.imageSlug)}
                      </div>
                      <Badge className={`text-[9px] font-black uppercase tracking-wider mb-1 ${s.label}`}>
                        {artifact.rarity}
                      </Badge>
                      <p className={`text-xs font-black leading-tight ${s.text}`}>{artifact.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PostInsightsSection() {
  const [sort, setSort] = useState<"recent" | "views">("recent");
  const { data: sub } = useSubscription();
  const isPremium = sub?.tier === "premium";

  const { data, isLoading, isError } = useGetMyPostInsights(
    { sort, limit: 50 },
    {
      query: {
        queryKey: getGetMyPostInsightsQueryKey({ sort, limit: 50 }),
        enabled: isPremium,
        staleTime: 30_000,
      },
    },
  );

  return (
    <section className="space-y-3" data-testid="section-post-insights">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-pink-400" />
          <h2 className="font-black text-base text-white">My posts</h2>
        </div>
        {isPremium && (
          <div className="flex items-center gap-1 bg-muted/30 rounded-full p-0.5">
            <SortPill active={sort === "recent"} onClick={() => setSort("recent")} testId="sort-recent">
              Recent
            </SortPill>
            <SortPill active={sort === "views"} onClick={() => setSort("views")} testId="sort-views">
              Top views
            </SortPill>
          </div>
        )}
      </div>

      {!isPremium ? (
        <PremiumInsightsTeaser />
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-6 text-center text-sm text-muted-foreground">
          Couldn't load your insights right now. Try again later.
        </div>
      ) : !data || data.posts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-8 text-center space-y-2">
          <span className="text-3xl block">📣</span>
          <p className="text-sm text-muted-foreground">No posts yet — share a workout or hatch to see insights here.</p>
        </div>
      ) : (
        <>
          <InsightsTotals totals={data.totals} />
          <div className="space-y-2">
            {data.posts.map((post) => (
              <InsightRow key={post.id} post={post} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function SortPill({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`button-insights-${testId}`}
      className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
        active ? "bg-pink-500 text-white" : "text-muted-foreground hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function InsightsTotals({
  totals,
}: {
  totals: { postCount: number; viewCount: number; reactionCount: number; commentCount: number; repostCount: number };
}) {
  return (
    <div className="grid grid-cols-4 gap-2" data-testid="insights-totals">
      <TotalStat icon={<Eye className="w-3 h-3" />} label="Views" value={totals.viewCount} />
      <TotalStat icon={<Heart className="w-3 h-3" />} label="Reactions" value={totals.reactionCount} />
      <TotalStat icon={<MessageCircle className="w-3 h-3" />} label="Comments" value={totals.commentCount} />
      <TotalStat icon={<Repeat2 className="w-3 h-3" />} label="Reposts" value={totals.repostCount} />
    </div>
  );
}

function TotalStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-muted/30 rounded-2xl py-2 px-1.5 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[9px] uppercase font-black tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-black text-white">{formatCount(value)}</p>
    </div>
  );
}

function InsightRow({ post }: { post: PostInsight }) {
  const preview = post.content.trim().length > 0 ? post.content.trim() : `(${post.postType} post)`;
  return (
    <Link href={`/social/posts/${post.id}`}>
      <div
        className="block bg-card border border-border rounded-2xl p-3 hover:border-primary/60 transition-colors cursor-pointer"
        data-testid={`insight-row-${post.id}`}
      >
        <div className="flex items-start gap-3">
          {post.mediaUrl ? (
            <img src={post.mediaUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-muted/30 flex items-center justify-center text-lg flex-shrink-0">📝</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white line-clamp-2 leading-snug">{preview}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(post.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-border/60 text-[11px] font-bold">
          <Metric icon={<Eye className="w-3 h-3" />} value={post.viewCount} testId={`metric-views-${post.id}`} />
          <Metric icon={<Heart className="w-3 h-3" />} value={post.reactionCount} testId={`metric-reactions-${post.id}`} />
          <Metric icon={<MessageCircle className="w-3 h-3" />} value={post.commentCount} testId={`metric-comments-${post.id}`} />
          <Metric icon={<Repeat2 className="w-3 h-3" />} value={post.repostCount} testId={`metric-reposts-${post.id}`} />
        </div>
      </div>
    </Link>
  );
}

function Metric({ icon, value, testId }: { icon: React.ReactNode; value: number; testId: string }) {
  return (
    <div className="flex items-center gap-1 text-muted-foreground" data-testid={testId}>
      {icon}
      <span className="text-white">{formatCount(value)}</span>
    </div>
  );
}

function PremiumInsightsTeaser() {
  return (
    <Link href="/subscription">
      <div
        className="bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-pink-500/40 rounded-3xl p-5 text-center space-y-3 cursor-pointer hover:from-pink-500/15 hover:to-purple-500/15 transition-colors"
        data-testid="insights-paywall"
      >
        <div className="flex items-center justify-center gap-2">
          <Crown className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-black uppercase tracking-wider text-white">Premium creators only</span>
        </div>
        <p className="text-xs text-muted-foreground leading-snug">
          See views, reactions, comments, and reposts for every post you've shared — and find out which content resonates most.
        </p>
        <span className="inline-block text-[11px] font-black uppercase tracking-wider text-pink-300 hover:text-pink-200">
          Upgrade to unlock →
        </span>
      </div>
    </Link>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const day = 86_400_000;
  if (diffMs < day) {
    const h = Math.max(1, Math.floor(diffMs / 3_600_000));
    return `${h}h ago`;
  }
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-56 rounded-3xl" />
      <div className="flex gap-3 overflow-hidden">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-56 w-40 flex-shrink-0 rounded-3xl" />)}
      </div>
    </div>
  );
}
