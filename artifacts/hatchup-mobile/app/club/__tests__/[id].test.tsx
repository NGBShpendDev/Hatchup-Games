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
  getGetClubQueryKey: jest.fn().mockReturnValue(["club"]),
  getListClubMembersQueryKey: jest.fn().mockReturnValue(["clubMembers"]),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn().mockReturnValue({ id: "42" }),
  useRouter: jest.fn().mockReturnValue({ back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

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
      const { getByTestId, queryByTestId } = render(<ClubDetailScreen />);
      expect(getByTestId("button-join-club")).toBeTruthy();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("calls the join mutation with the correct arguments when Join Club is tapped", async () => {
      const { getByTestId } = render(<ClubDetailScreen />);
      await act(async () => {
        fireEvent.press(getByTestId("button-join-club"));
      });
      expect(mockJoinMutateAsync).toHaveBeenCalledWith({
        id: 42,
        data: { playerId: currentPlayer.id },
      });
    });

    it("invalidates club and member queries after joining", async () => {
      const { getByTestId } = render(<ClubDetailScreen />);
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
      const { getByTestId, queryByTestId } = render(<ClubDetailScreen />);
      expect(getByTestId("button-leave-club")).toBeTruthy();
      expect(queryByTestId("button-join-club")).toBeNull();
    });

    it("opens a confirmation dialog when Leave Club is tapped", () => {
      const alertSpy = jest.spyOn(Alert, "alert");
      const { getByTestId } = render(<ClubDetailScreen />);
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
      const { getByTestId } = render(<ClubDetailScreen />);
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
      const { getByTestId } = render(<ClubDetailScreen />);
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
      const { getByTestId } = render(<ClubDetailScreen />);
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
      const { queryByTestId } = render(<ClubDetailScreen />);
      expect(queryByTestId("button-join-club")).toBeNull();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("shows 'Club not found' when the club does not exist", () => {
      mockUseGetClub.mockReturnValue({ data: undefined, isLoading: false });
      mockUseListClubMembers.mockReturnValue({ data: undefined });
      const { getByText } = render(<ClubDetailScreen />);
      expect(getByText("Club not found")).toBeTruthy();
    });

    it("hides the membership button while current player data is still loading", () => {
      mockUseListClubMembers.mockReturnValue({ data: [] });
      mockUseGetCurrentPlayer.mockReturnValue({ data: undefined });
      const { queryByTestId } = render(<ClubDetailScreen />);
      expect(queryByTestId("button-join-club")).toBeNull();
      expect(queryByTestId("button-leave-club")).toBeNull();
    });

    it("renders the club description from API data", () => {
      mockUseListClubMembers.mockReturnValue({ data: [] });
      const { getByText } = render(<ClubDetailScreen />);
      expect(getByText("Elite dragon tamers")).toBeTruthy();
    });

    it("renders each member's username in the members list", () => {
      mockUseListClubMembers.mockReturnValue({
        data: [otherMember, { ...currentPlayer, clubRole: "member" }],
      });
      const { getByText } = render(<ClubDetailScreen />);
      expect(getByText("OtherPlayer")).toBeTruthy();
      expect(getByText("DragonMaster")).toBeTruthy();
    });
  });
});
