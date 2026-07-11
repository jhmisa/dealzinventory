import assert from 'node:assert/strict'
import { cadenceSummary } from './cadence-summary'

assert.equal(cadenceSummary({ days: [0, 1, 2, 3, 4, 5, 6], time: '09:00' }), 'Every day at 09:00')
assert.equal(cadenceSummary({ days: [1, 2, 3, 4, 5], time: '12:00' }), 'Weekdays at 12:00')
assert.equal(cadenceSummary({ days: [0, 6], time: '10:00' }), 'Weekends at 10:00')
assert.equal(cadenceSummary({ days: [1, 3, 5], time: '18:00' }), 'Every Mon, Wed & Fri at 18:00')
assert.equal(cadenceSummary({ days: [2], time: '15:30' }), 'Every Tue at 15:30')
assert.equal(cadenceSummary({ days: [1, 4], time: '08:00' }), 'Every Mon & Thu at 08:00')
assert.equal(cadenceSummary({ days: [], time: '18:00' }), 'No days set')
// unsorted + dupes normalise
assert.equal(cadenceSummary({ days: [5, 1, 3, 3], time: '18:00' }), 'Every Mon, Wed & Fri at 18:00')

console.log('cadence-summary.test.ts: all assertions passed')
