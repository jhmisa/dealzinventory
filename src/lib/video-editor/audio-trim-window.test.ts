import assert from 'node:assert/strict'
import { audioTrimWindow } from './export-video'

// Regression test for A/V drift after trim/split edits.
//
// MediaBunny's AudioBufferSink.buffers(start, end) — like the video sink — yields a LEADING block
// whose timestamp is <= `start` (the audio block that contains the cut). The old code concatenated
// that block untrimmed, so each kept range's audio started a hair early and the offset accumulated
// across cuts (audio slid ahead of the video). audioTrimWindow computes, from the first block's
// source timestamp, how many samples to drop from the front and how many to keep so a range's audio
// lines up exactly with [rangeStart, rangeEnd].

const RATE = 48000

// --- leading overhang is trimmed to the cut, and length capped to the range ---
{
  // range [2.0, 4.0]; the first decoded block actually starts at 1.96 (40ms of overhang).
  const { skip, keepLen } = audioTrimWindow(2.0, 4.0, 1.96, RATE, 5 * RATE)
  assert.equal(skip, Math.round(0.04 * RATE), `skip should drop the 40ms overhang, got ${skip}`)
  assert.equal(keepLen, Math.round(2.0 * RATE), `keepLen should equal the 2.0s range, got ${keepLen}`)
}

// --- no overhang (block starts exactly at the cut) → skip nothing ---
{
  const { skip, keepLen } = audioTrimWindow(2.0, 4.0, 2.0, RATE, 5 * RATE)
  assert.equal(skip, 0)
  assert.equal(keepLen, Math.round(2.0 * RATE))
}

// --- keepLen is capped by what's actually available after skipping (merged shorter than range) ---
{
  const merged = Math.round(1.5 * RATE) // only 1.5s decoded, but the range asks for 2.0s
  const { skip, keepLen } = audioTrimWindow(2.0, 4.0, 1.96, RATE, merged)
  assert.equal(keepLen, merged - skip, `keepLen limited to available samples, got ${keepLen}`)
  assert.ok(keepLen < Math.round(2.0 * RATE), 'availability, not the range length, is the cap here')
}

// --- firstTs after rangeStart (shouldn't happen, but must not produce a negative skip) ---
{
  const { skip, keepLen } = audioTrimWindow(2.0, 4.0, 2.1, RATE, 5 * RATE)
  assert.equal(skip, 0, 'skip is clamped to >= 0')
  assert.ok(keepLen >= 0)
}

// --- degenerate range → no samples ---
{
  const { skip, keepLen } = audioTrimWindow(3.0, 3.0, 3.0, RATE, RATE)
  assert.equal(skip, 0)
  assert.equal(keepLen, 0)
}

console.log('audio-trim-window.test.ts: all assertions passed')
