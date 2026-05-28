import { useCallback, useEffect, useState } from "react";

/**
 * Resolve the service worker path relative to the Vite base path so the SW
 * can register correctly when the app is mounted under a sub-path (e.g. when
 * served behind the artifact proxy).
 */
function swUrl(): string {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${base}/sw.js`;
}

function swScope(): string {
  return import.meta.env.BASE_URL ?? "/";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionToBody(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    userAgent: navigator.userAgent,
    keys: {
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
  };
}

export type PushPermission = NotificationPermission | "unsupported";

export interface PushSubscriptionState {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
  enabling: boolean;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  error: string | null;
}

/**
 * Drive the browser-side web push lifecycle: register the service worker,
 * request notification permission, fetch the server's VAPID public key, and
 * sync the resulting PushSubscription with the API so the server can reach
 * this device when challenge events fire.
 */
export function usePushSubscription(): PushSubscriptionState {
  const supported = typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;

  const [permission, setPermission] = useState<PushPermission>(
    supported ? Notification.permission : "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect existing subscription so the toggle reflects reality on load.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration(swScope());
        if (!reg) return;
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(Boolean(existing));
      } catch {
        // ignore — toggle will simply show "off"
      }
    })();
    return () => { cancelled = true; };
  }, [supported]);

  const enable = useCallback(async (): Promise<boolean> => {
    if (!supported) { setError("This browser doesn't support push notifications."); return false; }
    setEnabling(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Notification permission was not granted.");
        return false;
      }

      const reg = await navigator.serviceWorker.register(swUrl(), { scope: swScope() });
      await navigator.serviceWorker.ready;

      const keyRes = await fetch("/api/push/public-key", { credentials: "include" });
      if (!keyRes.ok) {
        setError("Push notifications aren't available right now. Please try later.");
        return false;
      }
      const { publicKey } = await keyRes.json() as { publicKey: string };

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }

      const subRes = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscriptionToBody(sub)),
      });
      if (!subRes.ok) {
        setError("Could not register this device for push notifications.");
        return false;
      }

      setSubscribed(true);
      return true;
    } catch (err) {
      setError((err as Error).message ?? "Failed to enable push notifications.");
      return false;
    } finally {
      setEnabling(false);
    }
  }, [supported]);

  const disable = useCallback(async (): Promise<void> => {
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(swScope());
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      setError((err as Error).message ?? "Failed to disable push notifications.");
    }
  }, [supported]);

  return { supported, permission, subscribed, enabling, enable, disable, error };
}
