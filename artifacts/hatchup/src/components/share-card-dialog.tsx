import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Share2, Copy, ImageOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function buildPostOgImageUrl(postId: number): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/post/${postId}/og.png`;
}

export function buildPlayerOgImageUrl(username: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/player/${encodeURIComponent(username)}/og.png`;
}

export function buildPlayerShareUrl(username: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/player/${encodeURIComponent(username)}`;
}

export function buildClubOgImageUrl(clubId: number): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/club/${clubId}/og.png`;
}

export function buildClubShareUrl(clubId: number): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/club/${clubId}`;
}

export function ShareCardDialog({
  open,
  onOpenChange,
  ogImageUrl,
  shareUrl,
  shareText,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ogImageUrl: string;
  shareUrl: string;
  shareText: string;
  title?: string;
  description?: string;
}) {
  const { toast } = useToast();
  const [imgState, setImgState] = useState<"loading" | "loaded" | "error">("loading");

  // Reset the preview state when a different image URL is shown so we don't
  // briefly flash the previous card's loaded state.
  useEffect(() => {
    setImgState("loading");
  }, [ogImageUrl]);

  async function handleShare() {
    const canNativeShare =
      typeof navigator !== "undefined" &&
      typeof (navigator as any).share === "function";
    if (canNativeShare) {
      try {
        await (navigator as any).share({ title: "HatchUp", text: shareText, url: shareUrl });
        onOpenChange(false);
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    await handleCopy();
  }

  async function handleCopy() {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        toast({ title: "Link copied to clipboard! 📋", description: "Paste it anywhere to share." });
        onOpenChange(false);
        return;
      } catch {}
    }
    toast({ title: "Could not share", variant: "destructive" });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-share-card">
        <DialogHeader>
          <DialogTitle>{title ?? "Share"}</DialogTitle>
          <DialogDescription>
            {description ?? "This is exactly what your friends will see in their feed when you share."}
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30"
          style={{ aspectRatio: "1200 / 630" }}
          data-testid="share-card-preview"
        >
          {imgState === "loading" && (
            <Skeleton className="absolute inset-0 w-full h-full" />
          )}
          {imgState === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs">
              <ImageOff className="w-8 h-8 opacity-60" />
              <span>Preview unavailable — your link will still work.</span>
            </div>
          ) : (
            <img
              src={ogImageUrl}
              alt="Share card preview"
              className={`w-full h-full object-cover transition-opacity ${imgState === "loaded" ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgState("loaded")}
              onError={() => setImgState("error")}
              data-testid="img-share-card"
            />
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <Button
            variant="outline"
            onClick={handleCopy}
            className="flex-1 rounded-full font-bold"
            data-testid="button-share-card-copy"
          >
            <Copy className="w-4 h-4 mr-2" /> Copy link
          </Button>
          <Button
            onClick={handleShare}
            className="flex-1 rounded-full font-black"
            data-testid="button-share-card-share"
          >
            <Share2 className="w-4 h-4 mr-2" /> Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
