// Pure calendar model for the Content Studio calendar. Dependency-free (own JST day-key
// via Intl) so it unit-tests standalone. All bucketing is by JST calendar day, matching
// the rest of the app (business + customers are in Asia/Tokyo).
export const APP_TZ = 'Asia/Tokyo'

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** yyyy-MM-dd for an ISO instant, in JST. */
export function jstDayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso))
}

export function isPinned(post: { origin: string }): boolean {
  return post.origin === 'manual'
}
export function isGhost(post: { origin: string }): boolean {
  return post.origin === 'rule'
}

export interface MonthCell {
  dayKey: string
  day: number
  inMonth: boolean
}

/** 6×7 grid, Sunday-start, covering the given month (monthIndex 0-11). */
export function monthMatrix(year: number, monthIndex: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const firstDow = first.getUTCDay() // 0 = Sunday
  const cursor = new Date(Date.UTC(year, monthIndex, 1 - firstDow))
  const weeks: MonthCell[][] = []
  for (let w = 0; w < 6; w++) {
    const week: MonthCell[] = []
    for (let d = 0; d < 7; d++) {
      const y = cursor.getUTCFullYear()
      const m = cursor.getUTCMonth()
      const day = cursor.getUTCDate()
      const dayKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      week.push({ dayKey, day, inMonth: m === monthIndex })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Shift a yyyy-MM-dd key by N days (pure, calendar-based). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** The Sunday-start week (7 keys) containing dayKey. */
export function weekDayKeys(dayKey: string): string[] {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const start = shiftDayKey(dayKey, -dow)
  return Array.from({ length: 7 }, (_, i) => shiftDayKey(start, i))
}

/** Bucket scheduled posts by their JST calendar day. Null scheduled_at is skipped. */
export function bucketByDay<T extends { scheduled_at: string | null }>(posts: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const p of posts) {
    if (!p.scheduled_at) continue
    const key = jstDayKey(p.scheduled_at)
    const arr = map.get(key)
    if (arr) arr.push(p)
    else map.set(key, [p])
  }
  return map
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export function monthLabel(year: number, monthIndex: number): string {
  return `${MONTH_NAMES[monthIndex]} ${year}`
}
