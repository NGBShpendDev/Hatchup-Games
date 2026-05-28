import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetHatchlingQueryKey,
  getListHatchlingsQueryKey,
  useEvolveHatchling,
  useListHatchlings,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ComposeSheet } from "@/components/compose-sheet";
import { usePlayer } from "@/lib/playerContext";

// Level thresholds at which a Pal should auto-evolve to the next stage.
// Stage 1 → 2 at level 5, Stage 2 → 3 at level 15.
const AUTO_EVOLVE_LEVEL_FOR_STAGE: Record<number, number> = { 1: 5, 2: 15 };

export function autoEvolveThresholdForStage(stage: number): number | null {
  return AUTO_EVOLVE_LEVEL_FOR_STAGE[stage] ?? null;
}

export function shouldAutoEvolve(stage: number, level: number): boolean {
  const threshold = AUTO_EVOLVE_LEVEL_FOR_STAGE[stage];
  return threshold != null && level >= threshold;
}

// A real "level-up transition" past the stage's threshold — used by both the
// auto-evolve watcher and the explicit compete/event triggers so a Pal only
// evolves when its level actually crosses the bar (no free evolutions from
// repeated clicks or unrelated cache updates).
export function crossedEvolveThreshold(
  stage: number,
  prevLevel: number,
  newLevel: number,
): boolean {
  const threshold = AUTO_EVOLVE_LEVEL_FOR_STAGE[stage];
  if (threshold == null) return false;
  return prevLevel < threshold && newLevel >= threshold;
}

const STAGE_NAMES: Record<number, string> = {
  1: "Cute",
  2: "Athletic",
  3: "Legendary",
};

type EvolveResult = {
  id?: number;
  name?: string;
  evolutionStage?: number;
  level?: number;
  xp?: number;
  realm?: string;
  imageUrl?: string | null;
  evolutionType?: string | null;
};

type EvolvePrev = {
  name?: string;
  evolutionStage?: number;
  level?: number;
  xp?: number;
  realm?: string;
  imageUrl?: string | null;
  evolutionType?: string | null;
};

type ShareState = {
  hatchlingId: number;
  hatchlingName: string;
  content: string;
  metadata: Record<string, unknown>;
};

type EvolutionShareContextValue = {
  // Allow non-mutation call sites (e.g. server-driven auto-evolves surfaced
  // through other channels) to trigger the same prompt manually.
  promptShare: (input: { prev: EvolvePrev | null; result: EvolveResult }) => void;
  // Trigger an evolution for a Pal if it has earned the next stage. Used by
  // compete results, event reward claims, and auto-evolve-on-level-up to fan
  // the evolution celebration out from any flow that surfaces "your Pal just
  // crossed the bar". The Pal must already meet its stage's level threshold —
  // we never grant an unearned evolution from a UI click.
  triggerEvolutionIfEligible: (input: {
    hatchlingId: number;
    evolutionStage?: number | null;
    level?: number | null;
    triggerId?: number;
  }) => void;
  // Surface a share prompt specifically for a level-5 or level-15 XP
  // milestone (detected server-side via shouldTriggerSharePrompt). Distinct
  // from a stage-evolution share — this fires from any XP-awarding flow that
  // returns evolutionSharePrompt: true, before the auto-evolve mutation runs.
  promptLevelMilestoneShare: (input: {
    hatchlingId: number;
    hatchlingName: string;
    newLevel: number;
  }) => void;
};

const EvolutionShareContext = createContext<EvolutionShareContextValue | null>(null);

export function useEvolutionShare(): EvolutionShareContextValue {
  const ctx = useContext(EvolutionShareContext);
  if (!ctx) throw new Error("useEvolutionShare must be used within EvolutionShareProvider");
  return ctx;
}

function buildShare(prev: EvolvePrev | null, result: EvolveResult): ShareState | null {
  const hatchlingId = result.id ?? null;
  const hatchlingName = result.name ?? prev?.name ?? "Your Pal";
  if (hatchlingId == null) return null;

  const preStage = prev?.evolutionStage ?? Math.max(1, (result.evolutionStage ?? 2) - 1);
  const newStage = result.evolutionStage ?? preStage + 1;
  const preLevel = prev?.level ?? Math.max(1, (result.level ?? 3) - 2);
  const newLevel = result.level ?? preLevel + 2;
  const preXp = prev?.xp ?? Math.max(0, (result.xp ?? 500) - 500);
  const newXp = result.xp ?? preXp + 500;
  const realm = result.realm ?? prev?.realm;
  const imageUrl = result.imageUrl ?? prev?.imageUrl ?? undefined;
  const evolutionType = result.evolutionType ?? prev?.evolutionType ?? undefined;
  const toStageName = STAGE_NAMES[newStage];
  const fromStageName = STAGE_NAMES[preStage];

  const headline = evolutionType
    ? `✨ ${hatchlingName} evolved into ${evolutionType}!`
    : `✨ ${hatchlingName} just evolved!`;
  const stageLine = toStageName
    ? `Stage ${preStage} → Stage ${newStage} (${toStageName})`
    : `Stage ${preStage} → Stage ${newStage}`;

  return {
    hatchlingId,
    hatchlingName,
    content: `${headline}\n${stageLine}`,
    metadata: {
      hatchlingId,
      hatchlingName,
      fromStage: preStage,
      toStage: newStage,
      ...(fromStageName ? { fromStageName } : {}),
      ...(toStageName ? { toStageName } : {}),
      ...(realm ? { realm } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      statDeltas: {
        level: newLevel - preLevel,
        xp: newXp - preXp,
      },
    },
  };
}

export function EvolutionShareProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { player, playerId } = usePlayer();
  const evolveMutation = useEvolveHatchling();
  const [share, setShare] = useState<ShareState | null>(null);
  const [open, setOpen] = useState(false);
  // De-dupe evolution requests so repeated trigger calls for the same Pal
  // (e.g. a level-up watcher firing on every cache update) only kick off one
  // evolve mutation per stage transition.
  const inFlightRef = useRef<Set<number>>(new Set());
  // Track previous levels for the player's Pals so the auto-evolve watcher
  // only fires on an actual level-up, not on initial cache hydration.
  const prevLevelsRef = useRef<Map<number, number> | null>(null);
  // Track mutation ids we've already handled so the same success transition
  // doesn't surface duplicate toasts when the cache emits subsequent
  // updates for the same mutation.
  const seenRef = useRef<Set<number>>(new Set());

  const pid = playerId ?? 0;
  // Watch the player's Pals so any level update that crosses an evolution
  // threshold (e.g. a fitness log or competition reward bumping level past 5
  // or 15) fans out into the shared evolution celebration.
  const { data: playerHatchlings } = useListHatchlings(
    { playerId: pid },
    { query: { enabled: !!playerId, queryKey: getListHatchlingsQueryKey({ playerId: pid }) } },
  );

  const promptLevelMilestoneShare = useCallback<
    EvolutionShareContextValue["promptLevelMilestoneShare"]
  >(({ hatchlingId, hatchlingName, newLevel }) => {
    if (player?.isSuspended) return;
    const content = `🎉 ${hatchlingName} just reached level ${newLevel} — an evolution milestone! #HatchUp`;
    const built: ShareState = {
      hatchlingId,
      hatchlingName,
      content,
      metadata: { hatchlingId, hatchlingName, newLevel, milestone: true },
    };
    setShare(built);
    toast({
      title: `${hatchlingName} hit level ${newLevel}!`,
      description: `Evolution milestone reached. Share this moment with friends!`,
      action: (
        <ToastAction
          altText="Share this milestone"
          onClick={() => {
            setShare(built);
            setOpen(true);
          }}
          data-testid="toast-action-share-milestone"
        >
          Share milestone!
        </ToastAction>
      ),
    });
  }, [toast, player?.isSuspended]);

  const promptShare = useCallback<EvolutionShareContextValue["promptShare"]>(({ prev, result }) => {
    if (player?.isSuspended) return;
    const built = buildShare(prev, result);
    if (!built) return;
    setShare(built);
    toast({
      title: "Evolution Complete!",
      description: `${built.hatchlingName} reached ${
        STAGE_NAMES[(built.metadata.toStage as number) ?? 0]
          ? `Stage ${built.metadata.toStage} (${STAGE_NAMES[built.metadata.toStage as number]})`
          : `Stage ${built.metadata.toStage}`
      }. Share the moment!`,
      action: (
        <ToastAction
          altText="Share this evolution"
          onClick={() => {
            setShare(built);
            setOpen(true);
          }}
          data-testid="toast-action-share-evolution"
        >
          Share this evolution!
        </ToastAction>
      ),
    });
  }, [toast, player?.isSuspended]);

  const triggerEvolutionIfEligible = useCallback<
    EvolutionShareContextValue["triggerEvolutionIfEligible"]
  >(({ hatchlingId, evolutionStage, level, triggerId }) => {
    if (!hatchlingId) return;
    if (player?.isSuspended) return;
    const stage = evolutionStage ?? 1;
    if (stage >= 3) return;
    // Only evolve when the Pal has already earned its next stage by hitting
    // the level threshold. UI clicks (race finish, battle win, Join Event)
    // never grant a free evolution — they only surface a celebration the
    // player's progression already paid for.
    const lvl = level ?? 1;
    if (!shouldAutoEvolve(stage, lvl)) return;
    if (inFlightRef.current.has(hatchlingId)) return;
    inFlightRef.current.add(hatchlingId);
    evolveMutation.mutate(
      { id: hatchlingId, data: { triggerId: triggerId ?? 1 } },
      {
        onSettled: () => {
          inFlightRef.current.delete(hatchlingId);
        },
      },
    );
  }, [evolveMutation, player?.isSuspended]);

  // Auto-evolve on level up — when any of the player's Pals crosses an
  // evolution threshold and hasn't already moved up, kick off the evolve
  // mutation. The mutation cache subscriber below then surfaces the shared
  // share prompt just like a manual evolution would.
  useEffect(() => {
    if (!playerHatchlings) return;
    const next = new Map<number, number>();
    for (const h of playerHatchlings) {
      if (typeof h.id !== "number") continue;
      next.set(h.id, h.level ?? 1);
    }
    const prev = prevLevelsRef.current;
    prevLevelsRef.current = next;
    // Skip the very first hydration so we don't fire for pre-existing state.
    if (prev == null) return;
    for (const h of playerHatchlings) {
      if (typeof h.id !== "number") continue;
      const prevLevel = prev.get(h.id);
      const newLevel = h.level ?? 1;
      if (prevLevel == null) continue;
      const stage = h.evolutionStage ?? 1;
      // Strict transition: only fire when this update is the level-up that
      // crossed the threshold for the Pal's current stage. This prevents the
      // post-evolve refetch (which lands at level+2, stage+1) from chaining
      // another evolve in the same progression step.
      if (crossedEvolveThreshold(stage, prevLevel, newLevel)) {
        triggerEvolutionIfEligible({
          hatchlingId: h.id,
          evolutionStage: stage,
          level: newLevel,
        });
      }
    }
  }, [playerHatchlings, triggerEvolutionIfEligible]);

  useEffect(() => {
    const cache = qc.getMutationCache();
    const unsub = cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (event.action?.type !== "success") return;
      const mutation = event.mutation;
      const key = mutation.options.mutationKey;
      if (!Array.isArray(key) || key[0] !== "evolveHatchling") return;
      if (seenRef.current.has(mutation.mutationId)) return;
      seenRef.current.add(mutation.mutationId);

      const variables = mutation.state.variables as { id?: number } | undefined;
      const result = mutation.state.data as EvolveResult | undefined;
      if (!result) return;
      const id = variables?.id ?? result.id;
      const prev = id != null
        ? (qc.getQueryData(getGetHatchlingQueryKey(id)) as EvolvePrev | undefined) ?? null
        : null;
      promptShare({ prev, result });
    });
    return unsub;
  }, [qc, promptShare]);

  return (
    <EvolutionShareContext.Provider value={{ promptShare, triggerEvolutionIfEligible, promptLevelMilestoneShare }}>
      {children}
      {player && share && (
        <ComposeSheet
          open={open}
          onClose={() => {
            setOpen(false);
            setShare(null);
          }}
          playerId={player.id}
          initialCreatureId={share.hatchlingId}
          initialPostType="evolution_reveal"
          initialContent={share.content}
          initialMetadata={share.metadata}
          title={`Celebrate ${share.hatchlingName}'s evolution ✨`}
        />
      )}
    </EvolutionShareContext.Provider>
  );
}
