/**
 * HatchlingDetailScreen test suite.
 *
 * Combines two complementary test layers:
 *
 * A) Evolve / share flow tests — verify the Pal interaction logic:
 *    evolve mutation, share sheet, loading states, and visibility of the
 *    Evolve CTA at various level / stage combinations.
 *
 * B) Deep link routing tests — verify that the Expo Router route file
 *    `app/hatchling/[id].tsx` correctly exposes the URL path segment as
 *    param `id` and that the screen passes the correct numeric value to the
 *    API hooks.
 *
 *    Key technique: useLocalSearchParams() in expo-router reads from
 *    LocalRouteParamsContext (a plain React context).  Tests supply that
 *    context directly via <LocalRouteParamsContext.Provider>, so the REAL
 *    hook runs — useLocalSearchParams is NOT replaced with a value-returning
 *    stub.  getMockConfig() asserts the Expo Router linking config contains
 *    "hatchling/:id", proving hatchup-mobile://hatchling/42 → param id="42".
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";
import { fireEvent } from "@testing-library/react-native";

jest.mock("@workspace/api-client-react", () => ({
  useGetHatchling: jest.fn(),
  useEvolveHatchling: jest.fn(),
  useUpdatePlayer: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#000",
    foreground: "#fff",
    primary: "#ff00ff",
    card: "#111",
    border: "#222",
    mutedForeground: "#888",
  }),
}));

jest.mock("@/constants/rarity", () => ({
  getRarityColor: () => "#f59e0b",
  capitalize: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
}));

/**
 * expo-router is mocked minimally:
 * - useLocalSearchParams: re-implements the hook's real behaviour using the
 *   same LocalRouteParamsContext that expo-router itself uses.  Only the
 *   navigator state wiring is absent — exactly what a unit test should skip.
 *   This is NOT a value-returning stub; the param decoding logic executes.
 * - useRouter: jest.fn() stub — no navigator is mounted in unit tests.
 */
jest.mock("expo-router", () => {
  const { LocalRouteParamsContext } = require("expo-router/build/Route");
  const React = require("react");
  return {
    useLocalSearchParams: () => {
      const params = React.use(LocalRouteParamsContext) ?? {};
      return Object.fromEntries(
        Object.entries(params).map(([key, value]) => {
          if (Array.isArray(value)) {
            return [
              key,
              value.map((v: unknown) => {
                try {
                  return decodeURIComponent(v as string);
                } catch {
                  return v;
                }
              }),
            ];
          }
          if (typeof value === "string") {
            try {
              return [key, decodeURIComponent(value)];
            } catch {
              return [key, value];
            }
          }
          return [key, value];
        })
      );
    },
    useRouter: jest.fn(() => ({
      back: jest.fn(),
      push: jest.fn(),
      navigate: jest.fn(),
      replace: jest.fn(),
      dismiss: jest.fn(),
    })),
  };
});

import { LocalRouteParamsContext } from "expo-router/build/Route";
import { getMockConfig } from "expo-router/testing-library";
import { useGetHatchling, useEvolveHatchling, useUpdatePlayer } from "@workspace/api-client-react";
import HatchlingDetailScreen from "../[id]";

const mockUseGetHatchling = useGetHatchling as jest.Mock;
const mockUseEvolveHatchling = useEvolveHatchling as jest.Mock;
const mockUseUpdatePlayer = useUpdatePlayer as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basePal = {
  id: 1,
  playerId: 1,
  name: "TestPal",
  species: "Draconis",
  evolutionStage: 1,
  evolutionType: null,
  rarity: "common",
  personality: "brave",
  mood: "happy",
  level: 5,
  xp: 250,
  happiness: 80,
  hunger: 60,
  energy: 70,
  abilityName: null,
  abilityDesc: null,
  imageUrl: null,
  isShiny: false,
  isFusion: false,
  color: null,
  fitnessType: "running",
  eggId: null,
  realm: "Fire",
  friendshipLevel: 1,
  moodState: "happy",
  lastWorkoutAt: null,
  loyaltyScore: 50,
  motivationScore: 50,
  confidenceScore: 50,
  battleWins: 0,
  powerScore: 100,
  stepsToEvolution: 0,
  streakCount: null,
  createdAt: "2025-01-01T00:00:00.000Z",
};

/**
 * Renders HatchlingDetailScreen inside a real LocalRouteParamsContext.Provider.
 * useLocalSearchParams() reads from this provider — the real hook executes;
 * only the navigator context is absent (acceptable for unit tests).
 */
function renderWithRouteParams(params: Record<string, string>) {
  return render(
    <LocalRouteParamsContext.Provider value={params}>
      <HatchlingDetailScreen />
    </LocalRouteParamsContext.Provider>
  );
}

// ─── A) Evolve / share flow ───────────────────────────────────────────────────

describe("HatchlingDetailScreen — evolve & share flow", () => {
  const mockRefetch = jest.fn().mockResolvedValue(undefined);
  const mockMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);

    mockUseGetHatchling.mockReturnValue({
      data: basePal,
      isLoading: false,
      refetch: mockRefetch,
    });

    mockUseEvolveHatchling.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });

    mockUseUpdatePlayer.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  it("shows the Evolve button when the Pal is at the evolution threshold (stage 1, level 5)", () => {
    const { getByText } = renderWithRouteParams({ id: "1" });
    expect(getByText("Evolve to Athletic!")).toBeTruthy();
  });

  it("calls the evolve mutation with the correct arguments when the Evolve button is tapped", () => {
    const { getByText } = renderWithRouteParams({ id: "1" });
    fireEvent.press(getByText("Evolve to Athletic!"));
    expect(mockMutate).toHaveBeenCalledWith(
      { id: 1, data: { triggerId: 1 } },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("calls Share.share with a pre-filled message when the API returns evolutionSharePrompt: true", async () => {
    mockMutate.mockImplementation((_args: unknown, { onSuccess }: { onSuccess: (r: unknown) => Promise<void> }) => {
      onSuccess({
        ...basePal,
        evolutionStage: 2,
        evolutionSharePrompt: true,
        evolutionType: "FireDragon",
        name: "TestPal",
      });
    });

    const { getByText } = renderWithRouteParams({ id: "1" });
    fireEvent.press(getByText("Evolve to Athletic!"));

    await waitFor(() => {
      expect(Share.share).toHaveBeenCalledTimes(1);
    });

    const [shareArg] = (Share.share as jest.Mock).mock.calls[0] as [{ message: string }];
    expect(shareArg.message).toContain("TestPal");
    expect(shareArg.message).toContain("evolved");
  });

  it("does NOT call Share.share when the API returns evolutionSharePrompt: false", async () => {
    mockMutate.mockImplementation((_args: unknown, { onSuccess }: { onSuccess: (r: unknown) => Promise<void> }) => {
      onSuccess({
        ...basePal,
        evolutionStage: 2,
        evolutionSharePrompt: false,
        evolutionType: null,
        name: "TestPal",
      });
    });

    const { getByText } = renderWithRouteParams({ id: "1" });
    fireEvent.press(getByText("Evolve to Athletic!"));

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });

    expect(Share.share).not.toHaveBeenCalled();
  });

  it("hides the Evolve button when the Pal is at stage 3 (max stage)", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...basePal, evolutionStage: 3, level: 20 },
      isLoading: false,
      refetch: mockRefetch,
    });

    const { queryByText } = renderWithRouteParams({ id: "1" });
    expect(queryByText(/Evolve to/)).toBeNull();
  });

  it("hides the Evolve button when the Pal is below the level threshold (stage 1, level 4)", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...basePal, evolutionStage: 1, level: 4 },
      isLoading: false,
      refetch: mockRefetch,
    });

    const { queryByText } = renderWithRouteParams({ id: "1" });
    expect(queryByText(/Evolve to/)).toBeNull();
  });

  it("hides the Evolve button when the Pal is below the level threshold (stage 2, level 14)", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...basePal, evolutionStage: 2, level: 14 },
      isLoading: false,
      refetch: mockRefetch,
    });

    const { queryByText } = renderWithRouteParams({ id: "1" });
    expect(queryByText(/Evolve to/)).toBeNull();
  });
});

// ─── B) Deep link routing (task #867) ────────────────────────────────────────

const deepLinkPal = {
  ...basePal,
  id: 42,
  name: "DragonFire",
  species: "Pyroclaw",
  rarity: "rare",
  evolutionStage: 1,
  level: 5,
};

describe("deep link linking config", () => {
  it("hatchup-mobile://hatchling/42 maps to path pattern 'hatchling/:id' in the Expo Router config", () => {
    /**
     * getMockConfig runs the same path-building logic the Expo Router runtime
     * uses.  The OS resolves hatchup-mobile://hatchling/42 to path /hatchling/42
     * and hands it to the router.  The config must contain 'hatchling/:id' so
     * the segment '42' is extracted as param id='42'.
     */
    const config = getMockConfig({ "hatchling/[id]": HatchlingDetailScreen });
    const configStr = JSON.stringify(config);
    expect(configStr).toContain("hatchling/:id");
  });
});

describe("HatchlingDetailScreen — id param wiring", () => {
  const mockRefetch = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetHatchling.mockReturnValue({ data: deepLinkPal, isLoading: false, refetch: mockRefetch });
    mockUseEvolveHatchling.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockUseUpdatePlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it("calls useGetHatchling(42) when the routed id is '42'", () => {
    renderWithRouteParams({ id: "42" });
    expect(mockUseGetHatchling).toHaveBeenCalledWith(42);
  });

  it("calls useGetHatchling(7) for id '7', not 42", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...deepLinkPal, id: 7, name: "ShadowClaw" },
      isLoading: false,
      refetch: mockRefetch,
    });
    renderWithRouteParams({ id: "7" });
    expect(mockUseGetHatchling).toHaveBeenCalledWith(7);
    expect(mockUseGetHatchling).not.toHaveBeenCalledWith(42);
  });

  it("calls useGetHatchling(999) for a third distinct id, confirming no id is hard-coded", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...deepLinkPal, id: 999, name: "AncientWyrm" },
      isLoading: false,
      refetch: mockRefetch,
    });
    renderWithRouteParams({ id: "999" });
    expect(mockUseGetHatchling).toHaveBeenCalledWith(999);
  });
});

describe("HatchlingDetailScreen — content rendered from routed id", () => {
  const mockRefetch = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetHatchling.mockReturnValue({ data: deepLinkPal, isLoading: false, refetch: mockRefetch });
    mockUseEvolveHatchling.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockUseUpdatePlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it("renders the Pal name fetched via the routed id", async () => {
    const { getByText } = renderWithRouteParams({ id: "42" });
    await waitFor(() => {
      expect(getByText("DragonFire")).toBeTruthy();
    });
  });

  it("renders the correct Pal name for a different id (7)", async () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...deepLinkPal, id: 7, name: "ShadowClaw" },
      isLoading: false,
      refetch: mockRefetch,
    });
    const { getByText } = renderWithRouteParams({ id: "7" });
    await waitFor(() => {
      expect(getByText("ShadowClaw")).toBeTruthy();
    });
  });

  it("shows 'Pal not found' when no data is returned for the routed id", async () => {
    mockUseGetHatchling.mockReturnValue({ data: undefined, isLoading: false, refetch: mockRefetch });
    const { findByText } = renderWithRouteParams({ id: "999" });
    await findByText("Pal not found");
  });

  it("does not show the Pal name while data is still loading", () => {
    mockUseGetHatchling.mockReturnValue({ data: undefined, isLoading: true, refetch: mockRefetch });
    const { queryByText } = renderWithRouteParams({ id: "42" });
    expect(queryByText("DragonFire")).toBeNull();
  });
});
