import assert from 'node:assert/strict'
import {
  jstDayKey,
  isPinned,
  isGhost,
  monthMatrix,
  shiftDayKey,
  weekDayKeys,
  bucketByDay,
  monthLabel,
} from './calendar-model'

// jstDayKey: an instant at 16:00 UTC is already the next day in JST (+9).
assert.equal(jstDayKey('2026-07-11T16:00:00Z'), '2026-07-12')
assert.equal(jstDayKey('2026-07-11T13:59:00Z'), '2026-07-11') // JST 22:59 same day

// monthMatrix: always 6 weeks × 7 days, contains the whole month, 31 in-month days for July.
const july = monthMatrix(2026, 6)
assert.equal(july.length, 6)
assert.ok(july.every((w) => w.length === 7))
const flat = july.flat()
assert.ok(flat.some((c) => c.dayKey === '2026-07-01' && c.inMonth))
assert.ok(flat.some((c) => c.dayKey === '2026-07-31' && c.inMonth))
assert.equal(flat.filter((c) => c.inMonth).length, 31)
// First cell of the grid is a Sunday (leading days belong to the previous month or the 1st).
assert.equal(new Date(july[0][0].dayKey + 'T00:00:00Z').getUTCDay(), 0)

// shiftDayKey handles month/year rollover.
assert.equal(shiftDayKey('2026-07-31', 1), '2026-08-01')
assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31')

// weekDayKeys returns the Sunday-start week containing the day.
const wk = weekDayKeys('2026-07-11') // 2026-07-11 is a Saturday
assert.equal(wk.length, 7)
assert.equal(wk[0], '2026-07-05') // Sunday
assert.equal(wk[6], '2026-07-11') // Saturday

// bucketByDay groups by JST day and skips null.
const buckets = bucketByDay([
  { scheduled_at: '2026-07-11T13:00:00Z', origin: 'manual' }, // JST 22:00 → 07-11
  { scheduled_at: '2026-07-11T16:00:00Z', origin: 'rule' }, // JST 01:00 → 07-12
  { scheduled_at: null, origin: 'manual' },
])
assert.equal(buckets.get('2026-07-11')?.length, 1)
assert.equal(buckets.get('2026-07-12')?.length, 1)

// pinned vs ghost.
assert.equal(isPinned({ origin: 'manual' }), true)
assert.equal(isGhost({ origin: 'rule' }), true)
assert.equal(isPinned({ origin: 'rule' }), false)

assert.equal(monthLabel(2026, 6), 'July 2026')

console.log('calendar-model.test.ts: all assertions passed')
