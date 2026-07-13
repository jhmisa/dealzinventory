import assert from 'node:assert/strict'
import { truncate, ageLabel } from './lib.js'

assert.equal(truncate('hello', 10), 'hello')
assert.equal(truncate('a'.repeat(400)), 'a'.repeat(299) + '…')
assert.equal(truncate('abcdef', 4), 'abc…')

const now = new Date('2026-07-13T12:00:00Z')
assert.equal(ageLabel(null, now), '—')
assert.equal(ageLabel('2026-07-13T11:30:00Z', now), '30m')
assert.equal(ageLabel('2026-07-13T08:00:00Z', now), '4h')
assert.equal(ageLabel('2026-07-10T12:00:00Z', now), '3d')

console.log('lib tests passed')
