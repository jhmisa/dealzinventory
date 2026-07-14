// Single source of truth for the tickets-as-follow-up-queue behavior:
// auto-composed subjects (staff never type Subject anymore) and the JST-anchored
// queue bucketing used by the Tickets page and the sidebar attention badge.
// Spec: docs/superpowers/specs/2026-07-15-tickets-followup-queue-design.md
import { TZDate } from '@date-fns/tz'
import { format } from 'date-fns'
import { APP_TIME_ZONE } from './datetime'

export type TicketKind = 'problem' | 'followup'

// yyyy-MM-dd of "today" in JST. `now` is injectable for tests.
export function todayJst(now: Date = new Date()): string {
  return format(new TZDate(now, APP_TIME_ZONE), 'yyyy-MM-dd')
}

// yyyy-MM-dd of today+N days in JST.
export function addDaysJst(days: number, now: Date = new Date()): string {
  const d = new TZDate(now, APP_TIME_ZONE)
  d.setDate(d.getDate() + days)
  return format(d, 'yyyy-MM-dd')
}

export function firstLine(text: string, max = 60): string {
  const line = text.trim().split('\n')[0].trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

// Follow-up tickets: "Poco X7" or "Poco X7 — customer orders end of month"
export function composeFollowupSubject(itemLabel: string, note?: string): string {
  const item = firstLine(itemLabel, 60)
  const noteLine = note ? firstLine(note, 40) : ''
  return noteLine ? `${item} — ${noteLine}` : item
}

// Problem tickets: subject = first line of the description
export function composeProblemSubject(description: string): string {
  return firstLine(description, 60)
}

export const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
}

export interface QueueTicketLike {
  priority: string
  created_at: string
  follow_up_at: string | null
  kind: TicketKind
}

export interface TicketBuckets<T> {
  needsAttention: T[]
  dueToday: T[]
  upcoming: T[]
  noDate: T[]
}

// Buckets OPEN/IN_PROGRESS tickets for the queue view.
//   needsAttention — anything overdue + problem tickets without a snooze date
//   dueToday       — follow_up_at = today (JST)
//   upcoming       — future follow_up_at, soonest first
//   noDate         — follow-ups that still need a date
// Giving a problem ticket a future follow_up_at intentionally "snoozes" it into
// Upcoming (e.g. customer said to check back next week).
export function bucketTickets<T extends QueueTicketLike>(
  tickets: T[],
  now: Date = new Date(),
): TicketBuckets<T> {
  const today = todayJst(now)
  const byPriorityThenOldest = (a: T, b: T) =>
    (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
    a.created_at.localeCompare(b.created_at)

  const buckets: TicketBuckets<T> = { needsAttention: [], dueToday: [], upcoming: [], noDate: [] }
  for (const t of tickets) {
    const due = t.follow_up_at
    if ((due && due < today) || (t.kind === 'problem' && !due)) buckets.needsAttention.push(t)
    else if (due === today) buckets.dueToday.push(t)
    else if (due && due > today) buckets.upcoming.push(t)
    else buckets.noDate.push(t)
  }
  buckets.needsAttention.sort(byPriorityThenOldest)
  buckets.dueToday.sort(byPriorityThenOldest)
  buckets.upcoming.sort((a, b) =>
    (a.follow_up_at as string).localeCompare(b.follow_up_at as string) || byPriorityThenOldest(a, b))
  buckets.noDate.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return buckets
}

// Sidebar badge: what needs a human today.
export function attentionCount(tickets: QueueTicketLike[], now: Date = new Date()): number {
  const b = bucketTickets(tickets, now)
  return b.needsAttention.length + b.dueToday.length
}
