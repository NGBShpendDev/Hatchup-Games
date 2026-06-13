import {
  createStarterEgg,
  hatchEgg as hatchReadyEgg,
  isEggReady,
} from "./hatchery";
import type {
  EggElement,
  HatchUpData,
  OnboardingTutorialStep,
} from "./models";

export const ONBOARDING_TUTORIAL_STEPS: readonly OnboardingTutorialStep[] = [
  "username",
  "starterEgg",
  "syncMovement",
  "hatchPal",
  "setActivePal",
  "trainPal",
  "rewardSummary",
];

export const DEFAULT_ONBOARDING_USERNAME = "HatchUp Trainer";

export function getOnboardingStepIndex(step: OnboardingTutorialStep | null) {
  const index = ONBOARDING_TUTORIAL_STEPS.indexOf(step ?? "username");
  return index >= 0 ? index + 1 : 1;
}

export function getOnboardingStepTitle(step: OnboardingTutorialStep | null) {
  const titles: Record<OnboardingTutorialStep, string> = {
    hatchPal: "Hatch your first Pal",
    rewardSummary: "Your first reward",
    setActivePal: "Choose your active Pal",
    starterEgg: "Pick your starter Egg",
    syncMovement: "Sync your first movement",
    trainPal: "Train your Pal",
    username: "Choose your trainer name",
  };

  return titles[step ?? "username"];
}

export function hasReadyOnboardingEgg(data: HatchUpData) {
  return data.activeEggs.some(isEggReady);
}

export function getOnboardingEgg(data: HatchUpData) {
  return data.activeEggs.find(isEggReady) ?? data.activeEggs[0] ?? data.activeEgg;
}

export function applyOnboardingIdentity(
  data: HatchUpData,
  username: string,
): HatchUpData {
  const safeUsername = sanitizeOnboardingUsername(username);

  return {
    ...data,
    leaderboardAlias: data.leaderboardAlias || safeUsername,
    monsterName: safeUsername,
    onboardingStatus: "monsterCreated",
    onboardingStep: "starterEgg",
    profileUsername: safeUsername,
  };
}

export function applyOnboardingStarterEgg(
  data: HatchUpData,
  element: EggElement,
): HatchUpData {
  const starterEgg = createStarterEgg(element);

  return {
    ...data,
    activeEgg: starterEgg,
    activeEggs: [starterEgg],
    onboardingStatus: "monsterCreated",
    onboardingStep: "syncMovement",
    starterEggElement: element,
  };
}

export function readyOnboardingEgg(data: HatchUpData): HatchUpData {
  const activeEggs = data.activeEggs.map((egg, index) =>
    index === 0 || egg.id === data.activeEgg.id
      ? { ...egg, stepsWalked: egg.stepsRequired }
      : egg,
  );

  return {
    ...data,
    activeEgg: activeEggs[0],
    activeEggs,
    healthConnected: true,
    onboardingStep: "hatchPal",
  };
}

export function applyOnboardingHatch(
  data: HatchUpData,
  eggId: string,
  hatchedAt: string,
): HatchUpData {
  const hatched = hatchReadyEgg(data, eggId, hatchedAt);

  if (hatched === data) return data;

  return {
    ...hatched,
    onboardingStep: "setActivePal",
    profileHatchlingId: hatched.profileHatchlingId ?? hatched.collection[0]?.id ?? null,
  };
}

export function completeOnboarding(data: HatchUpData): HatchUpData {
  return {
    ...data,
    onboardingStatus: "complete",
    onboardingStep: null,
  };
}

export function createSkippedOnboardingData(data: HatchUpData): HatchUpData {
  const username = sanitizeOnboardingUsername(
    data.profileUsername || data.monsterName || DEFAULT_ONBOARDING_USERNAME,
  );
  const element = data.starterEggElement ?? "leaf";
  const starterEgg = createStarterEgg(element);
  const readyStarterEgg = {
    ...starterEgg,
    stepsWalked: starterEgg.stepsRequired,
  };
  const prepared = {
    ...data,
    activeEgg: readyStarterEgg,
    activeEggs: [readyStarterEgg],
    leaderboardAlias: data.leaderboardAlias || username,
    monsterName: username,
    onboardingStatus: "monsterCreated",
    onboardingStep: "hatchPal",
    profileUsername: username,
    starterEggElement: element,
  } satisfies HatchUpData;
  const hatched = applyOnboardingHatch(
    prepared,
    readyStarterEgg.id,
    new Date().toISOString(),
  );
  const firstPalId = hatched.collection[0]?.id ?? null;

  return completeOnboarding({
    ...hatched,
    activeHatchlingId: hatched.activeHatchlingId ?? firstPalId,
    profileHatchlingId: hatched.profileHatchlingId ?? firstPalId,
  });
}

export function sanitizeOnboardingUsername(username: string) {
  const trimmed = username.trim().slice(0, 24);
  return trimmed || DEFAULT_ONBOARDING_USERNAME;
}
