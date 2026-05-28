import { renderHook, act } from "@testing-library/react-native";
import { Share } from "react-native";
import { usePalMilestoneShare } from "../usePalMilestoneShare";

describe("usePalMilestoneShare", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as any);
  });

  it("calls Share.share with the correct milestone message when evolutionSharePrompt is true", async () => {
    const { result } = renderHook(() => usePalMilestoneShare());
    await act(async () => {
      await result.current({ evolutionSharePrompt: true, newLevel: 5, hatchlingId: 1 }, "Sparky");
    });
    expect(Share.share).toHaveBeenCalledTimes(1);
    const [arg] = (Share.share as jest.Mock).mock.calls[0] as [{ message: string }];
    expect(arg.message).toBe("🎉 Sparky just reached level 5 — an evolution milestone! #HatchUp");
  });

  it("falls back to 'Your Pal' when no name is provided", async () => {
    const { result } = renderHook(() => usePalMilestoneShare());
    await act(async () => {
      await result.current({ evolutionSharePrompt: true, newLevel: 15 });
    });
    const [arg] = (Share.share as jest.Mock).mock.calls[0] as [{ message: string }];
    expect(arg.message).toContain("Your Pal");
    expect(arg.message).toContain("level 15");
    expect(arg.message).toContain("#HatchUp");
  });

  it("does NOT call Share.share when evolutionSharePrompt is false", async () => {
    const { result } = renderHook(() => usePalMilestoneShare());
    await act(async () => {
      await result.current({ evolutionSharePrompt: false, newLevel: 5 }, "Sparky");
    });
    expect(Share.share).not.toHaveBeenCalled();
  });

  it("does NOT call Share.share when palXpResult is null", async () => {
    const { result } = renderHook(() => usePalMilestoneShare());
    await act(async () => {
      await result.current(null, "Sparky");
    });
    expect(Share.share).not.toHaveBeenCalled();
  });

  it("does NOT call Share.share when evolutionSharePrompt is undefined", async () => {
    const { result } = renderHook(() => usePalMilestoneShare());
    await act(async () => {
      await result.current({ newLevel: 5 }, "Sparky");
    });
    expect(Share.share).not.toHaveBeenCalled();
  });

  it("silently continues when Share.share throws", async () => {
    (Share.share as jest.Mock).mockRejectedValueOnce(new Error("User dismissed"));
    const { result } = renderHook(() => usePalMilestoneShare());
    await expect(
      act(async () => {
        await result.current({ evolutionSharePrompt: true, newLevel: 5 }, "Sparky");
      }),
    ).resolves.toBeUndefined();
  });
});
