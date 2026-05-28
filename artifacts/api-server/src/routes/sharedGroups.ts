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
