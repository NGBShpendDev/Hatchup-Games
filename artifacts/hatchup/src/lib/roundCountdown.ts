// Format the remaining time in the current elimination round as a short
// human string. Returns "Cut imminent" at (or past) zero so the UI can
// signal that the next bracket cut is about to happen.
export function formatRoundCountdown(endAt: string, now: number = Date.now()): string {
  const diff = new Date(endAt).getTime() - now;
  if (diff <= 0) return "Cut imminent";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
