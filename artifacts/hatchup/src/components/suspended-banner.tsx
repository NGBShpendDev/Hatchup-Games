import { useState } from "react";
import { ShieldAlert, Send, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlayer } from "@/lib/playerContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const APPEAL_MIN_LEN = 10;
export const APPEAL_MAX_LEN = 1000;

export const SUSPENDED_COPY = {
  title: "Your account is suspended",
  body: "A moderator has paused your ability to post, comment, react, follow, or send group messages. HatchUp is a safe, trusted, and family-friendly community — if you believe this is a mistake, you can file an appeal and our moderation team will review it.",
  cta: "Submit an appeal",
  pendingTitle: "Appeal under review",
  pendingBody: "We received your appeal and a moderator will review it soon. You'll be notified once there's a decision.",
  approvedTitle: "Appeal approved",
  approvedBody: "Your appeal was approved. If your account is still suspended, contact support — otherwise, you're good to go.",
  deniedTitle: "Appeal denied",
  deniedBody: "Your appeal was reviewed and the suspension was upheld. You can file a new appeal with additional context.",
} as const;

interface AppealRow {
  id: number;
  playerId: number;
  message: string;
  status: "pending" | "approved" | "denied" | string;
  reviewerNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function formatSuspendedSince(suspendedAt: string | null | undefined): string | null {
  if (!suspendedAt) return null;
  const d = new Date(suspendedAt);
  if (isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function SuspendedBanner({ className = "" }: { className?: string }) {
  const { player } = usePlayer();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isSuspended = !!player?.isSuspended;

  const { data: appealData } = useQuery<{ appeal: AppealRow | null }>({
    queryKey: ["my-appeal"],
    queryFn: async () => {
      const res = await fetch("/api/account/appeals/mine", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load appeal");
      return res.json();
    },
    enabled: isSuspended,
  });

  if (!isSuspended) return null;

  const since = formatSuspendedSince(player?.suspendedAt);
  const reason = player?.suspensionReason?.trim() || null;
  const appeal = appealData?.appeal ?? null;
  const hasPending = appeal?.status === "pending";

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < APPEAL_MIN_LEN) {
      toast({
        title: "Appeal too short",
        description: `Please write at least ${APPEAL_MIN_LEN} characters so we can review it.`,
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/appeals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: res.status === 409 ? "Appeal already submitted" : "Couldn't submit appeal",
          description: body?.message ?? "Please try again later.",
          variant: "destructive",
        });
        if (res.status === 409) {
          await qc.invalidateQueries({ queryKey: ["my-appeal"] });
          setOpen(false);
          setMessage("");
        }
        return;
      }
      toast({
        title: "Appeal submitted",
        description: "A moderator will review it and get back to you.",
      });
      await qc.invalidateQueries({ queryKey: ["my-appeal"] });
      setOpen(false);
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  let statusBlock: React.ReactNode = null;
  if (hasPending) {
    statusBlock = (
      <div
        className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-2"
        data-testid="block-appeal-pending"
      >
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="space-y-0.5">
          <p className="text-xs font-black text-amber-200">{SUSPENDED_COPY.pendingTitle}</p>
          <p className="text-[11px] font-medium text-amber-100/80 leading-relaxed">
            {SUSPENDED_COPY.pendingBody}
          </p>
        </div>
      </div>
    );
  } else if (appeal?.status === "denied") {
    statusBlock = (
      <div
        className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/15 p-2"
        data-testid="block-appeal-denied"
      >
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="space-y-0.5">
          <p className="text-xs font-black text-destructive">{SUSPENDED_COPY.deniedTitle}</p>
          <p className="text-[11px] font-medium text-destructive/90 leading-relaxed">
            {appeal.reviewerNote ?? SUSPENDED_COPY.deniedBody}
          </p>
        </div>
      </div>
    );
  } else if (appeal?.status === "approved") {
    statusBlock = (
      <div
        className="flex items-start gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-2"
        data-testid="block-appeal-approved"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div className="space-y-0.5">
          <p className="text-xs font-black text-emerald-200">{SUSPENDED_COPY.approvedTitle}</p>
          <p className="text-[11px] font-medium text-emerald-100/80 leading-relaxed">
            {SUSPENDED_COPY.approvedBody}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="banner-account-suspended"
      className={`flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/15 p-3 text-destructive-foreground ${className}`}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="flex-1 space-y-2">
        <p className="text-sm font-black text-destructive">{SUSPENDED_COPY.title}</p>
        {since && (
          <p
            className="text-[11px] font-black uppercase tracking-wider text-destructive/80"
            data-testid="text-suspended-since"
          >
            Suspended since {since}
          </p>
        )}
        <p className="text-xs font-medium leading-relaxed text-destructive/90">
          {SUSPENDED_COPY.body}
        </p>
        {reason && (
          <p
            className="text-xs font-medium leading-relaxed text-destructive/90 bg-destructive/10 border border-destructive/30 rounded-lg px-2 py-1.5"
            data-testid="text-suspended-reason"
          >
            <span className="font-black uppercase tracking-wider text-[10px] mr-1 text-destructive">Reason:</span>
            {reason}
          </p>
        )}

        {statusBlock}

        <div>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setOpen(true)}
            disabled={hasPending}
            data-testid="button-open-appeal"
            className="font-black"
          >
            <Send className="mr-1 h-3.5 w-3.5" />
            {hasPending ? "Appeal submitted" : SUSPENDED_COPY.cta}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setMessage(""); }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-submit-appeal">
          <DialogHeader>
            <DialogTitle>Submit an appeal</DialogTitle>
            <DialogDescription>
              Tell our moderation team why you think this suspension is a mistake.
              Be specific — a clear explanation helps us review faster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, APPEAL_MAX_LEN))}
              placeholder="I believe my account was suspended in error because…"
              rows={6}
              data-testid="textarea-appeal-message"
              disabled={submitting}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Min {APPEAL_MIN_LEN} characters</span>
              <span data-testid="text-appeal-char-count">
                {message.trim().length}/{APPEAL_MAX_LEN}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setOpen(false); setMessage(""); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || message.trim().length < APPEAL_MIN_LEN}
              data-testid="button-submit-appeal"
            >
              {submitting ? "Submitting…" : "Submit appeal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function useIsSuspended(): boolean {
  const { player } = usePlayer();
  return !!player?.isSuspended;
}
