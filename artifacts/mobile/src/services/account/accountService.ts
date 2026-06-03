import type { HatchUpData } from "../../domain/models";

export interface CloudSaveResult {
  accountMode: "local" | "remote";
  syncedAt: string | null;
  status: HatchUpData["cloudSyncStatus"];
}

export async function syncCloudSave(
  data: HatchUpData,
): Promise<CloudSaveResult> {
  if (!data.cloudSyncEnabled) {
    return {
      accountMode: data.accountMode,
      status: "localOnly",
      syncedAt: null,
    };
  }

  const apiUrl = process.env.EXPO_PUBLIC_HATCHUP_API_URL;
  if (!apiUrl) {
    return {
      accountMode: "local",
      status: "pending",
      syncedAt: null,
    };
  }

  const syncedAt = new Date().toISOString();
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/cloud-save`, {
    body: JSON.stringify({
      accountId: data.accountId,
      clientSchemaVersion: data.schemaVersion,
      data,
      syncedAt,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Cloud save sync failed with ${response.status}.`);
  }

  return {
    accountMode: "remote",
    status: "synced",
    syncedAt,
  };
}
