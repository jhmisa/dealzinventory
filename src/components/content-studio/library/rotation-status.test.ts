import assert from 'node:assert/strict'
import { rotationStatus } from './rotation-status'

// Retired wins over everything (even if it would otherwise be in rotation).
assert.deepEqual(
  rotationStatus({ retired_at: '2026-01-01', is_evergreen: true, times_posted: 3 }, { hasRule: true, nextDate: 'Jul 12' }),
  { label: 'Retired', tone: 'muted' },
)

// In a rule with a next date → active, with post count + date in the label.
const inRotation = rotationStatus(
  { retired_at: null, is_evergreen: true, times_posted: 5 },
  { hasRule: true, nextDate: 'Jul 12' },
)
assert.equal(inRotation.tone, 'active')
assert.equal(inRotation.label, 'In rotation · 5× · next Jul 12')

// Evergreen but not in any rule → warn (it's flagged reusable but nothing will post it).
assert.deepEqual(
  rotationStatus({ retired_at: null, is_evergreen: true, times_posted: 0 }, { hasRule: false }),
  { label: 'Evergreen (no rule)', tone: 'warn' },
)

// Plain, not scheduled.
assert.deepEqual(
  rotationStatus({ retired_at: null, is_evergreen: false, times_posted: 0 }, { hasRule: false }),
  { label: 'Not scheduled', tone: 'muted' },
)

// Default ctx (no rule) behaves like hasRule:false.
assert.equal(rotationStatus({ retired_at: null, is_evergreen: false, times_posted: 0 }).label, 'Not scheduled')

console.log('rotation-status.test.ts: all assertions passed')
