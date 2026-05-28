import { Share } from "react-native";
import { useCallback } from "react";

export interface PalXpLike {
  newLevel?: number | null;
  evolutionSharePrompt?: boolean | null;
  hatchlingId?: number | null;
}

export function usePalMilestoneShare() {
  return useCallback(
    async (palXpResult: PalXpLike | null | undefined, palName?: string | null) => {
      if (!palXpResult?.evolutionSharePrompt) return;
      const name = palName?.trim() || "Your Pal";
      const level = palXpResult.newLevel ?? "?";
      const message = `🎉 ${name} just reached level ${level} — an evolution milestone! #HatchUp`;
      try {
        await Share.share({ message });
      } catch {
        // Share API unavailable or dismissed — silently continue
      }
    },
    [],
  );
}
