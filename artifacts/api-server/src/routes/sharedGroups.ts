import { and, eq, gt, inArray, ne, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, groupMembersTable, groupsTable, playersTable } from "@workspace/db";

export type SharedGroupRow = {
  playerId: number;
  groupId: number;
  groupName: string;
};

export type SharedGroup = { id: number; name: string };

export function groupSharedGroupRows(
  rows: SharedGroupRow[],
): Map<number, SharedGroup[]> {
  const out = new Map<number, SharedGroup[]>();
  for (const r of rows) {
    const list = out.get(r.playerId) ?? [];
    list.push({ id: r.groupId, name: r.groupName });
    out.set(r.playerId, list);
  }
  return out;
}

// Shared-group helper: for the viewer, build a map of playerId -> groups they
// both belong to. Single SQL round-trip via a self-join on group_members + groups
// (indexed on (player_id, group_id)) so latency stays flat as the viewer's
// group count grows. Used to populate `sharedGroups` on PlayerStub responses.
export async function loadSharedGroupsForViewer(
  viewerId: number,
  playerIds: number[],
): Promise<Map<number, SharedGroup[]>> {
  if (playerIds.length === 0) return new Map();
  const viewerGm = alias(groupMembersTable, "viewer_gm");
  const rows = await db
    .select({
      playerId: groupMembersTable.playerId,
      groupId: groupsTable.id,
      groupName: groupsTable.name,
    })
    .from(groupMembersTable)
    .innerJoin(
      viewerGm,
      and(eq(viewerGm.groupId, groupMembersTable.groupId), eq(viewerGm.playerId, viewerId)),
    )
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(inArray(groupMembersTable.playerId, playerIds));
  return groupSharedGroupRows(rows);
}

// Mutual workout partners: third players who have actually logged a co-workout
// alongside BOTH the viewer and a given candidate. We expose `id` + `displayName`
// so picker UIs can render "You've both worked out with Alex & Sam" right under
// the existing "Also in <group> with you" line without an N+1 lookup per row.

export type MutualWorkoutPartnerRow = {
  candidateId: number;
  partnerId: number;
  partnerDisplayName: string;
  partnerUsername: string | null;
  partnerAvatarUrl: string | null;
  partnerCreatorBadge: string | null;
};

export type MutualWorkoutPartner = {
  id: number;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  creatorBadge: string | null;
};

// How many partners to surface per row. The inline "Workouts with X & Y +N more"
// line only shows the first two by name; the rest are surfaced in a bottom sheet
// that lists every partner with their real avatar. We cap at 50 so the sheet
// truly shows "every partner" for normal users without ever returning an
// unbounded payload to the client.
export const MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT = 50;

// Group raw join rows (candidateId × partnerId × partnerDisplayName) into a
// map keyed by candidateId. Dedups partners per candidate (a shared partner
// may appear once per shared workout group), preserves insertion order, and
// caps each list at the preview limit. Pure so it can be exercised by unit
// tests without standing up the SQL self-join.
export function groupMutualWorkoutPartnerRows(
  rows: MutualWorkoutPartnerRow[],
  limit: number = MUTUAL_WORKOUT_PARTNER_PREVIEW_LIMIT,
): Map<number, MutualWorkoutPartner[]> {
  const out = new Map<number, MutualWorkoutPartner[]>();
  const seen = new Map<number, Set<number>>();
  for (const r of rows) {
    const list = out.get(r.candidateId) ?? [];
    const seenForCandidate = seen.get(r.candidateId) ?? new Set<number>();
    if (seenForCandidate.has(r.partnerId)) continue;
    if (list.length >= limit) {
      seenForCandidate.add(r.partnerId);
      seen.set(r.candidateId, seenForCandidate);
      continue;
    }
    list.push({
      id: r.partnerId,
      displayName: r.partnerDisplayName,
      username: r.partnerUsername,
      avatarUrl: r.partnerAvatarUrl,
      creatorBadge: r.partnerCreatorBadge,
    });
    seenForCandidate.add(r.partnerId);
    out.set(r.candidateId, list);
    seen.set(r.candidateId, seenForCandidate);
  }
  return out;
}

// Mutual workout partners helper: for the viewer, build a map of
// candidateId -> third players who have actually logged a co-workout with
// BOTH the viewer and the candidate. Definition of "workout partner" mirrors
// how `co_workout_count` is incremented today: any member of a shared group
// where someone has logged a workout (co_workout_count > 0). Single SQL
// round-trip via a 4-way self-join on group_members, indexed on
// (player_id, group_id) and (group_id, player_id), so latency stays flat as
// either user's group count grows.
//
// Safety filtering is applied at SQL level: partners flagged as minors, with
// `locationVisibility="hidden"`, or in the viewer's blocked/hidden set are
// excluded BEFORE the rows reach the response. This mirrors the privacy
// guarantees already enforced for candidate rows on people-discovery
// endpoints — third-party identities surfaced as trust signals must obey the
// same rules.
export async function loadMutualWorkoutPartnersForViewer(
  viewerId: number,
  candidateIds: number[],
  hiddenPartnerIds: Iterable<number> = [],
): Promise<Map<number, MutualWorkoutPartner[]>> {
  if (candidateIds.length === 0) return new Map();
  const viewerGm = alias(groupMembersTable, "viewer_gm");
  const partnerInViewerGroup = alias(groupMembersTable, "partner_v_gm");
  const partnerInCandidateGroup = alias(groupMembersTable, "partner_c_gm");
  const candidateGm = alias(groupMembersTable, "candidate_gm");

  const hiddenList = Array.from(new Set(hiddenPartnerIds));

  const whereClauses = [
    eq(viewerGm.playerId, viewerId),
    gt(viewerGm.coWorkoutCount, 0),
    ne(partnerInViewerGroup.playerId, candidateGm.playerId),
    eq(playersTable.isMinor, false),
    ne(playersTable.locationVisibility, "hidden"),
  ];
  if (hiddenList.length > 0) {
    whereClauses.push(notInArray(partnerInViewerGroup.playerId, hiddenList));
  }

  const rows = await db
    .select({
      candidateId: candidateGm.playerId,
      partnerId: partnerInViewerGroup.playerId,
      partnerDisplayName: playersTable.displayName,
      partnerUsername: playersTable.username,
      partnerAvatarUrl: playersTable.avatarUrl,
      partnerCreatorBadge: playersTable.creatorBadge,
    })
    .from(viewerGm)
    .innerJoin(
      partnerInViewerGroup,
      and(
        eq(partnerInViewerGroup.groupId, viewerGm.groupId),
        ne(partnerInViewerGroup.playerId, viewerGm.playerId),
        gt(partnerInViewerGroup.coWorkoutCount, 0),
      ),
    )
    .innerJoin(
      partnerInCandidateGroup,
      and(
        eq(partnerInCandidateGroup.playerId, partnerInViewerGroup.playerId),
        gt(partnerInCandidateGroup.coWorkoutCount, 0),
      ),
    )
    .innerJoin(
      candidateGm,
      and(
        eq(candidateGm.groupId, partnerInCandidateGroup.groupId),
        ne(candidateGm.playerId, partnerInCandidateGroup.playerId),
        inArray(candidateGm.playerId, candidateIds),
      ),
    )
    .innerJoin(playersTable, eq(playersTable.id, partnerInViewerGroup.playerId))
    .where(and(...whereClauses));

  return groupMutualWorkoutPartnerRows(
    rows.map(r => ({
      candidateId: r.candidateId,
      partnerId: r.partnerId,
      partnerDisplayName: r.partnerDisplayName ?? r.partnerUsername ?? "Trainer",
      partnerUsername: r.partnerUsername,
      partnerAvatarUrl: r.partnerAvatarUrl,
      partnerCreatorBadge: r.partnerCreatorBadge,
    })),
  );
}
