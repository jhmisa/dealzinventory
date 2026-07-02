import assert from 'node:assert/strict'
import { APP_TIME_ZONE, formatDate, formatDateTime, formatTime, formatDayLabel } from './datetime'

assert.equal(APP_TIME_ZONE, 'Asia/Tokyo')

assert.equal(formatDate('2026-07-01T23:33:01Z'), '2026-07-02')
assert.equal(formatDateTime('2026-07-01T23:33:01Z'), '2026-07-02 08:33')
assert.equal(formatTime('2026-07-01T23:33:01Z'), '08:33')

assert.equal(formatDate('2026-07-01'), '2026-07-01')

assert.equal(formatDate(null), '—')
assert.equal(formatDateTime(undefined), '—')
assert.equal(formatTime(null), '—')
assert.equal(formatDayLabel(null), '')

const NOW = new Date('2026-07-10T05:00:00Z') // 14:00 JST Jul 10
assert.equal(formatDayLabel('2026-07-10T00:00:00Z', NOW), 'Today')       // 09:00 JST Jul 10
assert.equal(formatDayLabel('2026-07-09T10:00:00Z', NOW), 'Yesterday')   // 19:00 JST Jul 9
assert.equal(formatDayLabel('2026-07-09T14:59:00Z', NOW), 'Yesterday')   // 23:59 JST Jul 9
assert.equal(formatDayLabel('2026-07-09T15:00:00Z', NOW), 'Today')       // 00:00 JST Jul 10
assert.equal(formatDayLabel('2026-07-01T23:33:01Z', NOW), 'Jul 2')       // Jul 2 JST

console.log('datetime.test.ts: all assertions passed')
