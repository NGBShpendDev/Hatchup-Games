import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useUser } from "@clerk/react";

export type PlayerProfile = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  xp: number;
  coins: number;
  rank: string;
  rankScore: number;
  totalWins: number;
  totalMatches: number;
  currentStreak: number;
  fitnessXp: number;
  totalSteps: number;
  fitnessRealm: string;
  waterCups: number;
  dailyStepGoal: number;
  passiveXpSinceLastVisit: number;
  clerkId: string | null;
  // Accessibility & progression
  fitnessLevel: string;
  ageRange: string;
  identityPath: string | null;
  accessibilityMode: string;
  familyGroupId: number | null;
  onboardingComplete: boolean;
  streakAtRisk: boolean;
  recoveryMessage: string | null;
};

type PlayerContextValue = {
  player: PlayerProfile | null;
  playerId: number | null;
  isLoading: boolean;
  needsProfile: boolean;
  needsOnboarding: boolean;
  createProfile: (username: string, displayName: string) => Promise<void>;
  completeOnboarding: () => void;
  refetch: () => Promise<void>;
  acknowledgePassiveXp: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const [player, setPlayer] = useState<PlayerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);

  const fetchPlayer = async () => {
    if (!user) {
      setPlayer(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/players/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPlayer(data);
        setNeedsProfile(false);
      } else if (res.status === 404) {
        setNeedsProfile(true);
        setPlayer(null);
      }
    } catch {
      setNeedsProfile(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      fetchPlayer();
    }
  }, [isLoaded, user?.id]);

  const createProfile = async (username: string, displayName: string) => {
    const res = await fetch("/api/players/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, displayName }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to create profile");
    }
    const data = await res.json();
    setPlayer(data);
    setNeedsProfile(false);
  };

  const completeOnboarding = () => {
    setPlayer(prev => prev ? { ...prev, onboardingComplete: true } : null);
  };

  const acknowledgePassiveXp = async () => {
    if (!player) return;
    await fetch("/api/health/acknowledge-passive-xp", {
      method: "POST",
      credentials: "include",
    });
    setPlayer(prev => prev ? { ...prev, passiveXpSinceLastVisit: 0 } : null);
  };

  const needsOnboarding = !!player && !player.onboardingComplete;

  return (
    <PlayerContext.Provider
      value={{
        player,
        playerId: player?.id ?? null,
        isLoading,
        needsProfile,
        needsOnboarding,
        createProfile,
        completeOnboarding,
        refetch: fetchPlayer,
        acknowledgePassiveXp,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside PlayerProvider");
  return ctx;
}
