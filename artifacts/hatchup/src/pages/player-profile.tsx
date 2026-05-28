import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { motion, Reorder } from "framer-motion";
import { usePlayer } from "@/lib/playerContext";
import { toast } from "@/hooks/use-toast";
import { BadgeCheck, Flame, Trophy, Sparkles, ArrowLeft, Settings, GripVertical, X, Plus, Lock } from "lucide-react";

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
  artifactShowcase: ShowcaseArtifact[];
  artifactCount: number;
}

export default function PlayerProfilePage() {
  const [, params] = useRoute("/players/:id");
  const profileId = Number(params?.id);
  const { playerId: viewerId } = usePlayer();
  const isOwnProfile = viewerId === profileId;

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

  const toggleFeatured = useMutation({
    mutationFn: async ({ artifactId, isFeatured }: { artifactId: number; isFeatured: boolean }) => {
      const res = await fetch(`${BASE}/api/players/me/artifacts/${artifactId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFeatured }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
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

  const featuredCount = (profile?.artifactShowcase ?? []).filter(a => a.isFeatured).length;

  const handleAddFeatured = (artifactId: number) => {
    if (featuredCount >= MAX_FEATURED) {
      toast({
        title: `Showcase full (${MAX_FEATURED} max)`,
        description: "Unfeature one to feature another.",
        variant: "destructive",
      });
      return;
    }
    toggleFeatured.mutate({ artifactId, isFeatured: true });
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
            <ProfileHeader profile={profile} />
            <ShowcaseStrip
              artifacts={profile.artifactShowcase}
              totalCount={profile.artifactCount}
              isOwnProfile={isOwnProfile}
              museum={museum ?? []}
              featuredCount={featuredCount}
              onReorder={(ids) => reorderFeatured.mutate(ids)}
              onAddFeatured={handleAddFeatured}
              onRemoveFeatured={handleRemoveFeatured}
              isToggling={toggleFeatured.isPending}
            />
          </>
        )}
      </div>
    </Layout>
  );
}

function ProfileHeader({ profile }: { profile: PlayerProfile }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-3xl p-6 text-center space-y-3"
    >
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
      </div>
      <div className="grid grid-cols-3 gap-3 pt-2">
        <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Level" value={profile.level} />
        <Stat icon={<Flame className="w-3.5 h-3.5" />} label="Streak" value={profile.currentStreak} />
        <Stat icon={<Sparkles className="w-3.5 h-3.5" />} label="Artifacts" value={profile.artifactCount} />
      </div>
    </motion.div>
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
      canAddMore={canAddMore}
      featuredCount={featuredCount}
      isToggling={isToggling}
      onAdd={onAddFeatured}
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
                  canAddMore={canAddMore}
                  featuredCount={featuredCount}
                  isToggling={isToggling}
                  onAdd={onAddFeatured}
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
      <div className={`w-full aspect-square rounded-2xl ${styles.bg} border ${styles.border} flex items-center justify-center text-5xl mb-3`}>
        {SLUG_EMOJIS[artifact.imageSlug] ?? "🏺"}
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
  canAddMore,
  featuredCount,
  isToggling,
  onAdd,
  variant = "card",
}: {
  addable: MuseumArtifact[];
  canAddMore: boolean;
  featuredCount: number;
  isToggling: boolean;
  onAdd: (id: number) => void;
  variant?: "card" | "inline";
}) {
  const [open, setOpen] = useState(false);

  const disabled = !canAddMore || addable.length === 0;
  const triggerLabel = !canAddMore
    ? `${MAX_FEATURED}/${MAX_FEATURED} featured`
    : addable.length === 0
      ? "Nothing to add yet"
      : "Add artifact";

  const handleAdd = (id: number) => {
    onAdd(id);
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
              {canAddMore ? (
                <Plus className="w-5 h-5 text-primary" />
              ) : (
                <Lock className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs font-black uppercase tracking-wider text-white leading-tight">
              {canAddMore ? "Add artifact" : "Showcase full"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {canAddMore
                ? addable.length === 0
                  ? "Earn more to feature"
                  : `${addable.length} to choose from`
                : `${featuredCount}/${MAX_FEATURED} featured`}
            </p>
          </button>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="text-white">Feature on your profile</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Pick an artifact to add to your showcase ({featuredCount}/{MAX_FEATURED} used).
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
                  onClick={() => handleAdd(artifact.id)}
                  disabled={isToggling}
                  data-testid={`button-feature-from-sheet-${artifact.id}`}
                  className={`text-left rounded-2xl border-2 ${s.border} ${s.bg} p-3 hover:brightness-125 transition-all disabled:opacity-50`}
                >
                  <div className={`w-full aspect-square rounded-xl ${s.bg} border ${s.border} flex items-center justify-center text-3xl mb-2`}>
                    {SLUG_EMOJIS[artifact.imageSlug] ?? "🏺"}
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
      </SheetContent>
    </Sheet>
  );
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
