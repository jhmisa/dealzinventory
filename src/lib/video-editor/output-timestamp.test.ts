import assert from 'node:assert/strict'
import { mapOutputTimestamp } from './export-video'

// Regression test for the export crash after trim/split edits.
//
// MediaBunny's VideoSampleSink.samples(start, end) yields a LEADING frame whose timestamp is <=
// start (the frame visible at the cut). The old export code computed `outCursor + (ts - start)`
// directly, which went NEGATIVE for a trimmed start (CanvasSource.add throws "timestamp must be a
// non-negative number") and went BACKWARDS at a split boundary (non-monotonic → encoder fails).
// mapOutputTimestamp must clamp the in-range offset to >= 0 and force strictly-increasing output.

// --- the OLD naive formula demonstrates the bug we're fixing ---
{
  const naive = 0 + (1.96 - 2.0) // trimmed start at 2.0, leading frame at 1.96
  assert.ok(naive < 0, `sanity: the old formula produced a negative timestamp (${naive})`)
}

// --- trim start: a leading frame before the cut clamps to the range's output start, never negative ---
{
  const ts = mapOutputTimestamp(1.96, 2.0, 0, -Infinity)
  assert.equal(ts, 0, `expected 0 (clamped), got ${ts}`)
  assert.ok(ts >= 0, 'output timestamp must be non-negative')
}

// --- normal in-range progression: offset from the cut, on top of outCursor, strictly increasing ---
{
  let last = -Infinity
  const a = mapOutputTimestamp(2.0, 2.0, 0, last); last = a   // exactly at start → 0
  const b = mapOutputTimestamp(2.033, 2.0, 0, last); last = b // +33ms
  const c = mapOutputTimestamp(2.066, 2.0, 0, last); last = c // +66ms
  assert.equal(a, 0)
  assert.ok(Math.abs(b - 0.033) < 1e-9, `got ${b}`)
  assert.ok(Math.abs(c - 0.066) < 1e-9, `got ${c}`)
  assert.ok(a < b && b < c, 'strictly increasing')
}

// --- split boundary: range 2 starts at 7.0 after 5s already emitted; its leading frame (6.9)
//     must NOT step backwards past the last frame of range 1 ---
{
  const outCursor = 5           // 5s of range-1 already emitted
  const lastOfRange1 = 4.98     // last frame of range 1 landed just under the boundary
  const leading = mapOutputTimestamp(6.9, 7.0, outCursor, lastOfRange1)
  assert.ok(leading >= lastOfRange1, `must not go backwards: ${leading} < ${lastOfRange1}`)
  assert.ok(leading >= outCursor - 1e-9, `leading frame anchors at the range start: ${leading}`)
  const next = mapOutputTimestamp(7.033, 7.0, outCursor, leading)
  assert.ok(next > leading, 'subsequent frame advances')
}

// --- collision guard: two samples mapping to the same raw output are separated (strictly increasing) ---
{
  const first = mapOutputTimestamp(3.0, 3.0, 2, -Infinity) // raw = 2
  const second = mapOutputTimestamp(3.0, 3.0, 2, first)    // raw = 2 again → must bump above `first`
  assert.ok(second > first, `duplicate timestamps must be separated: ${second} <= ${first}`)
}

console.log('output-timestamp.test.ts: all assertions passed')
