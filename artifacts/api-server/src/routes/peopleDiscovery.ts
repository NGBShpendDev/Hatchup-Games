import { ne, notInArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { playersTable } from "@workspace/db";
import { getHiddenPlayerIds } from "./safety.ts";

/**
 * Canonical people-discovery exclusion rule shared by every endpoint that
 * surfaces other accounts (`/players/search`, `/players/nearby`,
 * `/leaderboards/scoped`, `/social/discover`, `/social/search`).
 *
 * Drops any player who:
 *   - is blocked by the viewer or has blocked the viewer (`getHiddenPlayerIds`)
 *   - fails the visibility predicate (default: `locationVisibility === "hidden"`
 *     is excluded; pass a custom predicate via `filter()` for scope-aware boards)
 *   - is flagged as a minor account
 *
 * Returns:
 *   - `whereClauses`: drizzle SQL fragments to spread into a `findMany`
 *     `where: and(...)` so the DB never returns hidden / minor / blocked
 *     rows in the first place.
 *   - `hiddenIds`: the resolved Set of blocked-direction-either playerIds,
 *     for surfaces that still need a post-filter or want to forward the set
 *     to downstream helpers (e.g. mutual-workout-partner loaders).
 *   - `filter()`: a post-filter for callers that already have an in-memory
 *     player array. Accepts an `allowVisibility` override so scope-aware
 *     boards (e.g. leaderboards) can honor `canAppearInScope` instead of
 *     the flat "hidden = excluded" default.
 *
 * The viewer themselves is NOT removed — leaderboard surfaces need the viewer
 * row in the result set to compute "my position / my entry". Callers that want
 * to exclude self should do so at the query layer (e.g. `ne(players.id, me)`).
 *
 * A thin post-filter-only wrapper (`filterDiscoverableCandidates`) is
 * re-exported from `./safety.ts` for back-compat with the three older
 * endpoints whose tests mock that module directly.
 */
export async function buildPeopleDiscoveryFilter(
  viewerId: number | null | undefined,
): Promise<{
  hiddenIds: Set<number>;
  whereClauses: SQL[];
  filter: <T extends { id: number; locationVisibility: string | null; isMinor: boolean | null }>(
    rows: T[],
    options?: { allowVisibility?: (visibility: string | null) => boolean },
  ) => T[];
}> {
  const hiddenIds = viewerId
    ? new Set(await getHiddenPlayerIds(viewerId))
    : new Set<number>();
  const whereClauses: SQL[] = [
    ne(playersTable.locationVisibility, "hidden"),
    ne(playersTable.isMinor, true),
  ];
  if (hiddenIds.size > 0) {
    whereClauses.push(notInArray(playersTable.id, [...hiddenIds]));
  }
  return {
    hiddenIds,
    whereClauses,
    filter: (rows, options) => {
      const allowVisibility = options?.allowVisibility ?? ((v) => v !== "hidden");
      return rows.filter(
        (p) => !hiddenIds.has(p.id) && allowVisibility(p.locationVisibility) && !p.isMinor,
      );
    },
  };
}
