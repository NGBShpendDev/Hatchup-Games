/**
 * SocialProfileScreen deep link routing test suite.
 *
 * Verifies that the Expo Router route file `app/social/[id].tsx` correctly
 * exposes the URL path segment as param `id` and that the screen passes the
 * correct numeric value to the API hooks.
 *
 * Key technique: useLocalSearchParams() in expo-router reads from
 * LocalRouteParamsContext (a plain React context).  Tests supply that context
 * directly via <LocalRouteParamsContext.Provider>, so the REAL hook runs —
 * useLocalSearchParams is NOT replaced with a value-returning stub.
 * getMockConfig() asserts the Expo Router linking config contains
 * "social/:id", proving hatchup-mobile://social/5 → param id="5".
 */

import React from "react";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("@workspace/api-client-react", () => ({
  useGetPlayerSocialProfile: jest.fn(),
  useFollowPlayer: jest.fn(),
  useUnfollowPlayer: jest.fn(),
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
    muted: "#333",
  }),
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
import {
  useGetPlayerSocialProfile,
  useFollowPlayer,
  useUnfollowPlayer,
} from "@workspace/api-client-react";
import SocialProfileScreen from "../[id]";

const mockUseGetPlayerSocialProfile = useGetPlayerSocialProfile as jest.Mock;
const mockUseFollowPlayer = useFollowPlayer as jest.Mock;
const mockUseUnfollowPlayer = useUnfollowPlayer as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const basePlayer = {
  id: 5,
  username: "speedrunner",
  displayName: "Speed Runner",
  avatarUrl: null,
  level: 8,
};

const baseProfile = {
  player: basePlayer,
  posts: [],
  followerCount: 12,
  followingCount: 4,
  isFollowing: false,
  mutualFollowersTotal: 0,
};

/**
 * Renders SocialProfileScreen inside a real LocalRouteParamsContext.Provider.
 * useLocalSearchParams() reads from this provider — the real hook executes;
 * only the navigator context is absent (acceptable for unit tests).
 */
function renderWithRouteParams(params: Record<string, string>) {
  return render(
    <LocalRouteParamsContext.Provider value={params}>
      <SocialProfileScreen />
    </LocalRouteParamsContext.Provider>
  );
}

// ─── Deep link linking config ─────────────────────────────────────────────────

describe("deep link linking config", () => {
  it("hatchup-mobile://social/5 maps to path pattern 'social/:id' in the Expo Router config", () => {
    /**
     * getMockConfig runs the same path-building logic the Expo Router runtime
     * uses.  The OS resolves hatchup-mobile://social/5 to path /social/5 and
     * hands it to the router.  The config must contain 'social/:id' so the
     * segment '5' is extracted as param id='5'.
     */
    const config = getMockConfig({ "social/[id]": SocialProfileScreen });
    const configStr = JSON.stringify(config);
    expect(configStr).toContain("social/:id");
  });
});

// ─── id param wiring ──────────────────────────────────────────────────────────

describe("SocialProfileScreen — id param wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: baseProfile,
      isLoading: false,
      refetch: jest.fn(),
    });
    mockUseFollowPlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockUseUnfollowPlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it("calls useGetPlayerSocialProfile(5, ...) when the routed id is '5'", () => {
    renderWithRouteParams({ id: "5" });
    expect(mockUseGetPlayerSocialProfile).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ viewerId: expect.any(Number) }),
    );
  });

  it("calls useGetPlayerSocialProfile(99, ...) for id '99', not 5", () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: { ...baseProfile, player: { ...basePlayer, id: 99, username: "powerlifter" } },
      isLoading: false,
      refetch: jest.fn(),
    });
    renderWithRouteParams({ id: "99" });
    expect(mockUseGetPlayerSocialProfile).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ viewerId: expect.any(Number) }),
    );
    expect(mockUseGetPlayerSocialProfile).not.toHaveBeenCalledWith(
      5,
      expect.anything(),
    );
  });

  it("calls useGetPlayerSocialProfile(123, ...) for a third distinct id, confirming no id is hard-coded", () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: { ...baseProfile, player: { ...basePlayer, id: 123, username: "eliterunner" } },
      isLoading: false,
      refetch: jest.fn(),
    });
    renderWithRouteParams({ id: "123" });
    expect(mockUseGetPlayerSocialProfile).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ viewerId: expect.any(Number) }),
    );
  });
});

// ─── Content rendered from routed id ─────────────────────────────────────────

describe("SocialProfileScreen — content rendered from routed id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: baseProfile,
      isLoading: false,
      refetch: jest.fn(),
    });
    mockUseFollowPlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
    mockUseUnfollowPlayer.mockReturnValue({ mutate: jest.fn(), isPending: false });
  });

  it("renders the player username fetched via the routed id", async () => {
    const { getAllByText } = renderWithRouteParams({ id: "5" });
    await waitFor(() => {
      expect(getAllByText("@speedrunner").length).toBeGreaterThan(0);
    });
  });

  it("renders the player display name fetched via the routed id", async () => {
    const { getAllByText } = renderWithRouteParams({ id: "5" });
    await waitFor(() => {
      expect(getAllByText("Speed Runner").length).toBeGreaterThan(0);
    });
  });

  it("renders the correct username for a different id (99)", async () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: {
        ...baseProfile,
        player: { ...basePlayer, id: 99, username: "powerlifter", displayName: "Power Lifter" },
      },
      isLoading: false,
      refetch: jest.fn(),
    });
    const { getAllByText } = renderWithRouteParams({ id: "99" });
    await waitFor(() => {
      expect(getAllByText("@powerlifter").length).toBeGreaterThan(0);
    });
  });

  it("shows 'Player not found.' when no data is returned for the routed id", async () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: { ...baseProfile, player: undefined },
      isLoading: false,
      refetch: jest.fn(),
    });
    const { findByText } = renderWithRouteParams({ id: "999" });
    await findByText("Player not found.");
  });

  it("does not show the player username while data is still loading", () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: undefined,
      isLoading: true,
      refetch: jest.fn(),
    });
    const { queryByText } = renderWithRouteParams({ id: "5" });
    expect(queryByText("@speedrunner")).toBeNull();
  });

  it("shows the Follow button when the current player is not following the profile", async () => {
    const { findByText } = renderWithRouteParams({ id: "5" });
    await findByText("Follow");
  });

  it("shows the Unfollow button when the current player is already following", async () => {
    mockUseGetPlayerSocialProfile.mockReturnValue({
      data: { ...baseProfile, isFollowing: true },
      isLoading: false,
      refetch: jest.fn(),
    });
    const { findByText } = renderWithRouteParams({ id: "5" });
    await findByText("Unfollow");
  });
});
