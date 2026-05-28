import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { usePlayer } from "@/lib/playerContext";
import { BadgeCheck, Flame, Trophy, Sparkles, ArrowLeft, Settings } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

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

  const { data: profile, isLoading } = useQuery<PlayerProfile>({
    queryKey: ["player-profile", profileId],
    queryFn: () => fetch(`${BASE}/api/players/${profileId}/profile`, { credentials: "include" }).then(r => r.json()),
    enabled: !isNaN(profileId),
  });

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
            <ShowcaseStrip artifacts={profile.artifactShowcase} totalCount={profile.artifactCount} isOwnProfile={isOwnProfile} />
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
}: {
  artifacts: ShowcaseArtifact[];
  totalCount: number;
  isOwnProfile: boolean;
}) {
  return (
    <div className="space-y-3" data-testid="section-showcase">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-yellow-400" />
          <h2 className="font-black text-base text-white">Artifact Showcase</h2>
        </div>
        <span className="text-[11px] text-muted-foreground font-bold">{totalCount} total</span>
      </div>

      {artifacts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-8 text-center space-y-2">
          <span className="text-3xl block">🏺</span>
          <p className="text-sm text-muted-foreground">
            {isOwnProfile ? "No artifacts featured yet." : "This player hasn't featured any artifacts."}
          </p>
          {isOwnProfile && (
            <Link href="/artifacts">
              <button className="text-xs font-bold text-primary hover:underline" data-testid="link-go-to-museum">
                Visit the Museum →
              </button>
            </Link>
          )}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {artifacts.map((artifact, i) => (
            <ShowcaseCard key={artifact.id} artifact={artifact} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ShowcaseCard({ artifact, index }: { artifact: ShowcaseArtifact; index: number }) {
  const styles = RARITY_STYLES[artifact.rarity] ?? RARITY_STYLES.Common!;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={`flex-shrink-0 w-40 rounded-3xl border-2 ${styles.border} ${styles.bg} ${styles.glow} p-4 snap-center`}
      data-testid={`card-showcase-artifact-${artifact.id}`}
    >
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
