import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

jest.mock("@workspace/api-client-react", () => ({
  useGetHatchling: jest.fn(),
  useEvolveHatchling: jest.fn(),
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn().mockReturnValue({ id: "1" }),
  useRouter: jest.fn().mockReturnValue({ back: jest.fn() }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn().mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
}));

import { useGetHatchling, useEvolveHatchling } from "@workspace/api-client-react";
import HatchlingDetailScreen from "../[id]";

const mockUseGetHatchling = useGetHatchling as jest.Mock;
const mockUseEvolveHatchling = useEvolveHatchling as jest.Mock;

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
  });

  it("shows the Evolve button when the Pal is at the evolution threshold (stage 1, level 5)", () => {
    const { getByText } = render(<HatchlingDetailScreen />);
    expect(getByText("Evolve to Athletic!")).toBeTruthy();
  });

  it("calls the evolve mutation with the correct arguments when the Evolve button is tapped", () => {
    const { getByText } = render(<HatchlingDetailScreen />);
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

    const { getByText } = render(<HatchlingDetailScreen />);
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

    const { getByText } = render(<HatchlingDetailScreen />);
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

    const { queryByText } = render(<HatchlingDetailScreen />);
    expect(queryByText(/Evolve to/)).toBeNull();
  });

  it("hides the Evolve button when the Pal is below the level threshold (stage 1, level 4)", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...basePal, evolutionStage: 1, level: 4 },
      isLoading: false,
      refetch: mockRefetch,
    });

    const { queryByText } = render(<HatchlingDetailScreen />);
    expect(queryByText(/Evolve to/)).toBeNull();
  });

  it("hides the Evolve button when the Pal is below the level threshold (stage 2, level 14)", () => {
    mockUseGetHatchling.mockReturnValue({
      data: { ...basePal, evolutionStage: 2, level: 14 },
      isLoading: false,
      refetch: mockRefetch,
    });

    const { queryByText } = render(<HatchlingDetailScreen />);
    expect(queryByText(/Evolve to/)).toBeNull();
  });
});
