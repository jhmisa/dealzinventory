import assert from 'node:assert/strict'
import {
  todayJst,
  addDaysJst,
  firstLine,
  composeFollowupSubject,
  composeProblemSubject,
  bucketTickets,
  attentionCount,
} from './ticket-followups'

// 2026-07-15 23:30 UTC = 2026-07-16 08:30 JST — date math must be JST-anchored.
const NOW = new Date('2026-07-15T23:30:00Z')
assert.equal(todayJst(NOW), '2026-07-16')
assert.equal(addDaysJst(1, NOW), '2026-07-17')
assert.equal(addDaysJst(7, NOW), '2026-07-23')

assert.equal(firstLine('  Poco X7  \nsecond line'), 'Poco X7')
assert.equal(firstLine('a'.repeat(80), 10), 'aaaaaaaaa…')

assert.equal(composeFollowupSubject('Poco X7'), 'Poco X7')
assert.equal(
  composeFollowupSubject('Poco X7', 'customer will order end of month'),
  'Poco X7 — customer will order end of month',
)
assert.equal(composeProblemSubject('Walang sound\nDetails follow'), 'Walang sound')

const t = (over: Partial<Parameters<typeof bucketTickets>[0][number]> & { id: string }) => ({
  priority: 'NORMAL',
  created_at: '2026-07-01T00:00:00Z',
  follow_up_at: null,
  kind: 'followup' as const,
  ...over,
})

const tickets = [
  t({ id: 'overdue-followup', follow_up_at: '2026-07-10' }),
  t({ id: 'problem-nodate', kind: 'problem' }),
  t({ id: 'problem-urgent', kind: 'problem', priority: 'URGENT', created_at: '2026-07-05T00:00:00Z' }),
  t({ id: 'due-today', follow_up_at: '2026-07-16' }),
  t({ id: 'upcoming-late', follow_up_at: '2026-07-31' }),
  t({ id: 'upcoming-soon', follow_up_at: '2026-07-22' }),
  t({ id: 'snoozed-problem', kind: 'problem', follow_up_at: '2026-07-22' }),
  t({ id: 'no-date', created_at: '2026-07-03T00:00:00Z' }),
]

const b = bucketTickets(tickets, NOW)
assert.deepEqual(b.needsAttention.map((x) => x.id), ['problem-urgent', 'overdue-followup', 'problem-nodate'])
assert.deepEqual(b.dueToday.map((x) => x.id), ['due-today'])
assert.deepEqual(b.upcoming.map((x) => x.id), ['upcoming-soon', 'snoozed-problem', 'upcoming-late'])
assert.deepEqual(b.noDate.map((x) => x.id), ['no-date'])

assert.equal(attentionCount(tickets, NOW), 4)

console.log('ticket-followups.test.ts: all assertions passed')
