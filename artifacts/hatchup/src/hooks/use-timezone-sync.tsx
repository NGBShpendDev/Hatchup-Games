import { useEffect, useRef } from "react";
import { usePlayer } from "@/lib/playerContext";

function getDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && typeof tz === "string" ? tz : null;
  } catch {
    return null;
  }
}

export function useTimezoneSync() {
  const { player } = usePlayer();
  const playerId = player?.id ?? null;
  const lastSyncedRef = useRef<{ playerId: number; tz: string } | null>(null);

  useEffect(() => {
    if (!playerId) return;

    const deviceTz = getDeviceTimezone();
    if (!deviceTz) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/players/${playerId}/privacy-settings`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();

        if (data.weeklyRecapEnabled === false) return;
        if (data.weeklyRecapTimezone === deviceTz) return;

        const last = lastSyncedRef.current;
        if (last && last.playerId === playerId && last.tz === deviceTz) return;

        const patchRes = await fetch(`/api/players/${playerId}/privacy-settings`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ weeklyRecapTimezone: deviceTz }),
        });
        if (patchRes.ok && !cancelled) {
          lastSyncedRef.current = { playerId, tz: deviceTz };
        }
      } catch {
        // Silent — background sync, never disrupt UI.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playerId]);
}
