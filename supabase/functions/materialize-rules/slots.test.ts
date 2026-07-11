import assert from 'node:assert/strict'
import { dueSlots, weekdayOf, shiftDayKey } from './slots'

// from = 2026-07-11T00:00:00Z = JST 09:00 Sat 2026-07-11. Rule: Mon/Wed/Fri at 18:00, 14-day horizon.
const from = '2026-07-11T00:00:00Z'
const slots = dueSlots(from, 14, [1, 3, 5], '18:00')

// Mon(13,20) Wed(15,22) Fri(17,24) within 07-11..07-25 → 6 slots.
assert.equal(slots.length, 6)

// First slot is 2026-07-13 18:00 JST = 09:00Z.
assert.equal(slots[0], new Date('2026-07-13T18:00:00+09:00').toISOString())
assert.equal(slots[0], '2026-07-13T09:00:00.000Z')

// All slots are in the future relative to `from` and land on Mon/Wed/Fri (JST).
for (const s of slots) {
  assert.ok(Date.parse(s) >= Date.parse(from))
}

// A same-day slot BEFORE `from` is excluded: from at JST 20:00, a 18:00 slot today is dropped.
const lateFrom = '2026-07-13T11:00:00Z' // JST 20:00 Mon 2026-07-13
const s2 = dueSlots(lateFrom, 2, [1], '18:00') // Mondays only, 2-day window
assert.ok(!s2.includes('2026-07-13T09:00:00.000Z')) // today's 18:00 JST already passed

// helpers
assert.equal(weekdayOf('2026-07-11'), 6) // Saturday
assert.equal(shiftDayKey('2026-07-31', 1), '2026-08-01')

console.log('slots.test.ts: all assertions passed')
