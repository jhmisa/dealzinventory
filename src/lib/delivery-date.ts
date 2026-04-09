/**
 * Compute the earliest selectable delivery date (YYYY-MM-DD) based on JST time.
 *
 * Rules:
 *   - Orders are only processed Monday–Friday.
 *   - Cutoff is 16:00 JST. Orders placed at/after cutoff roll to the next business day.
 *   - Weekend orders are processed the following Monday.
 *   - Earliest delivery = processing day + 1 calendar day (Saturday delivery is allowed
 *     when processing happens on Friday before cutoff, or Thursday after cutoff).
 */
export function getEarliestDeliveryDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const hour = Number(get('hour'))
  const weekday = get('weekday')

  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  let dow = dowMap[weekday] ?? 0

  // Build a UTC-anchored date for the JST calendar day; we only care about the date portion.
  const processing = new Date(Date.UTC(year, month - 1, day))
  const afterCutoff = hour >= 16
  const isWeekend = dow === 0 || dow === 6

  const advanceOneDay = () => {
    processing.setUTCDate(processing.getUTCDate() + 1)
    dow = (dow + 1) % 7
  }

  if (isWeekend || afterCutoff) {
    advanceOneDay()
    while (dow === 0 || dow === 6) {
      advanceOneDay()
    }
  }

  // Earliest delivery = processing day + 1 calendar day
  processing.setUTCDate(processing.getUTCDate() + 1)

  const yyyy = processing.getUTCFullYear()
  const mm = String(processing.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(processing.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
