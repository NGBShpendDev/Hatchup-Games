import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Send, Clock, CheckCircle2, XCircle, LogOut, Mail } from "lucide-react";
import { useClerk } from "@clerk/react";
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
import {
  APPEAL_MIN_LEN,
  APPEAL_MAX_LEN,
  SUSPENDED_COPY,
  formatSuspendedSince,
} from "@/components/suspended-banner";

const SUPPORT_EMAIL = "support@hatchup.app";

interface SuspensionInfo {
  isSuspended: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  suspendedByAdmin: { id: number; username: string; displayName: string | null } | null;
}

interface AppealRow {
  id: number;
  playerId: number;
  message: string;
  status: "pending" | "approved" | "denied" | string;
  reviewerNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function SuspendedScreen() {
  const { player } = usePlayer();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Prefer the dedicated suspension snapshot so we always show the latest
  // recorded reason/date even if the cached player object is stale.
  const { data: suspension } = useQuery<SuspensionInfo>({
    queryKey: ["my-suspension"],
    queryFn: async () => {
      const res = await fetch("/api/players/me/suspension", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load suspension");
      return res.json();
    },
  });

  const { data: appealData } = useQuery<{ appeal: AppealRow | null }>({
    queryKey: ["my-appeal"],
    queryFn: async () => {
      const res = await fetch("/api/account/appeals/mine", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load appeal");
      return res.json();
    },
  });

  const suspendedAt = suspension?.suspendedAt ?? player?.suspendedAt ?? null;
  const since = formatSuspendedSince(suspendedAt);
  const reason =
    (suspension?.suspensionReason ?? player?.suspensionReason ?? "").trim() || null;
  const adminLabel = suspension?.suspendedByAdmin
    ? suspension.suspendedByAdmin.displayName || `@${suspension.suspendedByAdmin.username}`
    : null;
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
        className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3"
        data-testid="block-appeal-pending"
      >
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <div className="space-y-1">
          <p className="text-sm font-black text-amber-200">{SUSPENDED_COPY.pendingTitle}</p>
          <p className="text-xs font-medium text-amber-100/80 leading-relaxed">
            {SUSPENDED_COPY.pendingBody}
          </p>
        </div>
      </div>
    );
  } else if (appeal?.status === "denied") {
    statusBlock = (
      <div
        className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/15 p-3"
        data-testid="block-appeal-denied"
      >
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-black text-destructive">{SUSPENDED_COPY.deniedTitle}</p>
          <p className="text-xs font-medium text-destructive/90 leading-relaxed">
            {appeal.reviewerNote ?? SUSPENDED_COPY.deniedBody}
          </p>
        </div>
      </div>
    );
  } else if (appeal?.status === "approved") {
    statusBlock = (
      <div
        className="flex items-start gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-3"
        data-testid="block-appeal-approved"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div className="space-y-1">
          <p className="text-sm font-black text-emerald-200">{SUSPENDED_COPY.approvedTitle}</p>
          <p className="text-xs font-medium text-emerald-100/80 leading-relaxed">
            {SUSPENDED_COPY.approvedBody}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="suspended-screen-title"
      data-testid="screen-account-suspended"
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[#050508] px-4 py-8"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-destructive/40 bg-gradient-to-b from-[#1a0a14] to-[#0d0d14] p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/20">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1
              id="suspended-screen-title"
              className="text-xl font-black text-destructive"
            >
              {SUSPENDED_COPY.title}
            </h1>
            {since && (
              <p
                className="mt-0.5 text-[11px] font-black uppercase tracking-wider text-destructive/80"
                data-testid="text-suspended-since"
              >
                Suspended since {since}
                {adminLabel ? ` · by ${adminLabel}` : ""}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm font-medium leading-relaxed text-destructive-foreground/90">
          {SUSPENDED_COPY.body}
        </p>

        {reason ? (
          <div
            className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2.5"
            data-testid="text-suspended-reason"
          >
            <p className="text-[10px] font-black uppercase tracking-wider text-destructive">
              Reason recorded by moderator
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-destructive-foreground/95">
              {reason}
            </p>
          </div>
        ) : (
          <div
            className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5"
            data-testid="text-suspended-no-reason"
          >
            <p className="text-xs font-medium leading-relaxed text-white/70">
              No specific reason was recorded. File an appeal and our moderation team will look into your account.
            </p>
          </div>
        )}

        {statusBlock && <div className="mt-4">{statusBlock}</div>}

        <div className="mt-5 flex flex-col gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setOpen(true)}
            disabled={hasPending}
            data-testid="button-open-appeal"
            className="w-full font-black"
          >
            <Send className="mr-2 h-4 w-4" />
            {hasPending ? "Appeal submitted" : SUSPENDED_COPY.cta}
          </Button>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
              `HatchUp suspension appeal — @${player?.username ?? ""}`,
            )}`}
            data-testid="link-contact-support"
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white/90 hover:bg-white/10"
          >
            <Mail className="h-4 w-4" />
            Email support
          </a>
          <Button
            type="button"
            variant="ghost"
            onClick={() => signOut()}
            data-testid="button-suspended-sign-out"
            className="w-full font-bold text-white/70 hover:text-white"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
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
