import { useState, useRef, useEffect } from "react";
import {
  useCreatePost,
  useListHatchlings,
  getListHatchlingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Image, Camera, Sparkles } from "lucide-react";
import { POST_TYPES } from "@/components/post-card";

export function ComposeSheet({
  open,
  onClose,
  playerId,
  initialCreatureId,
  initialPostType,
  initialContent,
  initialTags,
  title,
}: {
  open: boolean;
  onClose: () => void;
  playerId: number;
  initialCreatureId?: number;
  initialPostType?: string;
  initialContent?: string;
  initialTags?: string;
  title?: string;
}) {
  const [content, setContent] = useState(initialContent ?? "");
  const [mediaUrl, setMediaUrl] = useState("");
  const [tags, setTags] = useState(initialTags ?? "");
  const [postType, setPostType] = useState(initialPostType ?? "general");
  const [creatureId, setCreatureId] = useState<string>(
    initialCreatureId != null ? String(initialCreatureId) : "none"
  );
  const [arDataUrl, setArDataUrl] = useState<string | null>(null);

  // Re-apply the initial values each time the sheet opens so the entry
  // context (e.g. opening from a Hatchling's detail page) pre-fills the
  // composer even if the user previously closed it with different state.
  useEffect(() => {
    if (!open) return;
    setContent(initialContent ?? "");
    setTags(initialTags ?? "");
    setPostType(initialPostType ?? "general");
    setCreatureId(initialCreatureId != null ? String(initialCreatureId) : "none");
    setArDataUrl(null);
  }, [open, initialContent, initialTags, initialPostType, initialCreatureId]);
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
          <SheetTitle className="text-xl font-black">{title ?? "Share Your Journey ✨"}</SheetTitle>
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
