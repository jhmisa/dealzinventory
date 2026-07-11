// Pure JST slot computation for content rules. No Deno/Node-specific APIs (Intl + Date only)
// so it runs under both Deno (the edge fn) and tsx (the unit test).
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function jstDayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

/**
 * ISO instants for every day in [from, from+horizonDays] (JST) whose weekday is in `days`,
 * at `time` (HH:MM, JST), that is still in the future relative to `fromISO`.
 */
export function dueSlots(fromISO: string, horizonDays: number, days: number[], time: string): string[] {
  const startKey = jstDayKey(fromISO);
  const daySet = new Set(days);
  const out: string[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const key = shiftDayKey(startKey, i);
    if (!daySet.has(weekdayOf(key))) continue;
    const slotISO = new Date(`${key}T${time}:00+09:00`).toISOString();
    if (Date.parse(slotISO) >= Date.parse(fromISO)) out.push(slotISO);
  }
  return out;
}
