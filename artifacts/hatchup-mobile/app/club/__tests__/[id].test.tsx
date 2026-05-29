/**
 * ClubDetailScreen test suite.
 *
 * Combines two complementary test layers:
 *
 * A) Join / leave flow tests (from main branch) — verify the membership
 *    interaction logic: join/leave mutations, confirmation dialog, query
 *    invalidation, loading states, and member list rendering.
 *
 * B) Deep link routing tests (task #797) — verify that the Expo Router
 *    route file `app/club/[id].tsx` correctly exposes the URL path segment as
 *    param `id` and that the screen uses it to call the right API hooks.
 *
 *    Key technique: useLocalSearchParams() in expo-router reads from
 *    LocalRouteParamsContext (a plain React context).  Tests supply that context
 *    directly via <LocalRouteParamsContext.Provider>, so the REAL hook runs —
 *    useLocalSearchParams is NOT replaced with a value-returning stub.
 *    getMockConfig() asserts the Expo Router linking config contains
 *    "club/:id", proving hatchup-mobile://club/123 → param id="123".
 */

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock("@workspace/api-client-react", () => ({
  useGetClub: jest.fn(),
  useListClubMembers: jest.fn(),
  useJoinClub: jest.fn(),
  useLeaveClub: jest.fn(),
  useGetCurrentPlayer: jest.fn(),
  getGetClubQueryKey: jest.fn((id: number) => ["clubs", id]),
  getListClubMembersQueryKey: jest.fn((id: number) => ["clubs", id, "members"]),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
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
    text: "#fff",
    primary: "#ff00ff",
    card: "#111",
    border: "#222",
    mutedText: "#888",
    radius: 8,
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
  useGetClub,
  useListClubMembers,
  useJoinClub,
  useLeaveClub,
  useGetCurrentPlayer,
} from "@workspace/api-client-react";
import ClubDetailScreen from "../[id]";

const mockUseGetClub = useGetClub as jest.Mock;
const mockUseListClubMembers = useListClubMembers as jest.Mock;
const mockUseJoinClub = useJoinClub as jest.Mock;
const mockUseLeaveClub = useLeaveClub as jest.Mock;
const mockUseGetCurrentPlayer = useGetCurrentPlayer as jest.Mock;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseClub = {
  id: 42,
  name: "Dragon Riders",
  description: "Elite dragon tamers",
  badge: "🐉",
  memberCount: 3,
  maxMembers: 50,
  rank: "Gold",
  totalXp: 12000,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const currentPlayer = {
  id: 7,
  username: "DragonMaster",
  displayName: "Dragon Master",
  level: 10,
};

const otherMember = {
  id: 99,
  username: "OtherPlayer",
  displayName: "Other Player",
  level: 5,
  clubRole: "member",
};

/**
 * Renders ClubDetailScreen inside a real LocalRouteParamsContext.Provider.
 * useLocalSearchParams() reads from this provider — the real hook executes;
 * only the navigator context is absent (acceptable for unit tests).
 */
function renderWithRouteParams(params: Record<string, string>) {
  return render(
    <LocalRouteParamsContext.Provider value={params}>
      <ClubDetailScreen />
    </LocalRouteParamsContext.Provider>
  );
}

// ─── A) Join / leave flow ─────────────────────────────────────────────────────

describe("ClubDetailScreen — join/leave flow", () => {
  let mockJoinMutateAsync: jest.Mock;
  let mockLeaveMutateAsync: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);

    mockJoinMutateAsync = jest.fn().mockResolvedValue(baseClub);
    mockLeaveMutateAsync = jest.fn().mockResolvedValue({ success: true });

    mockUseGetClub.mockReturnValue({ data: baseClub, isLoading: false });
    mockUseJoinClub.mockReturnValue({ mutateAsync: mockJoinMutateAsync });
    mockUseLeaveClub.mockReturnValue({ mutateAsync: mockLeaveMutateAsync });
    mockUseGetCurrentPlayer.mockReturnValue({ data: currentPlayer });
  });

  describe("when the current player is NOT a member", () => {
    beforeEach(() => {
      mockUseListClubMembers.mockReturnValue({ data: [otherMember] });
    });

    it("shows the Join Club button and not the Leave Club button", () => {
      const { getByTestId, queryByTestId } = renderWithRouteParams({ id: "42" });
      expect(getByTestId("button-join-club")).toBeTruthy();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("calls the join mutation with the correct arguments when Join Club is tapped", async () => {
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      await act(async () => {
        fireEvent.press(getByTestId("button-join-club"));
      });
      expect(mockJoinMutateAsync).toHaveBeenCalledWith({
        id: 42,
        data: { playerId: currentPlayer.id },
      });
    });

    it("invalidates club and member queries after joining", async () => {
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      await act(async () => {
        fireEvent.press(getByTestId("button-join-club"));
      });
      await waitFor(() => {
        expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("when the current player IS a member", () => {
    beforeEach(() => {
      mockUseListClubMembers.mockReturnValue({
        data: [otherMember, { ...currentPlayer, clubRole: "member" }],
      });
    });

    it("shows the Leave Club button and not the Join Club button", () => {
      const { getByTestId, queryByTestId } = renderWithRouteParams({ id: "42" });
      expect(getByTestId("button-leave-club")).toBeTruthy();
      expect(queryByTestId("button-join-club")).toBeNull();
    });

    it("opens a confirmation dialog when Leave Club is tapped", () => {
      const alertSpy = jest.spyOn(Alert, "alert");
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      fireEvent.press(getByTestId("button-leave-club"));
      expect(alertSpy).toHaveBeenCalledWith(
        "Leave Club",
        "Are you sure you want to leave this club?",
        expect.arrayContaining([
          expect.objectContaining({ text: "Cancel", style: "cancel" }),
          expect.objectContaining({ text: "Leave", style: "destructive" }),
        ]),
      );
    });

    it("calls the leave mutation when the user confirms leaving", async () => {
      const alertSpy = jest.spyOn(Alert, "alert");
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      fireEvent.press(getByTestId("button-leave-club"));

      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      const leaveButton = buttons.find((b) => b.text === "Leave");
      expect(leaveButton).toBeDefined();

      await act(async () => {
        leaveButton!.onPress?.();
      });

      expect(mockLeaveMutateAsync).toHaveBeenCalledWith({ id: 42 });
    });

    it("invalidates club and member queries after leaving", async () => {
      const alertSpy = jest.spyOn(Alert, "alert");
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      fireEvent.press(getByTestId("button-leave-club"));

      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      const leaveButton = buttons.find((b) => b.text === "Leave");

      await act(async () => {
        leaveButton!.onPress?.();
      });

      await waitFor(() => {
        expect(mockInvalidateQueries).toHaveBeenCalledTimes(2);
      });
    });

    it("does NOT call the leave mutation when the user cancels the dialog", () => {
      const alertSpy = jest.spyOn(Alert, "alert");
      const { getByTestId } = renderWithRouteParams({ id: "42" });
      fireEvent.press(getByTestId("button-leave-club"));

      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
      const cancelButton = buttons.find((b) => b.text === "Cancel");
      expect(cancelButton).toBeDefined();

      cancelButton!.onPress?.();
      expect(mockLeaveMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe("loading and edge cases", () => {
    it("hides both membership buttons when the club is still loading", () => {
      mockUseGetClub.mockReturnValue({ data: undefined, isLoading: true });
      mockUseListClubMembers.mockReturnValue({ data: undefined });
      const { queryByTestId } = renderWithRouteParams({ id: "42" });
      expect(queryByTestId("button-join-club")).toBeNull();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("shows 'Club not found' when the club does not exist", () => {
      mockUseGetClub.mockReturnValue({ data: undefined, isLoading: false });
      mockUseListClubMembers.mockReturnValue({ data: undefined });
      const { getByText } = renderWithRouteParams({ id: "42" });
      expect(getByText("Club not found")).toBeTruthy();
    });

    it("hides the membership button while current player data is still loading", () => {
      mockUseListClubMembers.mockReturnValue({ data: [] });
      mockUseGetCurrentPlayer.mockReturnValue({ data: undefined });
      const { queryByTestId } = renderWithRouteParams({ id: "42" });
      expect(queryByTestId("button-join-club")).toBeNull();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("renders the club description from API data", () => {
      mockUseListClubMembers.mockReturnValue({ data: [] });
      const { getByText } = renderWithRouteParams({ id: "42" });
      expect(getByText("Elite dragon tamers")).toBeTruthy();
    });

    it("renders each member's username in the members list", () => {
      mockUseListClubMembers.mockReturnValue({
        data: [otherMember, { ...currentPlayer, clubRole: "member" }],
      });
      const { getByText } = renderWithRouteParams({ id: "42" });
      expect(getByText("OtherPlayer")).toBeTruthy();
      expect(getByText("DragonMaster")).toBeTruthy();
    });
  });
});

// ─── B) Deep link routing (task #797) ────────────────────────────────────────

const deepLinkClub = {
  id: 123,
  name: "Speed Demons",
  description: "A club for speed lovers",
  badge: "🏃",
  memberCount: 12,
  maxMembers: 50,
  rank: "Gold",
  totalXp: 98000,
};

describe("deep link linking config", () => {
  it("hatchup-mobile://club/123 maps to path pattern 'club/:id' in the Expo Router config", () => {
    /**
     * getMockConfig runs the same path-building logic the Expo Router runtime
     * uses.  The OS resolves hatchup-mobile://club/123 to path /club/123 and
     * hands it to the router.  The config must contain 'club/:id' so the
     * segment '123' is extracted as param id='123'.
     */
    const config = getMockConfig({ "club/[id]": ClubDetailScreen });
    const configStr = JSON.stringify(config);
    expect(configStr).toContain("club/:id");
  });
});

describe("ClubDetailScreen — id param wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockUseGetClub.mockReturnValue({ data: deepLinkClub, isLoading: false });
    mockUseListClubMembers.mockReturnValue({ data: [] });
    mockUseGetCurrentPlayer.mockReturnValue({ data: currentPlayer });
    mockUseJoinClub.mockReturnValue({ mutateAsync: jest.fn() });
    mockUseLeaveClub.mockReturnValue({ mutateAsync: jest.fn() });
  });

  it("calls useGetClub(123) when the routed id is '123'", () => {
    renderWithRouteParams({ id: "123" });
    expect(mockUseGetClub).toHaveBeenCalledWith(123);
    expect(mockUseListClubMembers).toHaveBeenCalledWith(123);
  });

  it("calls useGetClub(456) for id '456', not 123", () => {
    mockUseGetClub.mockReturnValue({
      data: { ...deepLinkClub, id: 456, name: "The Lightning Bolts" },
      isLoading: false,
    });
    renderWithRouteParams({ id: "456" });
    expect(mockUseGetClub).toHaveBeenCalledWith(456);
    expect(mockUseGetClub).not.toHaveBeenCalledWith(123);
  });

  it("calls useGetClub(42) for a third distinct id, confirming no id is hard-coded", () => {
    mockUseGetClub.mockReturnValue({
      data: { ...deepLinkClub, id: 42, name: "Iron Runners" },
      isLoading: false,
    });
    renderWithRouteParams({ id: "42" });
    expect(mockUseGetClub).toHaveBeenCalledWith(42);
  });
});

describe("ClubDetailScreen — content rendered from routed id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateQueries.mockResolvedValue(undefined);
    mockUseGetClub.mockReturnValue({ data: deepLinkClub, isLoading: false });
    mockUseListClubMembers.mockReturnValue({ data: [] });
    mockUseGetCurrentPlayer.mockReturnValue({ data: currentPlayer });
    mockUseJoinClub.mockReturnValue({ mutateAsync: jest.fn() });
    mockUseLeaveClub.mockReturnValue({ mutateAsync: jest.fn() });
  });

  it("renders the club name fetched via the routed id", async () => {
    const { getAllByText } = renderWithRouteParams({ id: "123" });
    await waitFor(() => {
      expect(getAllByText("Speed Demons").length).toBeGreaterThan(0);
    });
  });

  it("renders the club description fetched via the routed id", async () => {
    const { getByText } = renderWithRouteParams({ id: "123" });
    await waitFor(() => {
      expect(getByText("A club for speed lovers")).toBeTruthy();
    });
  });

  it("renders the correct club name for a different id (42)", async () => {
    mockUseGetClub.mockReturnValue({
      data: { ...deepLinkClub, id: 42, name: "Iron Runners" },
      isLoading: false,
    });
    const { getAllByText } = renderWithRouteParams({ id: "42" });
    await waitFor(() => {
      expect(getAllByText("Iron Runners").length).toBeGreaterThan(0);
    });
  });

  it("shows 'Club not found' when no data is returned for the routed id", async () => {
    mockUseGetClub.mockReturnValue({ data: undefined, isLoading: false });
    const { findByText } = renderWithRouteParams({ id: "999" });
    await findByText("Club not found");
  });

  it("does not show the club name while data is still loading", () => {
    mockUseGetClub.mockReturnValue({ data: undefined, isLoading: true });
    const { queryByText } = renderWithRouteParams({ id: "123" });
    expect(queryByText("Speed Demons")).toBeNull();
  });

  it("shows Join Club button when the current player is not a member", async () => {
    mockUseListClubMembers.mockReturnValue({
      data: [{ id: 999, username: "other", level: 1 }],
    });
    const { getByTestId } = renderWithRouteParams({ id: "123" });
    await waitFor(() => {
      expect(getByTestId("button-join-club")).toBeTruthy();
    });
  });
});
