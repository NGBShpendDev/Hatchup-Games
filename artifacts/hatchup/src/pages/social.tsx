import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { ForYouStrip } from "@/components/for-you-strip";
import { PostCard, POST_TYPES, timeAgo } from "@/components/post-card";
import { usePlayer } from "@/lib/playerContext";
import {
  useGetSocialFeed,
  getGetSocialFeedQueryKey,
  useCreatePost,
  useReactToPost,
  useDeletePost,
  useFollowPlayer,
  useDiscoverPlayers,
  getDiscoverPlayersQueryKey,
  useSearchDiscoverablePlayers,
  getSearchDiscoverablePlayersQueryKey,
  type DiscoverablePlayer,
  useListHatchlings,
  getListHatchlingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Plus,
  Heart,
  Flame,
  Zap,
  Dumbbell,
  MessageCircle,
  Share2,
  Trash2,
  Clock,
  Star,
  Image,
  Send,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Award,
  Sparkles,
  Camera,
  Search,
  Compass,
  Users2,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";

export const REACTION_ICONS: Record<string, { icon: ReactNode; label: string; color: string }> = {
  like: { icon: <Heart className="w-4 h-4" />, label: "Like", color: "text-pink-500" },
  encourage: { icon: <Zap className="w-4 h-4" />, label: "Encourage", color: "text-yellow-500" },
  fire: { icon: <Flame className="w-4 h-4" />, label: "Fire", color: "text-orange-500" },
  flex: { icon: <Dumbbell className="w-4 h-4" />, label: "Flex", color: "text-blue-500" },
};


export function ComposeSheet({
  open,
  onClose,
  playerId,
}: {
  open: boolean;
  onClose: () => void;
  playerId: number;
}) {
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [tags, setTags] = useState("");
  const [postType, setPostType] = useState("general");
  const [creatureId, setCreatureId] = useState<string>("none");
  const [arDataUrl, setArDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createPost = useCreatePost();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: hatchlings = [] } = useListHatchlings(
    { playerId },
    { query: { queryKey: getListHatchlingsQueryKey({ playerId }), enabled: !!playerId } }
  );

  const speciesEmojiMap: Record<string, string> = {
    Dragon: "🐉", Phoenix: "🔥", Wolf: "🐺", Fox: "🦊", Tiger: "🐯",
    Bird: "🦅", Fish: "🐬", Bear: "🐻", Cat: "🐱", Rabbit: "🐰",
    Mystery: "🥚", Unicorn: "🦄",
  };

  const selectedCreature = creatureId !== "none" ? hatchlings.find(h => h.id === Number(creatureId)) : undefined;
  const creatureEmoji = selectedCreature
    ? (speciesEmojiMap[selectedCreature.species] ?? "🐾")
    : "🐾";

  async function handleSubmit() {
    if (!content.trim()) return;
    const tagList = tags.split(",").map(t => t.trim()).filter(Boolean);
    const finalContent = tagList.length > 0
      ? `${content.trim()}\n\n${tagList.map(t => `#${t.replace(/^#/, "")}`).join(" ")}`
      : content.trim();
    try {
      await createPost.mutateAsync({
        data: {
          playerId,
          content: finalContent,
          mediaUrl: arDataUrl || mediaUrl || undefined,
          postType,
          creatureId: creatureId !== "none" ? Number(creatureId) : undefined,
        },
      });
      toast({ title: "Posted! 🎉", description: `+${POST_TYPES.find(t => t.value === postType)?.label ?? "post"} shared with the community.` });
      setContent("");
      setMediaUrl("");
      setTags("");
      setPostType("general");
      setCreatureId("none");
      setArDataUrl(null);
      // Invalidate every variant of the feed query (home highlights uses
      // limit:3, the main /social feed uses no params, etc.) by matching
      // the shared URL prefix.
      qc.invalidateQueries({ queryKey: ["/api/social/feed"] });
      onClose();
    } catch (err: any) {
      if (err?.response?.status === 422) {
        toast({ title: "Keep it positive! 🌟", description: "Your post was flagged by our community guidelines. Focus on encouragement!", variant: "destructive" });
      } else {
        toast({ title: "Could not post", variant: "destructive" });
      }
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? "");
      setMediaUrl(dataUrl);
      setArDataUrl(null);
    };
    reader.readAsDataURL(file);
  }

  function overlayCreatureOnCanvas() {
    if (!canvasRef.current) {
      toast({ title: "Add a photo first", description: "Upload an image or paste an image URL to compose your AR pal photo.", variant: "destructive" });
      return;
    }
    if (!mediaUrl && !arDataUrl) {
      toast({ title: "Add a photo first", description: "Upload an image or paste an image URL to compose your AR pal photo.", variant: "destructive" });
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = 600;
      const H = Math.round((img.height / img.width) * W);
      canvas.width = W;
      canvas.height = H;

      ctx.drawImage(img, 0, 0, W, H);

      // Overlay creature emoji as a "pal" in the photo
      const size = Math.round(Math.min(W, H) * 0.32);
      ctx.font = `${size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Shadow for visibility
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 12;
      ctx.fillText(creatureEmoji, W * 0.75, H * 0.7);
      ctx.shadowBlur = 0;

      // Watermark badge
      const label = selectedCreature?.name ?? "Your Pal";
      ctx.font = "bold 20px sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const padding = 8;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(W - tw - 28, H - 44, tw + 20, 28);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "right";
      ctx.fillText(label, W - 18, H - 30);

      const composed = canvas.toDataURL("image/png");
      setArDataUrl(composed);
      toast({ title: "Pal added to photo! 🐾", description: "Your composited image is ready to post." });
    };
    img.onerror = () => {
      toast({ title: "Could not load image", description: "Try a different URL or upload a file.", variant: "destructive" });
    };
    img.src = arDataUrl || mediaUrl;
  }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-xl font-black">Share Your Journey ✨</SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Post type selector */}
          <Select value={postType} onValueChange={setPostType}>
            <SelectTrigger className="rounded-xl font-bold" data-testid="select-post-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POST_TYPES.map(t => (
                <SelectItem key={t.value} value={t.value} className="font-bold">
                  {t.icon} {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Creature selector */}
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1.5 block">
              Feature a Pal (optional)
            </label>
            <Select value={creatureId} onValueChange={(v) => { setCreatureId(v); setArDataUrl(null); }}>
              <SelectTrigger className="rounded-xl font-bold" data-testid="select-creature">
                <SelectValue placeholder="No pal — just a vibe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="font-bold">No pal — just a vibe</SelectItem>
                {hatchlings.map(h => (
                  <SelectItem key={h.id} value={String(h.id)} className="font-bold">
                    {speciesEmojiMap[h.species] ?? "🐾"} {h.name} · Lvl {h.level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="What's your win today? Share your progress, celebrate your creature, or inspire others! 💪"
            className="min-h-[120px] rounded-xl resize-none text-sm"
            maxLength={500}
            data-testid="input-content"
          />
          <p className="text-xs text-muted-foreground text-right">{content.length}/500</p>

          {/* Tags */}
          <div>
            <label className="text-xs font-bold text-muted-foreground mb-1.5 block">
              Tags (comma-separated, optional)
            </label>
            <Input
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. running, evolution, dragon"
              className="rounded-xl text-sm"
              data-testid="input-tags"
            />
          </div>

          {/* Media upload */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 rounded-xl text-xs font-bold h-9"
                data-testid="button-upload-photo"
              >
                <Image className="w-3.5 h-3.5 mr-1.5" /> Upload Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFilePick}
              />
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] text-muted-foreground">or URL:</span>
              <Input
                value={mediaUrl.startsWith("data:") ? "" : mediaUrl}
                onChange={e => { setMediaUrl(e.target.value); setArDataUrl(null); }}
                placeholder="https://..."
                className="rounded-xl text-xs h-8"
                data-testid="input-media-url"
              />
            </div>
            {(mediaUrl || arDataUrl) && (
              <div className="rounded-xl overflow-hidden border border-border/30 max-h-48">
                <img src={arDataUrl || mediaUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* AR Creature Photo composer */}
          <div className="rounded-xl border border-dashed border-primary/40 p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary" />
                Compose AR Pal Photo
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={overlayCreatureOnCanvas}
                disabled={!mediaUrl && !arDataUrl}
                className="h-7 text-xs font-bold rounded-full"
                data-testid="button-ar-compose"
              >
                Add {creatureEmoji} to photo
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {!mediaUrl && !arDataUrl
                ? "Upload a photo first, then add your selected pal as an overlay."
                : selectedCreature
                  ? `Will overlay ${selectedCreature.name} ${creatureEmoji} onto your photo.`
                  : "Pick a pal above, then compose."}
            </p>
            {/* Hidden canvas used for AR composition */}
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* XP preview */}
          {postType && (
            <div className="flex items-center gap-2 text-xs font-bold text-green-500 bg-green-500/10 px-3 py-2 rounded-xl">
              <Sparkles className="w-3.5 h-3.5" />
              This post earns you XP and Evolution Energy!
            </div>
          )}
        </div>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl font-bold flex-1">Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || createPost.isPending}
            className="rounded-xl font-black flex-1"
          >
            {createPost.isPending ? "Posting..." : "Post to Community"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ProfileModal({
  playerId: profileId,
  viewerId,
  open,
  onClose,
}: {
  playerId: number;
  viewerId: number;
  open: boolean;
  onClose: () => void;
}) {
  const { data: profile, isLoading } = useGetPlayerSocialProfile(
    profileId,
    { viewerId },
    { query: { queryKey: getGetPlayerSocialProfileQueryKey(profileId, { viewerId }), enabled: open && !!profileId } }
  );
  const followPlayer = useFollowPlayer();
  const qc = useQueryClient();
  const { toast } = useToast();

  async function handleFollow() {
    await followPlayer.mutateAsync({ data: { followerId: viewerId, followeeId: profileId } });
    qc.invalidateQueries({ queryKey: getGetPlayerSocialProfileQueryKey(profileId, { viewerId }) });
    toast({ title: "Following! 🤝" });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Player Profile</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : profile ? (
          <div className="space-y-4">
            {/* Memory banner */}
            {profile.memory && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-black text-purple-400 uppercase tracking-wider">Memory</span>
                </div>
                <p className="text-sm font-bold">{profile.memory.label}</p>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{profile.memory.post.content}</p>
              </motion.div>
            )}

            {/* Player info */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary">
                <AvatarImage src={profile.player.avatarUrl ?? undefined} />
                <AvatarFallback className="font-black text-lg">{(profile.player.username ?? "?").substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-lg">{profile.player.displayName ?? profile.player.username}</h3>
                  {profile.player.creatorBadge && (
                    <Badge className="bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[10px] font-black">
                      <Award className="w-2.5 h-2.5 mr-0.5" /> Creator
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">@{profile.player.username}</p>
                <div className="flex gap-4 mt-1 text-xs font-bold">
                  <span><span className="text-foreground">{profile.followerCount}</span> <span className="text-muted-foreground">Followers</span></span>
                  <span><span className="text-foreground">{profile.followingCount}</span> <span className="text-muted-foreground">Following</span></span>
                </div>
              </div>
            </div>

            {profileId !== viewerId && !profile.isFollowing && (
              <Button onClick={handleFollow} disabled={followPlayer.isPending} className="w-full font-black rounded-xl h-10">
                <UserPlus className="w-4 h-4 mr-2" />
                Follow
              </Button>
            )}
            {profile.isFollowing && (
              <div className="flex items-center justify-center gap-2 text-sm text-primary font-bold py-2">
                <UserPlus className="w-4 h-4" /> Following
              </div>
            )}

            {/* Mutual followers */}
            {profileId !== viewerId && profile.mutualFollowers && profile.mutualFollowers.length > 0 && (
              <div className="bg-muted/30 border border-border/40 rounded-2xl p-3" data-testid="section-mutual-followers">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Followed by people you follow
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {profile.mutualFollowers.map(m => (
                      <Avatar key={m.id} className="h-7 w-7 border-2 border-background">
                        <AvatarImage src={m.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-[10px] font-bold bg-primary/20">
                          {(m.username ?? "?").substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                  <p className="text-xs font-bold flex-1">
                    {(() => {
                      const names = profile.mutualFollowers.map(m => m.displayName ?? m.username);
                      const total = profile.mutualFollowersTotal ?? names.length;
                      const extra = total - names.length;
                      const joined = names.length === 1
                        ? names[0]
                        : names.length === 2
                          ? `${names[0]} and ${names[1]}`
                          : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
                      if (extra > 0) {
                        return (
                          <>
                            <span>Followed by {names.slice(0, -1).join(", ")}{names.length > 1 ? ", " : ""}{names[names.length - 1]} </span>
                            <button
                              className="text-primary hover:underline"
                              data-testid="link-mutual-followers-more"
                              onClick={() => toast({ title: `${extra} more mutual follower${extra === 1 ? "" : "s"}`, description: "Tap their profiles from the feed to see more." })}
                            >
                              and {extra} {extra === 1 ? "other" : "others"}
                            </button>
                          </>
                        );
                      }
                      return <>Followed by {joined}</>;
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Shared groups */}
            {profileId !== viewerId && profile.sharedGroups && profile.sharedGroups.length > 0 && (
              <div className="bg-muted/30 border border-border/40 rounded-2xl p-3" data-testid="section-shared-groups">
                <div className="flex items-center gap-2 mb-2">
                  <Users2 className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Groups you both joined
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {profile.sharedGroups.map(g => (
                    <Badge
                      key={g.id}
                      variant="outline"
                      className="text-[10px] font-bold border-purple-500/40 text-purple-300 bg-purple-500/10"
                      data-testid={`badge-shared-group-${g.id}`}
                    >
                      {g.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline posts */}
            <div>
              <h4 className="font-black text-sm mb-2 flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-primary" /> Transformation Timeline
              </h4>
              <div className="space-y-2">
                {profile.posts.slice(0, 5).map((post) => {
                  const postTypeInfo = POST_TYPES.find(t => t.value === post.postType);
                  return (
                    <div key={post.id} className="border-l-2 border-primary/30 pl-3 py-1">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
                        <span>{postTypeInfo?.icon}</span>
                        <span>{postTypeInfo?.label}</span>
                        <span>·</span>
                        <span>{timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="text-xs line-clamp-2">{post.content}</p>
                    </div>
                  );
                })}
                {profile.posts.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No posts yet</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlayerDiscoverCard({
  player,
  viewerId,
  onViewProfile,
}: {
  player: DiscoverablePlayer;
  viewerId: number;
  onViewProfile: (pid: number) => void;
}) {
  const followPlayer = useFollowPlayer();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [optimisticFollow, setOptimisticFollow] = useState(player.isFollowing);

  const reasonLabel: Record<string, { text: string; icon: React.ReactNode; color: string }> = {
    shared_group: { text: "In a group with you", icon: <Users2 className="w-3 h-3" />, color: "text-purple-400" },
    similar_goals: { text: "Similar goals", icon: <Dumbbell className="w-3 h-3" />, color: "text-emerald-400" },
    top_creator: { text: "Top creator", icon: <Award className="w-3 h-3" />, color: "text-yellow-400" },
    recently_active: { text: "Recently active", icon: <Sparkles className="w-3 h-3" />, color: "text-cyan-400" },
    search: { text: "", icon: null, color: "" },
  };
  const reason = reasonLabel[player.reason] ?? reasonLabel.recently_active;
  const reasonText = player.reason === "similar_goals" && player.reasonDetail
    ? player.reasonDetail
    : reason.text;

  async function handleFollow() {
    if (optimisticFollow) return;
    setOptimisticFollow(true);
    try {
      await followPlayer.mutateAsync({ data: { followerId: viewerId, followeeId: player.id } });
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: viewerId }) });
      qc.invalidateQueries({ queryKey: getDiscoverPlayersQueryKey({ playerId: viewerId }) });
      toast({ title: `Following ${player.displayName ?? player.username}! 🤝` });
    } catch {
      setOptimisticFollow(false);
      toast({ title: "Could not follow", variant: "destructive" });
    }
  }

  return (
    <Card className="border border-border/50 bg-card/80 backdrop-blur rounded-2xl overflow-hidden">
      <CardContent className="p-3 flex items-center gap-3">
        <button onClick={() => onViewProfile(player.id)} className="flex-shrink-0">
          <Avatar className="h-12 w-12 border border-border ring-2 ring-primary/20">
            <AvatarImage src={player.avatarUrl ?? undefined} />
            <AvatarFallback className="font-bold text-sm bg-primary/20">
              {(player.username ?? "?").substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onViewProfile(player.id)}
              className="font-bold text-sm hover:text-primary transition-colors truncate"
              data-testid={`button-view-profile-${player.id}`}
            >
              {player.displayName ?? player.username}
            </button>
            {player.creatorBadge && (
              <Badge className="bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[10px] font-black px-1.5 py-0">
                <Award className="w-2.5 h-2.5 mr-0.5" /> Creator
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            @{player.username} · {player.followerCount} {player.followerCount === 1 ? "follower" : "followers"}
          </p>
          {reasonText && (
            <p className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${reason.color}`}>
              {reason.icon}
              {reasonText}
            </p>
          )}
        </div>
        {player.id !== viewerId && (
          optimisticFollow ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="rounded-full h-8 px-3 text-xs font-black"
              data-testid={`button-following-${player.id}`}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Following
            </Button>
          ) : (
            <Button
              onClick={handleFollow}
              disabled={followPlayer.isPending}
              size="sm"
              className="rounded-full h-8 px-3 text-xs font-black"
              data-testid={`button-follow-${player.id}`}
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Follow
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

function DiscoverPanel({
  playerId,
  onViewProfile,
}: {
  playerId: number;
  onViewProfile: (pid: number) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const isSearching = debouncedQuery.length > 0;

  const { data: suggestions, isLoading: loadingSuggest } = useDiscoverPlayers(
    { playerId },
    { query: { queryKey: getDiscoverPlayersQueryKey({ playerId }), enabled: !isSearching && !!playerId } },
  );

  const { data: searchResults, isLoading: loadingSearch } = useSearchDiscoverablePlayers(
    { q: debouncedQuery, playerId },
    { query: { queryKey: getSearchDiscoverablePlayersQueryKey({ q: debouncedQuery, playerId }), enabled: isSearching && !!playerId } },
  );

  const list: DiscoverablePlayer[] = (isSearching ? searchResults : suggestions) ?? [];
  const loading = isSearching ? loadingSearch : loadingSuggest;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search players by username or name..."
          className="pl-9 pr-9 h-10 rounded-full bg-card/80 text-sm"
          data-testid="input-player-search"
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!isSearching && (
        <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-2">
          <Compass className="w-3.5 h-3.5" /> Suggested for you
        </h2>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 bg-card/50 rounded-3xl border border-dashed border-border">
          {isSearching ? (
            <>
              <Search className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-bold">No players match "{debouncedQuery}"</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different username or name.</p>
            </>
          ) : (
            <>
              <Compass className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
              <p className="text-sm font-bold">No suggestions yet</p>
              <p className="text-xs text-muted-foreground mt-1">Join a group or post to discover other players.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <PlayerDiscoverCard
              key={p.id}
              player={p}
              viewerId={playerId}
              onViewProfile={onViewProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Social() {
  const { playerId } = usePlayer();
  const pid = playerId ?? 1;
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("feed");
  const [, setLocation] = useLocation();
  const goToProfile = useCallback((targetId: number) => setLocation(`/players/${targetId}`), [setLocation]);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: feed, isLoading } = useGetSocialFeed(
    { playerId: pid },
    { query: { queryKey: getGetSocialFeedQueryKey({ playerId: pid }) } }
  );

  const reactToPost = useReactToPost();
  const deletePost = useDeletePost();

  const handleReact = useCallback(async (postId: number, reactionType: string) => {
    try {
      await reactToPost.mutateAsync({ id: postId, data: { playerId: pid, reactionType: reactionType as any } });
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: pid }) });
    } catch {
      toast({ title: "Could not react", variant: "destructive" });
    }
  }, [pid, reactToPost, qc, toast]);

  const handleDelete = useCallback(async (postId: number) => {
    try {
      await deletePost.mutateAsync({ id: postId, params: { playerId: pid } });
      qc.invalidateQueries({ queryKey: getGetSocialFeedQueryKey({ playerId: pid }) });
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Could not delete post", variant: "destructive" });
    }
  }, [pid, deletePost, qc, toast]);

  return (
    <Layout>
      <div className="space-y-4 pb-4">
        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-primary flex items-center gap-2">
              <Users className="w-7 h-7" /> Community
            </h1>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Your positive fitness universe
            </p>
          </div>
          <Button
            onClick={() => setComposeOpen(true)}
            className="rounded-full h-10 w-10 p-0 shadow-lg shadow-primary/30"
          >
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        <ForYouStrip
          heading="For You"
          items={[
            { id: "follow-friends", title: "Find friends to follow", subtitle: "Discover players in your realm.", href: "/social", icon: <Users className="w-4 h-4" />, tone: "cyan", tag: "Social" },
            { id: "join-group", title: "Join a workout group", subtitle: "Train with others in your city.", href: "/groups", icon: <Users className="w-4 h-4" />, tone: "violet", tag: "Group" },
            { id: "start-challenge", title: "Start a public challenge", subtitle: "Invite friends and stake a goal.", href: "/challenges/create", icon: <Zap className="w-4 h-4" />, tone: "primary", tag: "Compete" },
            { id: "share-pr", title: "Share your latest PR", subtitle: "Post a record to your feed.", href: "/records", icon: <Flame className="w-4 h-4" />, tone: "yellow", tag: "Brag" },
          ]}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-card/60 backdrop-blur p-1 h-10">
            <TabsTrigger value="feed" className="rounded-full text-xs font-black" data-testid="tab-feed">
              <Users className="w-3.5 h-3.5 mr-1.5" /> Feed
            </TabsTrigger>
            <TabsTrigger value="discover" className="rounded-full text-xs font-black" data-testid="tab-discover">
              <Compass className="w-3.5 h-3.5 mr-1.5" /> Discover
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-2xl" />
                ))}
              </div>
            ) : !feed || feed.posts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 bg-card/50 rounded-3xl border border-dashed border-border"
              >
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
                <h3 className="text-xl font-black mb-2">Be the First!</h3>
                <p className="text-muted-foreground text-sm font-medium max-w-xs mx-auto mb-4">
                  The community feed is empty. Share your first win and inspire others!
                </p>
                <Button onClick={() => setComposeOpen(true)} className="rounded-full font-black">
                  <Plus className="w-4 h-4 mr-2" /> Create First Post
                </Button>
              </motion.div>
            ) : (
              <AnimatePresence>
                <div className="space-y-3">
                  {feed.posts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      playerId={pid}
                      onReact={handleReact}
                      onDelete={handleDelete}
                      onViewProfile={goToProfile}
                    />
                  ))}
                </div>
              </AnimatePresence>
            )}
          </TabsContent>

          <TabsContent value="discover" className="mt-4">
            <DiscoverPanel playerId={pid} onViewProfile={goToProfile} />
          </TabsContent>
        </Tabs>

        {/* Compose sheet */}
        <ComposeSheet
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          playerId={pid}
        />

      </div>
    </Layout>
  );
}
