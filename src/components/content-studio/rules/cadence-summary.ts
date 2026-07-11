// Pure: turn a rule cadence into a plain-English sentence for the builder preview + rule cards.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface Cadence {
  days: number[]
  time: string
}

function joinDays(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

export function cadenceSummary(cadence: Cadence): string {
  const days = [...new Set(cadence.days)].sort((a, b) => a - b)
  const time = cadence.time || '18:00'
  if (days.length === 0) return 'No days set'
  if (days.length === 7) return `Every day at ${time}`
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return `Weekdays at ${time}`
  if (days.length === 2 && days.includes(0) && days.includes(6)) return `Weekends at ${time}`
  return `Every ${joinDays(days.map((d) => DAY_NAMES[d]))} at ${time}`
}
