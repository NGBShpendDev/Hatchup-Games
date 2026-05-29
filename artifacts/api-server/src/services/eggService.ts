import { eggsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { db as DbType } from "@workspace/db";

type EggDbHandle = Pick<typeof DbType, "query" | "insert">;

const INCUBATOR_CAP = 3;

export interface SpecialEggParams {
  eggType: string;
  rarity: string;
  stepsRequired: number;
  name: string;
  description: string;
  source: "challenge" | "event";
  realm: string;
}

/**
 * Awards a special egg to a player if their incubator has space.
 * Safe to call inside a DB transaction — pass the `tx` handle.
 * Returns true if the egg was awarded, false if the incubator was full.
 */
export async function awardSpecialEgg(
  playerId: number,
  params: SpecialEggParams,
  dbHandle: EggDbHandle,
): Promise<boolean> {
  const activeEggs = await dbHandle.query.eggsTable.findMany({
    where: and(eq(eggsTable.playerId, playerId), eq(eggsTable.isHatched, false)),
    columns: { id: true },
  });

  if (activeEggs.length >= INCUBATOR_CAP) return false;

  await dbHandle.insert(eggsTable).values({
    playerId,
    eggType: params.eggType,
    rarity: params.rarity,
    stepsRequired: params.stepsRequired,
    stepsProgress: 0,
    name: params.name,
    description: params.description,
    source: params.source,
    realm: params.realm,
  });

  return true;
}
