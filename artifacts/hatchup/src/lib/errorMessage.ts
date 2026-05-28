export function errorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "object" && err !== null) {
    const anyErr = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
    const apiErr = anyErr.response?.data?.error ?? anyErr.response?.data?.message;
    if (apiErr) return apiErr;
    if (anyErr.message) return anyErr.message;
  }
  if (typeof err === "string") return err;
  return fallback;
}
