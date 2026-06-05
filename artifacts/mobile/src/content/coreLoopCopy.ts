export const CORE_LOOP_PROMISE =
  "Move your body, hatch Pals, grow your collection, and return tomorrow.";

export function getReturnTomorrowMessage(streak: number) {
  if (streak > 0) {
    return `${streak} day streak active. Come back tomorrow to keep your Pal growing.`;
  }
  return "Start today's journey, then return tomorrow to keep your Pal growing.";
}

export function getEggProgressMessage(stepsWalked: number, stepsRequired: number) {
  const remaining = Math.max(stepsRequired - stepsWalked, 0);
  if (remaining === 0) {
    return "Your egg is ready. Hatch this Pal when you are ready.";
  }
  return `${remaining.toLocaleString()} steps left. Sync movement to push this Egg forward.`;
}

export function getCollectionNudge(collectionCount: number) {
  if (collectionCount === 0) {
    return "Your first Pal is waiting inside an Egg. Move today, sync, then hatch it.";
  }
  return `${collectionCount} Pal${collectionCount === 1 ? "" : "s"} discovered. Hatch more Eggs to grow your team.`;
}

export function getScreenLoopSubtitle(screen: "collection" | "hatchery" | "home" | "profile" | "ranks") {
  if (screen === "hatchery") {
    return "Movement becomes Egg progress. Sync today, hatch when ready, then grow your team.";
  }
  if (screen === "collection") {
    return "Hatched Pals become your growing team. Pick a favorite, train them, and return tomorrow.";
  }
  if (screen === "ranks") {
    return "Move this week, climb the board if you choose, and keep private health details off rankings.";
  }
  if (screen === "profile") {
    return "Your trainer card grows as you move, hatch, collect, and unlock badges.";
  }
  return CORE_LOOP_PROMISE;
}
