export const ACCOUNT_SUSPENDED_EVENT = "hatchup:account-suspended";

export function isAccountSuspendedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    status?: number;
    data?: { error?: string } | null;
    response?: { status?: number; data?: { error?: string } | null };
  };
  const status = e.status ?? e.response?.status;
  const code = e.data?.error ?? e.response?.data?.error;
  return status === 403 && code === "account_suspended";
}

let lastToastAt = 0;

export function handleAccountSuspendedError(err: unknown): void {
  if (!isAccountSuspendedError(err)) return;
  const now = Date.now();
  if (now - lastToastAt < 4000) return;
  lastToastAt = now;
  // Lazy-load UI dependencies so this module stays importable in plain Node
  // test runners (which don't resolve the `@/` Vite alias).
  void Promise.all([
    import("@/hooks/use-toast"),
    import("@/components/suspended-banner"),
  ]).then(([{ toast }, { SUSPENDED_COPY }]) => {
    toast({
      title: SUSPENDED_COPY.title,
      description: SUSPENDED_COPY.body,
      variant: "destructive",
    });
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACCOUNT_SUSPENDED_EVENT));
  }
}
