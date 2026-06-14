import { getEggProgressSummary } from "./eggProgress";
import type { HatchUpData } from "./models";
import { formatNumber, formatSteps, formatXp } from "../utils/format";

export interface ActivityLogItem {
  body: string;
  createdAt: string;
  id: string;
  label: string;
  tone: "default" | "reward" | "pal" | "sync";
}

export function getActivityLogItems(data: HatchUpData): ActivityLogItem[] {
  const items: ActivityLogItem[] = [];

  data.economyRewardHistory.forEach((receipt) => {
    items.push({
      body: getRewardReceiptBody(receipt),
      createdAt: receipt.createdAt,
      id: `economy:${receipt.id}`,
      label: receipt.label,
      tone: receipt.source === "hatch" ? "pal" : "reward",
    });
  });

  data.collection.forEach((pal) => {
    items.push({
      body: `${pal.name} joined your Collection as a ${pal.rarity} ${pal.element} Pal.`,
      createdAt: pal.hatchedAt,
      id: `pal:${pal.id}`,
      label: "Pal hatched",
      tone: "pal",
    });
  });

  data.activityHistory.forEach((award) => {
    items.push({
      body: `${formatSteps(award.health.steps)} synced for ${formatXp(award.xp.total)} Journey XP.`,
      createdAt: `${award.date}T12:00:00.000Z`,
      id: `sync:${award.date}`,
      label: "Movement synced",
      tone: "sync",
    });
  });

  data.activeEggs.forEach((egg) => {
    const summary = getEggProgressSummary(egg);
    if (!summary.isReady) return;

    items.push({
      body: `${summary.eggName} is ready. Open the Hatchery for the reveal.`,
      createdAt: data.lastSyncedDate ?? new Date().toISOString(),
      id: `egg-ready:${egg.id}`,
      label: "Egg ready",
      tone: "reward",
    });
  });

  return items
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);
}

function getRewardReceiptBody(
  receipt: HatchUpData["economyRewardHistory"][number],
) {
  const parts = [
    receipt.accountXp ? `${formatXp(receipt.accountXp)} Journey XP` : null,
    receipt.palXp ? `${formatXp(receipt.palXp)} Pal XP` : null,
    receipt.bond ? `+${formatNumber(receipt.bond)} Bond` : null,
    receipt.coins ? `+${formatNumber(receipt.coins)} coins` : null,
    receipt.eggSteps ? `${formatSteps(receipt.eggSteps)} Egg progress` : null,
    receipt.chestProgress ? `${formatSteps(receipt.chestProgress)} chest progress` : null,
    receipt.itemIds.length ? `${receipt.itemIds.length} item reward` : null,
    receipt.cosmeticIds.length ? `${receipt.cosmeticIds.length} cosmetic reward` : null,
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(", ")
    : "Progress was saved to your HatchUp journey.";
}
