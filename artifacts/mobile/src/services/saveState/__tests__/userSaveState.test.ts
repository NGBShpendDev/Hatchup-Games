import { initialHatchUpData } from "../../../domain/models";
import {
  createUserSaveState,
  hydrateHatchUpDataFromSaveState,
  USER_SAVE_STATE_VERSION,
} from "../userSaveState";

describe("user save state", () => {
  it("wraps HatchUpData in a structured, versioned save envelope", () => {
    const data = {
      ...initialHatchUpData,
      activeHatchlingId: "pal-1",
      leaderboardShareEnabled: true,
      monsterName: "Ken",
      onboardingStatus: "complete" as const,
      onboardingStep: null,
      profileTagline: "Garden walker",
      profileUsername: "Ken",
      totalXp: 120,
    };

    const save = createUserSaveState(data, "2026-06-13T12:00:00.000Z");

    expect(save.saveVersion).toBe(USER_SAVE_STATE_VERSION);
    expect(save.profile.username).toBe("Ken");
    expect(save.profile.note).toBe("Garden walker");
    expect(save.pals.activePalId).toBe("pal-1");
    expect(save.eggs.incubatorSlots).toHaveLength(data.activeEggs.length);
    expect(save.leaderboard.shareEnabled).toBe(true);
    expect(save.onboarding.completed).toBe(true);
    expect(save.progress.journeyXp).toBe(120);
  });

  it("hydrates both new save envelopes and legacy flat app data", () => {
    const legacy = {
      ...initialHatchUpData,
      profileUsername: "Legacy Trainer",
      totalXp: 75,
    };
    const wrapped = createUserSaveState(legacy);

    expect(hydrateHatchUpDataFromSaveState(wrapped).profileUsername).toBe(
      "Legacy Trainer",
    );
    expect(hydrateHatchUpDataFromSaveState(legacy).totalXp).toBe(75);
  });

  it("falls back safely when save data is missing or corrupted", () => {
    const hydrated = hydrateHatchUpDataFromSaveState("not valid save data");

    expect(hydrated.activeEggs.length).toBeGreaterThan(0);
    expect(hydrated.onboardingStatus).toBe("notStarted");
  });
});
