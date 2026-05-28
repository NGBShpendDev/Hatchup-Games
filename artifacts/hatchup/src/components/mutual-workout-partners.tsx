import { useState } from "react";
import { Dumbbell } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export type MutualPartner = {
  id: number;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  creatorBadge?: string | null;
};

const PREVIEW_LIMIT = 2;

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MutualWorkoutPartnersLine({
  partners,
  onViewProfile,
  testIdPrefix,
  className,
  iconClassName,
}: {
  partners: MutualPartner[];
  onViewProfile: (playerId: number) => void;
  testIdPrefix: string;
  className?: string;
  iconClassName?: string;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  if (partners.length === 0) return null;

  const preview = partners.slice(0, PREVIEW_LIMIT);
  const extra = partners.length - preview.length;

  const handleSelect = (id: number) => {
    setSheetOpen(false);
    onViewProfile(id);
  };

  return (
    <>
      <p
        className={className}
        data-testid={`text-${testIdPrefix}-mutual-partners`}
      >
        <Dumbbell className={iconClassName ?? "w-3 h-3 shrink-0"} />
        {preview.length > 0 && (
          <span
            className="flex -space-x-1.5 shrink-0"
            data-testid={`avatars-${testIdPrefix}-mutual-partners`}
          >
            {preview.map((p) => (
              <Avatar
                key={p.id}
                className="h-4 w-4 border border-background ring-1 ring-emerald-500/40"
                data-testid={`avatar-${testIdPrefix}-mutual-partner-${p.id}`}
              >
                {p.avatarUrl ? (
                  <AvatarImage src={p.avatarUrl} alt={p.displayName} />
                ) : null}
                <AvatarFallback className="text-[8px] font-black bg-emerald-500/20 text-emerald-200">
                  {initialsOf(p.displayName)}
                </AvatarFallback>
              </Avatar>
            ))}
          </span>
        )}
        <span className="truncate">
          <span>Workouts with </span>
          {preview.map((p, idx) => (
            <span key={p.id}>
              <button
                type="button"
                className="underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                data-testid={`link-${testIdPrefix}-mutual-partner-${p.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(p.id);
                }}
              >
                {p.displayName}
              </button>
              {idx < preview.length - 1 && <span> & </span>}
            </span>
          ))}
          {extra > 0 && (
            <>
              <span> </span>
              <button
                type="button"
                className="underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
                data-testid={`button-${testIdPrefix}-mutual-partners-more`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSheetOpen(true);
                }}
              >
                +{extra} more
              </button>
            </>
          )}
        </span>
      </p>
      <MutualWorkoutPartnersSheet
        partners={partners}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onViewProfile={handleSelect}
        testIdPrefix={testIdPrefix}
      />
    </>
  );
}

function MutualWorkoutPartnersSheet({
  partners,
  open,
  onClose,
  onViewProfile,
  testIdPrefix,
}: {
  partners: MutualPartner[];
  open: boolean;
  onClose: () => void;
  onViewProfile: (playerId: number) => void;
  testIdPrefix: string;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto rounded-t-3xl"
        data-testid={`sheet-${testIdPrefix}-mutual-partners`}
      >
        <SheetHeader>
          <SheetTitle className="text-lg font-black flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-emerald-400" />
            Workout partners
            <span className="text-xs font-bold text-muted-foreground">
              ({partners.length})
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {partners.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-muted/30 border border-border/40 rounded-2xl p-3"
              data-testid={`row-${testIdPrefix}-mutual-partner-${p.id}`}
            >
              <Avatar className="h-10 w-10 border border-emerald-500/40">
                {p.avatarUrl ? (
                  <AvatarImage src={p.avatarUrl} alt={p.displayName} />
                ) : null}
                <AvatarFallback className="font-black text-xs bg-emerald-500/15 text-emerald-200">
                  {initialsOf(p.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm truncate flex items-center gap-1.5">
                  <span className="truncate">{p.displayName}</span>
                  {p.creatorBadge ? (
                    <span
                      className="text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 shrink-0"
                      data-testid={`badge-${testIdPrefix}-mutual-partner-${p.id}-creator`}
                    >
                      {p.creatorBadge}
                    </span>
                  ) : null}
                </p>
                {p.username ? (
                  <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl font-bold text-xs h-8"
                data-testid={`button-view-${testIdPrefix}-mutual-partner-${p.id}`}
                onClick={() => onViewProfile(p.id)}
              >
                View profile
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
