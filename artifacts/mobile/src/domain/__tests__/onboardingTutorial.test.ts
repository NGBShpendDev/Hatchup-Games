import { isEggReady } from "../hatchery";
import { initialHatchUpData } from "../models";
import {
  advanceOnboardingSyncExplanation,
  applyOnboardingHatch,
  applyOnboardingIdentity,
  applyOnboardingStarterEgg,
  createSkippedOnboardingData,
  getOnboardingStepIndex,
  ONBOARDING_TUTORIAL_STEPS,
  readyOnboardingEgg,
} from "../onboardingTutorial";

describe("onboarding tutorial", () => {
  it("walks a new user through the playable first-run loop", () => {
    const named = applyOnboardingIdentity(initialHatchUpData, "Luna");
    expect(named).toMatchObject({
      onboardingStatus: "monsterCreated",
      onboardingStep: "starterEgg",
      profileUsername: "Luna",
    });

    const withStarter = applyOnboardingStarterEgg(named, "storm");
    expect(withStarter).toMatchObject({
      onboardingStep: "explainSync",
      starterEggElement: "storm",
    });
    expect(withStarter.activeEggs).toHaveLength(1);

    const readyToSync = advanceOnboardingSyncExplanation(withStarter);
    expect(readyToSync.onboardingStep).toBe("syncMovement");

    const ready = readyOnboardingEgg(readyToSync);
    expect(ready.onboardingStep).toBe("hatchPal");
    expect(isEggReady(ready.activeEgg)).toBe(true);

    const hatched = applyOnboardingHatch(
      ready,
      ready.activeEgg.id,
      "2026-06-01T12:00:00.000Z",
    );
    expect(hatched.onboardingStep).toBe("setActivePal");
    expect(hatched.collection[0]).toMatchObject({
      element: "storm",
      level: 1,
      rarity: "common",
    });
  });

  it("exposes eight clear tutorial steps", () => {
    expect(ONBOARDING_TUTORIAL_STEPS).toEqual([
      "username",
      "starterEgg",
      "explainSync",
      "syncMovement",
      "hatchPal",
      "setActivePal",
      "trainPal",
      "rewardSummary",
    ]);
    expect(getOnboardingStepIndex("rewardSummary")).toBe(8);
  });

  it("creates safe complete starter defaults when skipped", () => {
    const skipped = createSkippedOnboardingData(initialHatchUpData);

    expect(skipped.onboardingStatus).toBe("complete");
    expect(skipped.onboardingStep).toBeNull();
    expect(skipped.collection).toHaveLength(1);
    expect(skipped.activeHatchlingId).toBe(skipped.collection[0].id);
    expect(skipped.profileUsername).toBeTruthy();
  });
});
