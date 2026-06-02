export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isYesterday(previousDateKey: string, currentDateKey: string) {
  const current = dateKeyToLocalDate(currentDateKey);
  current.setDate(current.getDate() - 1);
  return toDateKey(current) === previousDateKey;
}

function dateKeyToLocalDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}
