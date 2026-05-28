import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Share2, X, Loader2 } from "lucide-react";
import {
  useCreatePost,
  useListFollowers,
  useShareArtifactToFriend,
} from "@workspace/api-client-react";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { isAccountSuspendedError } from "@/lib/suspendedError";

export type UnlockedArtifact = {
  id: number;
  name: string;
  rarity: string;
  lore?: string;
  imageSlug?: string;
};

interface ArtifactUnlockOverlayProps {
  queue: UnlockedArtifact[];
  onDismissAll: () => void;
}

const RARITY_THEME: Record<string, {
  glowClass: string;
  textColor: string;
  bgGradient: string;
  borderColor: string;
  particleColor: string;
  label: string;
  emoji: string;
}> = {
  Legendary: {
    glowClass: "artifact-glow-legendary",
    textColor: "text-yellow-300",
    bgGradient: "from-yellow-900/40 via-amber-900/30 to-black/60",
    borderColor: "border-yellow-400/70",
    particleColor: "bg-yellow-400",
    label: "Legendary Artifact",
    emoji: "🟡",
  },
  Mythic: {
    glowClass: "artifact-glow-mythic",
    textColor: "text-pink-300",
    bgGradient: "from-pink-900/40 via-rose-900/30 to-black/60",
    borderColor: "border-pink-400/70",
    particleColor: "bg-pink-400",
    label: "Mythic Artifact",
    emoji: "🔴",
  },
  Ancient: {
    glowClass: "artifact-glow-ancient",
    textColor: "text-orange-300",
    bgGradient: "from-orange-900/50 via-amber-900/30 to-black/60",
    borderColor: "border-orange-400/70",
    particleColor: "bg-orange-400",
    label: "Ancient Artifact",
    emoji: "🟠",
  },
  Celestial: {
    glowClass: "artifact-glow-celestial",
    textColor: "text-cyan-200",
    bgGradient: "from-cyan-900/40 via-indigo-900/30 to-black/70",
    borderColor: "border-cyan-300/70",
    particleColor: "bg-cyan-300",
    label: "Celestial Artifact",
    emoji: "🌟",
  },
};

export function ArtifactUnlockOverlay({ queue, onDismissAll }: ArtifactUnlockOverlayProps) {
  const [index, setIndex] = useState(0);
  const [sharedIds, setSharedIds] = useState<Set<number>>(new Set());
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const { player } = usePlayer();
  const { toast } = useToast();
  const createPost = useCreatePost();
  const shareToFriend = useShareArtifactToFriend();

  useEffect(() => {
    setIndex(0);
    setSharedIds(new Set());
    setFriendPickerOpen(false);
  }, [queue]);

  const current = queue[index];
  const theme = current ? RARITY_THEME[current.rarity] : undefined;
  const alreadyShared = current ? sharedIds.has(current.id) : false;

  const handleDismiss = () => {
    setFriendPickerOpen(false);
    if (index + 1 < queue.length) {
      setIndex(i => i + 1);
    } else {
      onDismissAll();
    }
  };

  const handleShareToFeed = async () => {
    if (!current || !player || alreadyShared) return;
    const text =
      `🏺 I just unlocked a ${current.rarity} artifact — ${current.name}!` +
      (current.lore ? `\n"${current.lore}"` : "");
    try {
      await createPost.mutateAsync({
        data: {
          playerId: player.id,
          content: text.slice(0, 500),
          postType: "artifact_unlock",
          metadata: {
            artifactId: current.id,
            artifactName: current.name,
            artifactRarity: current.rarity,
            artifactLore: current.lore ?? null,
          },
        },
      });
      setSharedIds(prev => new Set(prev).add(current.id));
      toast({ title: "Shared to your feed! ✨", description: `${current.name} is live for your followers.` });
    } catch (err) {
      if (isAccountSuspendedError(err)) return;
      toast({ title: "Couldn't share", description: "Try again in a moment.", variant: "destructive" });
    }
  };

  return (
    <AnimatePresence mode="wait">
      {current && theme && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { if (!friendPickerOpen) handleDismiss(); }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer p-6"
          data-testid="artifact-unlock-overlay"
        >
          {/* Background radial glow */}
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.4, opacity: 0.55 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className={`absolute inset-0 m-auto w-[80vmin] h-[80vmin] rounded-full blur-3xl bg-gradient-radial ${theme.bgGradient}`}
            style={{
              background: `radial-gradient(circle, ${
                current.rarity === "Celestial" ? "rgba(34,211,238,0.45)"
                : current.rarity === "Ancient" ? "rgba(249,115,22,0.45)"
                : current.rarity === "Mythic" ? "rgba(236,72,153,0.45)"
                : "rgba(234,179,8,0.45)"
              } 0%, transparent 70%)`,
            }}
          />

          {/* Particle burst */}
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              className={`absolute w-2 h-2 rounded-full ${theme.particleColor}`}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1.2, 0],
                x: Math.cos((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                y: Math.sin((i / 24) * Math.PI * 2) * (180 + Math.random() * 80),
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.4, delay: 0.2 + (i % 6) * 0.05, ease: "easeOut" }}
              style={{ left: "50%", top: "50%" }}
            />
          ))}

          {/* Sparkle floats */}
          {Array.from({ length: 10 }).map((_, i) => (
            <motion.div
              key={`spark-${i}`}
              className={`absolute ${theme.textColor}`}
              initial={{
                opacity: 0,
                x: (Math.random() - 0.5) * 400,
                y: 200 + Math.random() * 100,
                scale: 0.4 + Math.random() * 0.6,
              }}
              animate={{
                opacity: [0, 1, 0],
                y: -300 - Math.random() * 100,
                rotate: 360,
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                delay: Math.random() * 1.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
              style={{ left: "50%", top: "50%" }}
            >
              <Sparkles className="w-4 h-4" />
            </motion.div>
          ))}

          <motion.div
            initial={{ scale: 0.4, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -30 }}
            transition={{ type: "spring", stiffness: 180, damping: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 text-center max-w-md w-full cursor-default"
          >
            {/* Rarity label */}
            <motion.p
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={`font-black text-xs uppercase tracking-[0.3em] mb-3 ${theme.textColor}`}
            >
              {theme.emoji} {theme.label} Unlocked
            </motion.p>

            {/* Artifact medallion */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 150, damping: 12 }}
              className={`relative mx-auto w-40 h-40 rounded-full bg-gradient-to-br ${theme.bgGradient} border-4 ${theme.borderColor} ${theme.glowClass} flex items-center justify-center mb-6`}
            >
              <motion.div
                animate={{ rotate: [0, 6, -6, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                className="text-7xl select-none drop-shadow-[0_0_18px_rgba(255,255,255,0.5)]"
              >
                {theme.emoji === "🌟" ? "✨" : "🏺"}
              </motion.div>
            </motion.div>

            {/* Name */}
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="font-black text-3xl text-white mb-3 drop-shadow-[0_0_18px_rgba(255,255,255,0.4)]"
              data-testid="artifact-unlock-name"
            >
              {current.name}
            </motion.h2>

            {/* Lore */}
            {current.lore && (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.75 }}
                className="text-sm text-white/80 italic leading-relaxed px-2 mb-6"
                data-testid="artifact-unlock-lore"
              >
                "{current.lore}"
              </motion.p>
            )}

            {/* Share CTAs */}
            {player && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
                className="flex gap-2 justify-center mb-3"
              >
                <Button
                  onClick={(e) => { e.stopPropagation(); handleShareToFeed(); }}
                  disabled={createPost.isPending || alreadyShared}
                  size="sm"
                  className={`gap-1.5 font-bold ${alreadyShared ? "bg-white/10 text-white/70" : `bg-white/15 hover:bg-white/25 text-white border ${theme.borderColor}`}`}
                  data-testid="button-share-artifact-feed"
                >
                  {createPost.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                  {alreadyShared ? "Shared to feed" : "Share to feed"}
                </Button>
                <Button
                  onClick={(e) => { e.stopPropagation(); setFriendPickerOpen(true); }}
                  disabled={shareToFriend.isPending}
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 font-bold bg-transparent hover:bg-white/10 text-white border ${theme.borderColor}`}
                  data-testid="button-share-artifact-friend"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send to a friend
                </Button>
              </motion.div>
            )}

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.4 }}
              className="space-y-1"
            >
              {queue.length > 1 && (
                <p className={`text-xs font-black uppercase tracking-widest ${theme.textColor}`}>
                  {index + 1} / {queue.length}
                </p>
              )}
              <p className="text-[11px] text-white/60 uppercase tracking-wider">
                Tap anywhere to {index + 1 < queue.length ? "see next reward" : "continue"}
              </p>
            </motion.div>
          </motion.div>

          {friendPickerOpen && current && player && (
            <FriendPicker
              artifact={current}
              theme={theme}
              onClose={() => setFriendPickerOpen(false)}
              onSent={() => {
                setFriendPickerOpen(false);
                toast({ title: "Sent! 📨", description: `${current.name} is on its way.` });
              }}
              playerId={player.id}
              sendingMutation={shareToFriend}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FriendPicker({
  artifact,
  theme,
  onClose,
  onSent,
  playerId,
  sendingMutation,
}: {
  artifact: UnlockedArtifact;
  theme: { borderColor: string; textColor: string };
  onClose: () => void;
  onSent: () => void;
  playerId: number;
  sendingMutation: ReturnType<typeof useShareArtifactToFriend>;
}) {
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const { toast } = useToast();
  const { data, isLoading } = useListFollowers(playerId, { limit: 50 });

  const followers = useMemo(() => {
    const list = data?.players ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p =>
      (p.displayName?.toLowerCase().includes(q) ?? false) ||
      p.username.toLowerCase().includes(q),
    );
  }, [data, search]);

  const handleSend = async (recipientId: number) => {
    if (sendingMutation.isPending) return;
    setSendingId(recipientId);
    try {
      await sendingMutation.mutateAsync({
        data: {
          recipientId,
          artifactId: artifact.id,
          artifactName: artifact.name,
          artifactRarity: artifact.rarity,
          artifactLore: artifact.lore ?? null,
          message: message.trim() ? message.trim() : null,
        },
      });
      onSent();
    } catch (err: any) {
      if (isAccountSuspendedError(err)) { setSendingId(null); return; }
      const status = err?.response?.status;
      const description = status === 403
        ? "You can only send to people you follow or who follow you."
        : status === 422
        ? "That message doesn't meet our community guidelines."
        : "Try again in a moment.";
      toast({ title: "Couldn't send", description, variant: "destructive" });
      setSendingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      data-testid="artifact-share-friend-picker"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl border ${theme.borderColor} bg-zinc-950/95 p-4 space-y-3 max-h-[80vh] flex flex-col cursor-default`}
      >
        <div className="flex items-center justify-between">
          <h3 className={`font-black text-sm uppercase tracking-wider ${theme.textColor}`}>
            Send {artifact.name}
          </h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-1"
            aria-label="Close"
            data-testid="button-close-friend-picker"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a note (optional)"
          maxLength={200}
          className="bg-white/5 border-white/10 text-white text-sm placeholder:text-white/40"
          data-testid="input-share-message"
        />

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search followers"
          className="bg-white/5 border-white/10 text-white text-sm placeholder:text-white/40"
          data-testid="input-share-friend-search"
        />

        <div className="flex-1 overflow-y-auto -mx-1 space-y-1 min-h-[120px]">
          {isLoading && <p className="text-xs text-white/50 text-center py-6">Loading…</p>}
          {!isLoading && followers.length === 0 && (
            <p className="text-xs text-white/50 text-center py-6">
              No followers yet — your artifact still looks great on your feed.
            </p>
          )}
          {followers.map(f => {
            const isSending = sendingId === f.id && sendingMutation.isPending;
            return (
              <button
                key={f.id}
                onClick={() => handleSend(f.id)}
                disabled={sendingMutation.isPending}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/10 transition-colors text-left disabled:opacity-50"
                data-testid={`button-send-artifact-to-${f.id}`}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={f.avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-white/10 text-white text-xs">
                    {(f.displayName ?? f.username).substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{f.displayName ?? f.username}</p>
                  <p className="text-[11px] text-white/50 truncate">@{f.username}</p>
                </div>
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white/70" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
