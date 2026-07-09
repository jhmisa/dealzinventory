import assert from 'node:assert/strict'
import { mixMusicBed } from './export-video'

// Helper: build a Float32Array from numbers.
const f = (...xs: number[]) => Float32Array.from(xs)

// --- gain: music is scaled by volume% and summed under the master ---
{
  const master = [f(0, 0, 0, 0)]
  const music = [f(1, 1, 1, 1)]
  mixMusicBed(master, music, 15) // 15% → 0.15
  master[0].forEach((v) => assert.ok(Math.abs(v - 0.15) < 1e-6, `expected ~0.15, got ${v}`))
}

// --- mix preserves the voice: master content survives, music adds on top ---
{
  const voice = [f(0.5, -0.4, 0.3, -0.2)]
  const master = [Float32Array.from(voice[0])]
  const music = [f(0.2, 0.2, 0.2, 0.2)]
  mixMusicBed(master, music, 50) // gain 0.5 → +0.1
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(master[0][i] - (voice[0][i] + 0.1)) < 1e-6, `sample ${i}: ${master[0][i]}`)
  }
  // Voice stays clearly the dominant signal (its energy >> the added music energy).
  const voiceE = voice[0].reduce((a, v) => a + v * v, 0)
  const musicE = 4 * (0.1 * 0.1)
  assert.ok(voiceE > musicE * 4, 'voice should dominate the mix at low volume')
}

// --- loop: music shorter than the master repeats to fill the whole timeline ---
{
  const master = [f(0, 0, 0, 0, 0)]
  const music = [f(1, 2)] // length 2, master length 5
  mixMusicBed(master, music, 100) // gain 1.0, then clamp
  // pattern 1,2,1,2,1 → clamped to 1 (values >1 clamp to 1)
  assert.deepEqual(Array.from(master[0]), [1, 1, 1, 1, 1])
}

// --- trim: music longer than the master only fills up to master length (no overflow read) ---
{
  const master = [f(0, 0)]
  const music = [f(0.3, 0.4, 0.5, 0.6)]
  mixMusicBed(master, music, 100)
  assert.deepEqual(Array.from(master[0]).map((v) => Number(v.toFixed(4))), [0.3, 0.4])
}

// --- clamp: summed samples never exceed [-1, 1] ---
{
  const master = [f(0.9, -0.9)]
  const music = [f(0.9, -0.9)]
  mixMusicBed(master, music, 100) // 0.9+0.9=1.8 → 1 ; -0.9-0.9=-1.8 → -1
  assert.deepEqual(Array.from(master[0]), [1, -1])
}

// --- mono music fans out to every master channel (stereo master) ---
{
  const master = [f(0, 0), f(0, 0)]
  const music = [f(0.4, 0.4)] // mono
  mixMusicBed(master, music, 50) // 0.2 into both channels
  master.forEach((ch) => ch.forEach((v) => assert.ok(Math.abs(v - 0.2) < 1e-6, `got ${v}`)))
}

// --- volume 0 (or empty inputs) is a no-op ---
{
  const master = [f(0.1, 0.2)]
  const before = Array.from(master[0])
  mixMusicBed(master, [f(1, 1)], 0)
  assert.deepEqual(Array.from(master[0]), before)
  mixMusicBed(master, [], 50)
  assert.deepEqual(Array.from(master[0]), before)
}

console.log('mix-music-bed.test.ts: all assertions passed')
