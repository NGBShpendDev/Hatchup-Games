import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, ArrowLeft, Award, Users2, Compass } from "lucide-react";
import {
  useSearchPlayers,
  getSearchPlayersQueryKey,
} from "@workspace/api-client-react";
import { MutualWorkoutPartnersLine } from "@/components/mutual-workout-partners";
import { usePlayer } from "@/lib/playerContext";

function formatSharedGroups(groups: Array<{ id: number; name: string }>): string {
  const names = groups.map(g => g.name);
  if (names.length === 0) return "";
  const preview = names.slice(0, 2).join(" & ");
  const extra = names.length - 2;
  return extra > 0
    ? `Also in ${preview} +${extra} more with you`
    : `Also in ${preview} with you`;
}

export default function FindPlayersPage() {
  const [, setLocation] = useLocation();
  const { player } = usePlayer();
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const params = { q: debounced, limit: 20 };
  const enabled = debounced.length > 0;
  const { data, isLoading, isFetching } = useSearchPlayers(
    params,
    {
      query: {
        queryKey: getSearchPlayersQueryKey(params),
        enabled,
      },
    },
  );

  const results = (data ?? []).filter(p => p.id !== player?.id);
  const showLoading = enabled && (isLoading || (isFetching && results.length === 0));
  const showEmpty = enabled && !isLoading && !isFetching && results.length === 0;

  function viewProfile(pid: number) {
    setLocation(`/players/${pid}`);
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/social">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl"
              aria-label="Back"
              data-testid="button-find-players-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-black tracking-tight">Find Players</h1>
            <p className="text-xs text-muted-foreground font-medium">
              Search anyone in HatchUp by username or display name.
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search players by username or name..."
            className="pl-9 pr-9 h-11 rounded-2xl font-medium"
            data-testid="input-find-players-search"
            autoFocus
          />
          {input && (
            <button
              type="button"
              onClick={() => setInput("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-find-players-clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!enabled && (
          <div className="text-center py-16" data-testid="empty-find-players-prompt">
            <Compass className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-bold">Discover other players</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start typing to search the HatchUp community.
            </p>
          </div>
        )}

        {showLoading && (
          <div className="space-y-2" data-testid="loading-find-players">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="text-center py-16" data-testid="empty-find-players-results">
            <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-bold">No players found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try a different name or username.
            </p>
          </div>
        )}

        {enabled && results.length > 0 && (
          <div className="space-y-2" data-testid="list-find-players-results">
            {results.map(p => {
              const sharedGroups = p.sharedGroups ?? [];
              const mutualWorkoutPartners = p.mutualWorkoutPartners ?? [];
              return (
                <div
                  key={p.id}
                  className="flex items-start gap-3 bg-muted/30 border border-border/40 rounded-2xl p-3"
                  data-testid={`row-find-players-${p.id}`}
                >
                  <Avatar className="h-10 w-10 border border-primary/40">
                    <AvatarImage src={p.avatarUrl ?? undefined} />
                    <AvatarFallback className="font-black text-xs">
                      {(p.username ?? "?").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-black text-sm truncate">
                        {p.displayName ?? p.username}
                      </p>
                      {p.creatorBadge && (
                        <Badge className="bg-gradient-to-r from-yellow-500 to-amber-400 text-black text-[9px] font-black px-1 py-0">
                          <Award className="w-2 h-2 mr-0.5" /> Creator
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      @{p.username}
                    </p>
                    {sharedGroups.length > 0 && (
                      <p
                        className="text-[11px] text-purple-300 font-bold mt-1 flex items-center gap-1 truncate"
                        data-testid={`text-find-players-shared-groups-${p.id}`}
                      >
                        <Users2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{formatSharedGroups(sharedGroups)}</span>
                      </p>
                    )}
                    {mutualWorkoutPartners.length > 0 && (
                      <MutualWorkoutPartnersLine
                        partners={mutualWorkoutPartners}
                        onViewProfile={viewProfile}
                        testIdPrefix={`find-players-${p.id}`}
                        className="text-[11px] text-emerald-300 font-bold mt-0.5 flex items-center gap-1 truncate"
                      />
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl font-bold text-xs h-8 shrink-0"
                    data-testid={`button-view-find-players-${p.id}`}
                    onClick={() => viewProfile(p.id)}
                  >
                    View profile
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
