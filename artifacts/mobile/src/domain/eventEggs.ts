import { getActivitySummary } from "./history";
import { createRandomEgg, MAX_ACTIVE_EGGS } from "./hatchery";
import type { HatchUpData } from "./models";
import {
  ACTIVE_PROGRESSION_PROFILE,
  type ProgressionProfile,
} from "./progressionConfig";

export function grantEventEggs(
  data: HatchUpData,
  today: string,
  profile: ProgressionProfile = ACTIVE_PROGRESSION_PROFILE,
): HatchUpData {
  let next = data;

  next = maybeGrantEgg(next, {
    eventId: `daily-sync-${today}`,
    seed: Date.parse(`${today}T12:00:00.000Z`) + data.totalXp,
    shouldGrant: Boolean(data.dailyAward?.date === today),
    profile,
  });

  next = maybeGrantEgg(next, {
    eventId: `streak-${data.currentStreak}`,
    seed: data.currentStreak * 997 + data.totalXp,
    shouldGrant:
      data.currentStreak > 0 &&
      data.currentStreak % 3 === 0 &&
      data.lastRewardDate === today,
    profile,
  });

  const weekly = getActivitySummary(data.activityHistory, today, 7);
  next = maybeGrantEgg(next, {
    eventId: `weekly-goal-${today.slice(0, 7)}`,
    seed: weekly.steps + data.totalXp,
    shouldGrant: weekly.steps >= data.weeklyGoalSteps,
    profile,
  });

  next = maybeGrantEgg(next, {
    eventId: `collection-${Math.floor(data.collection.length / 3) * 3}`,
    seed: data.collection.length * 421 + data.eggsHatched,
    shouldGrant: data.collection.length > 0 && data.collection.length % 3 === 0,
    profile,
  });

  return next;
}

function maybeGrantEgg(
  data: HatchUpData,
  {
    eventId,
    profile,
    seed,
    shouldGrant,
  }: {
    eventId: string;
    profile: ProgressionProfile;
    seed: number;
    shouldGrant: boolean;
  },
): HatchUpData {
  if (!shouldGrant || data.eventEggsAwarded.includes(eventId)) {
    return data;
  }

  const egg = createRandomEgg(seed, profile);
  const awardedEgg = { ...egg, id: `event-${eventId}` };
  const hasRoom = data.activeEggs.length < MAX_ACTIVE_EGGS;
  const activeEggs = hasRoom
    ? [...data.activeEggs, awardedEgg]
    : data.activeEggs;
  const pendingEggs = hasRoom
    ? data.pendingEggs
    : [...data.pendingEggs, awardedEgg];

  return {
    ...data,
    activeEgg: activeEggs[0],
    activeEggs,
    eventEggsAwarded: [...data.eventEggsAwarded, eventId],
    pendingEggs,
  };
}
