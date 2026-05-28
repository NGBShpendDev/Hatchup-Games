import { useState } from "react";
import { Flag, Ban, ChevronRight, X, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePlayer } from "@/lib/playerContext";

const REPORT_REASONS = [
  { key: "spam", label: "Spam or advertising" },
  { key: "harassment", label: "Harassment or bullying" },
  { key: "fake_account", label: "Fake or impersonation" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "suspicious_meetup", label: "Suspicious meetup request" },
  { key: "other", label: "Other concern" },
];

interface ReportBlockMenuProps {
  trigger: React.ReactNode;
  targetPlayerId: number;
  targetName: string;
  contentType?: string;
  contentId?: number;
  onBlocked?: () => void;
}

export function ReportBlockMenu({ trigger, targetPlayerId, targetName, contentType = "profile", contentId, onBlocked }: ReportBlockMenuProps) {
  const { playerId } = usePlayer();
  const { toast } = useToast();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReport = async () => {
    if (!selectedReason || !playerId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId: targetPlayerId,
          reason: selectedReason,
          contentType,
          contentId,
        }),
      });
      if (res.ok) {
        toast({ title: "Report submitted", description: "Our moderation team will review this shortly." });
        setReportOpen(false);
        setSelectedReason("");
      } else {
        toast({ title: "Error", description: "Could not submit report. Please try again.", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!playerId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/players/${playerId}/block`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: targetPlayerId }),
      });
      if (res.ok) {
        toast({ title: `${targetName} blocked`, description: "They can no longer see your profile or contact you." });
        setBlockOpen(false);
        onBlocked?.();
      } else {
        toast({ title: "Error", description: "Could not block user.", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border w-52">
          <DropdownMenuItem
            onClick={() => setReportOpen(true)}
            className="flex items-center gap-2 text-amber-400 focus:text-amber-400 cursor-pointer"
          >
            <Flag className="w-4 h-4" />
            Report {targetName}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setBlockOpen(true)}
            className="flex items-center gap-2 text-red-400 focus:text-red-400 cursor-pointer"
          >
            <Ban className="w-4 h-4" />
            Block {targetName}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black">
              <Flag className="w-5 h-5 text-amber-400" />
              Report {targetName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground font-medium">What's the issue?</p>
            {REPORT_REASONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setSelectedReason(r.key)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition-all text-left ${
                  selectedReason === r.key
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-border bg-background/50 text-foreground hover:border-amber-500/40"
                }`}
              >
                {r.label}
                {selectedReason === r.key && <ChevronRight className="w-4 h-4" />}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleReport}
              disabled={!selectedReason || submitting}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-black"
            >
              {submitting ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Confirm Dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              Block {targetName}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground font-medium py-2">
            {targetName} won't be able to see your profile, posts, or contact you. You can unblock them anytime in Privacy Settings.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)} className="flex-1">Cancel</Button>
            <Button
              onClick={handleBlock}
              disabled={submitting}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black"
            >
              {submitting ? "Blocking..." : "Block User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
