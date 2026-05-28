import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetHatchlingQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { ComposeSheet } from "@/components/compose-sheet";
import { usePlayer } from "@/lib/playerContext";

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
  const { player } = usePlayer();
  const [share, setShare] = useState<ShareState | null>(null);
  const [open, setOpen] = useState(false);
  // Track mutation ids we've already handled so the same success transition
  // doesn't surface duplicate toasts when the cache emits subsequent
  // updates for the same mutation.
  const seenRef = useRef<Set<number>>(new Set());

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
    <EvolutionShareContext.Provider value={{ promptShare }}>
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
