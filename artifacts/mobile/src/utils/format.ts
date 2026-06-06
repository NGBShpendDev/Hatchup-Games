const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export function formatNumber(value: number | null | undefined) {
  return integerFormatter.format(Math.round(getSafeNumber(value)));
}

export function formatSteps(value: number | null | undefined) {
  return `${formatNumber(value)} steps`;
}

export function formatDistanceMiles(value: number | null | undefined) {
  return `${getSafeNumber(value).toFixed(1)} mi`;
}

export function formatPercent(value: number | null | undefined) {
  const percent = getSafeNumber(value);
  const normalized = percent <= 1 ? percent * 100 : percent;
  return `${Math.round(Math.max(0, Math.min(normalized, 999)))}%`;
}

export function formatXp(value: number | null | undefined) {
  return `${formatNumber(value)} XP`;
}

function getSafeNumber(value: number | null | undefined) {
  return Number.isFinite(value ?? 0) ? (value ?? 0) : 0;
}
