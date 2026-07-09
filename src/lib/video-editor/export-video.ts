// Client-side video export via MediaBunny (WebCodecs). Concatenates optional intro + the trimmed
// recording + optional outro into one MP4: every frame is drawn (cover-fit) onto a single output
// canvas at the recording's resolution and re-encoded H.264, with a continuously re-timestamped
// timeline. Audio stays in sync by building ONE master AudioBuffer the exact length of the video
// timeline — each segment's audio is resampled to a common rate and written at its offset; gaps
// (a segment with no/shorter audio) stay silent. Chromium-only (WebCodecs VideoEncoder).
//
// MediaBunny 1.50.x API (pinned from node_modules/mediabunny/dist/mediabunny.d.ts):
//   new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) })
//   input.getPrimaryVideoTrack(): Promise<InputVideoTrack|null>  (.displayWidth/.displayHeight/.codedWidth/.codedHeight)
//   input.getPrimaryAudioTrack(): Promise<InputAudioTrack|null>
//   new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
//   new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })  -> add(timestamp, duration?)
//   new AudioBufferSource({ codec: 'aac', bitrate })  -> add(audioBuffer)  (sequential; first at ts 0)
//   new VideoSampleSink(track).samples(start,end) -> VideoSample{ timestamp, duration, draw(ctx,dx,dy,dw?,dh?), close() }
//   new AudioBufferSink(track).buffers(start,end) -> WrappedAudioBuffer{ buffer:AudioBuffer, timestamp, duration }
//   output.start(); output.finalize(); (output.target as BufferTarget).buffer: ArrayBuffer|null
import {
  Input, Output, ALL_FORMATS, BlobSource, BufferTarget,
  Mp4OutputFormat, CanvasSource, AudioBufferSource,
  VideoSampleSink, AudioBufferSink, QUALITY_HIGH, QUALITY_MEDIUM,
} from 'mediabunny'
import type { Range } from './timeline'
import { drawLogo, type LogoConfig } from './logo'

export interface ExportOptions {
  source: Blob
  /** Ordered source-time ranges to keep (from keepIntervals()). */
  keep: Range[]
  logo: LogoConfig
  /** Optional branded clips stitched before / after the recording (played whole, no logo). */
  intro?: Blob | null
  outro?: Blob | null
  /** Optional background-music bed mixed UNDER all audio for the whole timeline. volume is 0–100. */
  music?: { blob: Blob; volume: number } | null
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

const AUDIO_RATE = 48000 // common master rate → mixed-rate clips resample to this before muxing

// Smallest gap (seconds) forced between consecutive output frame timestamps. Above the encoder's
// microsecond resolution so two frames never collide, but negligible for playback. Only ever applied
// at a range boundary / leading frame (never in steady state), so it introduces no visible drift.
const MIN_TS_STEP = 1e-4

/**
 * Map a decoded frame's source timestamp to its output-timeline timestamp.
 *
 * MediaBunny's `VideoSampleSink.samples(start, end)` yields a LEADING frame whose timestamp is <=
 * `rangeStart` (the frame visible AT the cut). Feeding `outCursor + (sampleTs - rangeStart)` straight
 * to the encoder then breaks two ways when a trim/split lands mid-frame: it goes NEGATIVE for a
 * trimmed start (`CanvasSource.add` rejects negative timestamps) and goes BACKWARDS at a split
 * boundary (WebCodecs requires monotonically-increasing timestamps). So we clamp the in-range offset
 * to >= 0 and force each output timestamp strictly above the previous one.
 */
export function mapOutputTimestamp(
  sampleTs: number,
  rangeStart: number,
  outCursor: number,
  lastOutTs: number,
): number {
  const raw = outCursor + Math.max(0, sampleTs - rangeStart)
  return Math.max(raw, lastOutTs + MIN_TS_STEP)
}

export function canExportVideo(): boolean {
  return typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis
}

export function keptDuration(keep: Range[]): number {
  return keep.reduce((a, r) => a + (r.end - r.start), 0)
}

/** One clip in the output timeline: its decoded input, the ranges to keep, and whether to burn the logo. */
interface Segment {
  input: Input
  ranges: Range[]
  videoDuration: number
  applyLogo: boolean
}

async function openSegment(source: Blob, keep: Range[] | null, applyLogo: boolean): Promise<Segment> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('A clip has no video track.')
  const ranges = keep ?? [{ start: 0, end: await input.computeDuration() }]
  return { input, ranges, videoDuration: keptDuration(ranges), applyLogo }
}

/** Cover-fit source frame dims into the output box (fill, crop overflow), centered. Returns draw rect. */
function coverRect(iw: number, ih: number, ow: number, oh: number): [number, number, number, number] {
  const scale = Math.max(ow / iw, oh / ih)
  const dw = iw * scale
  const dh = ih * scale
  return [(ow - dw) / 2, (oh - dh) / 2, dw, dh]
}

export async function exportEditedVideo(opts: ExportOptions): Promise<Blob> {
  const { source, keep, logo, intro, outro, music, onProgress, signal } = opts
  if (!canExportVideo()) throw new Error('This browser cannot export video. Please use Chrome or Edge.')
  if (keep.length === 0) throw new Error('Nothing to export — the whole clip is trimmed/cut.')

  // Segments in play order. The main recording defines the output resolution.
  const segments: Segment[] = []
  if (intro) segments.push(await openSegment(intro, null, false))
  const main = await openSegment(source, keep, true)
  segments.push(main)
  if (outro) segments.push(await openSegment(outro, null, false))

  const mainVideo = await main.input.getPrimaryVideoTrack()
  const width = mainVideo!.displayWidth || mainVideo!.codedWidth
  const height = mainVideo!.displayHeight || mainVideo!.codedHeight

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context for export.')

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(videoSource)

  const totalVideoDuration = segments.reduce((a, s) => a + s.videoDuration, 0) || 1

  // Decode the optional music bed up front (resampled to the master rate) so it can be mixed under
  // whatever segment audio exists — or stand alone if the video is otherwise silent.
  const musicBuf = music?.blob ? await decodeAudio(music.blob, AUDIO_RATE) : null

  // Build the master audio timeline up front (so silent gaps line up with the video) — only if any
  // segment has an audio track OR a music bed is present.
  const master = await buildMasterAudio(segments, totalVideoDuration, musicBuf, music?.volume ?? 0)
  let audioSource: AudioBufferSource | null = null
  if (master) {
    audioSource = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_MEDIUM })
    output.addAudioTrack(audioSource)
  }

  await output.start()

  // ---- VIDEO: draw every segment's frames (cover-fit) with a continuous output clock ----
  // `outCursor` is the running base for each kept range; `lastOutTs` guards the encoder contract
  // (non-negative + strictly increasing) since the sink hands us a leading frame before each cut.
  const videoWeight = master ? 0.85 : 1
  let outCursor = 0
  let lastOutTs = -Infinity
  for (const seg of segments) {
    const vTrack = await seg.input.getPrimaryVideoTrack()
    if (!vTrack) continue
    const iw = vTrack.displayWidth || vTrack.codedWidth
    const ih = vTrack.displayHeight || vTrack.codedHeight
    const [dx, dy, dw, dh] = coverRect(iw, ih, width, height)
    const sink = new VideoSampleSink(vTrack)
    for (const range of seg.ranges) {
      for await (const sample of sink.samples(range.start, range.end)) {
        if (signal?.aborted) { sample.close(); throw new DOMException('Export cancelled', 'AbortError') }
        const outTs = mapOutputTimestamp(sample.timestamp, range.start, outCursor, lastOutTs)
        lastOutTs = outTs
        ctx.clearRect(0, 0, width, height)
        sample.draw(ctx, dx, dy, dw, dh)
        if (seg.applyLogo) drawLogo(ctx, logo, width, height)
        await videoSource.add(outTs, sample.duration)
        sample.close()
        onProgress?.(Math.min(0.98, (outTs / totalVideoDuration) * videoWeight))
      }
      outCursor += range.end - range.start
    }
  }
  videoSource.close()

  // ---- AUDIO: one master buffer already sized to the whole video timeline ----
  if (master && audioSource) {
    await audioSource.add(master)
    audioSource.close()
    onProgress?.(0.99)
  }

  await output.finalize()
  onProgress?.(1)
  const bytes = (output.target as BufferTarget).buffer
  if (!bytes) throw new Error('Export produced no data.')
  return new Blob([bytes], { type: 'video/mp4' })
}

/**
 * Assemble one AudioBuffer covering the full video timeline. Each KEPT RANGE's audio is trimmed to
 * exactly its [start,end] window, resampled to AUDIO_RATE, and written at the same running output
 * offset the video loop uses for that range — so audio stays aligned with the frames across every
 * cut (the decoder returns a block that starts just before each cut; without trimming that overhang
 * the audio slides progressively ahead of the video). Ranges with no audio leave silence.
 * An optional `music` bed (already at AUDIO_RATE) is then mixed UNDER everything at `musicVolume`%,
 * looped to fill the timeline and clamped to avoid clipping.
 * Returns null only when there is no segment audio AND no music (→ silent video, no audio track).
 */
async function buildMasterAudio(
  segments: Segment[],
  totalVideoDuration: number,
  music: AudioBuffer | null,
  musicVolume: number,
): Promise<AudioBuffer | null> {
  // Collect each kept range's trimmed audio paired with the output offset (seconds) it belongs at —
  // the offset advances by each range's length, mirroring the video loop's outCursor exactly.
  const placed: { buf: AudioBuffer; offsetSec: number }[] = []
  let outCursor = 0
  for (const seg of segments) {
    const track = await seg.input.getPrimaryAudioTrack()
    const sink = track ? new AudioBufferSink(track) : null
    for (const range of seg.ranges) {
      if (sink) {
        const buf = await collectRangeAudio(sink, range)
        if (buf) placed.push({ buf, offsetSec: outCursor })
      }
      outCursor += range.end - range.start
    }
  }
  if (placed.length === 0 && !music) return null

  const channels = Math.max(1, music?.numberOfChannels ?? 1, ...placed.map((p) => p.buf.numberOfChannels))
  const totalLen = Math.max(1, Math.ceil(totalVideoDuration * AUDIO_RATE))
  const master = new AudioBuffer({ length: totalLen, numberOfChannels: channels, sampleRate: AUDIO_RATE })

  for (const { buf, offsetSec } of placed) {
    const startSample = Math.round(offsetSec * AUDIO_RATE)
    const copyLen = Math.min(buf.length, totalLen - startSample)
    if (copyLen <= 0) continue
    for (let ch = 0; ch < channels; ch++) {
      const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1))
      master.getChannelData(ch).set(src.subarray(0, copyLen), startSample)
    }
  }

  // Mix the music bed under the voice.
  if (music && music.length > 0 && musicVolume > 0) {
    const masterChannels = Array.from({ length: channels }, (_, ch) => master.getChannelData(ch))
    const musicChannels = Array.from({ length: music.numberOfChannels }, (_, ch) => music.getChannelData(ch))
    mixMusicBed(masterChannels, musicChannels, musicVolume)
  }
  return master
}

/**
 * Mix a music bed (per-channel Float32 data) UNDER an already-assembled master (per-channel Float32
 * data), in place. The music is looped to fill the master's full length (and thereby trimmed if
 * longer), scaled by `volume`% gain, summed into the master, and each summed sample is clamped to
 * [-1, 1] to prevent clipping. Mono music fans out to every master channel. Pure + browser-free so
 * the core mixing math is unit-testable.
 */
export function mixMusicBed(master: Float32Array[], music: Float32Array[], volume: number): void {
  if (!master.length || !music.length || volume <= 0) return
  const gain = volume / 100
  for (let ch = 0; ch < master.length; ch++) {
    const out = master[ch]
    const src = music[Math.min(ch, music.length - 1)]
    const mlen = src.length
    if (mlen === 0) continue
    for (let i = 0; i < out.length; i++) {
      let s = out[i] + src[i % mlen] * gain
      if (s > 1) s = 1
      else if (s < -1) s = -1
      out[i] = s
    }
  }
}

/** Decode an audio (or video) Blob into a single AudioBuffer at `rate`, resampling if needed. */
async function decodeAudio(blob: Blob, rate: number): Promise<AudioBuffer> {
  const bytes = await blob.arrayBuffer()
  // A short-lived AudioContext just for decoding; decodeAudioData resamples to the context rate,
  // but that isn't guaranteed to be `rate`, so normalise below.
  const AC: typeof AudioContext =
    (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext
    ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ac = new AC()
  try {
    const decoded = await ac.decodeAudioData(bytes)
    return decoded.sampleRate === rate ? decoded : await resample(decoded, rate)
  } finally {
    void ac.close()
  }
}

/**
 * Compute how to trim one range's concatenated source audio down to exactly [rangeStart, rangeEnd].
 * `firstTs` is the source timestamp of the first decoded block, which the sink returns starting at
 * or just before rangeStart. Returns the leading samples to drop (the pre-cut overhang) and the
 * sample count to keep (capped at what's available). Pure so the alignment math is unit-testable.
 */
export function audioTrimWindow(
  rangeStart: number,
  rangeEnd: number,
  firstTs: number,
  srcRate: number,
  mergedLen: number,
): { skip: number; keepLen: number } {
  const skip = Math.max(0, Math.round((rangeStart - firstTs) * srcRate))
  const want = Math.round((rangeEnd - rangeStart) * srcRate)
  const keepLen = Math.max(0, Math.min(mergedLen - skip, want))
  return { skip, keepLen }
}

/**
 * Decode one kept range's audio, trimmed to exactly [range.start, range.end] and resampled to
 * AUDIO_RATE. The sink hands back a leading block whose timestamp precedes range.start (the block
 * containing the cut); audioTrimWindow drops that overhang so the range's audio lines up with its
 * video frames. Returns null if the range has no audio.
 */
async function collectRangeAudio(sink: AudioBufferSink, range: Range): Promise<AudioBuffer | null> {
  const chunks: AudioBuffer[] = []
  let firstTs: number | null = null
  for await (const wrapped of sink.buffers(range.start, range.end)) {
    if (firstTs === null) firstTs = wrapped.timestamp
    chunks.push(wrapped.buffer)
  }
  if (!chunks.length || firstTs === null) return null

  const srcRate = chunks[0].sampleRate
  const channels = chunks[0].numberOfChannels
  const totalLen = chunks.reduce((a, b) => a + b.length, 0)
  const merged = new AudioBuffer({ length: totalLen, numberOfChannels: channels, sampleRate: srcRate })
  let at = 0
  for (const c of chunks) {
    for (let ch = 0; ch < channels; ch++) merged.getChannelData(ch).set(c.getChannelData(ch), at)
    at += c.length
  }

  const { skip, keepLen } = audioTrimWindow(range.start, range.end, firstTs, srcRate, merged.length)
  if (keepLen <= 0) return null
  const trimmed = new AudioBuffer({ length: keepLen, numberOfChannels: channels, sampleRate: srcRate })
  for (let ch = 0; ch < channels; ch++) {
    trimmed.getChannelData(ch).set(merged.getChannelData(ch).subarray(skip, skip + keepLen), 0)
  }
  return srcRate === AUDIO_RATE ? trimmed : resample(trimmed, AUDIO_RATE)
}

/** Resample an AudioBuffer to `rate` via an OfflineAudioContext. */
async function resample(buffer: AudioBuffer, rate: number): Promise<AudioBuffer> {
  const frames = Math.ceil(buffer.duration * rate)
  const oac = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, frames), rate)
  const src = oac.createBufferSource()
  src.buffer = buffer
  src.connect(oac.destination)
  src.start()
  return oac.startRendering()
}
