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
  const videoWeight = master ? 0.85 : 1
  let outCursor = 0
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
        const outTs = outCursor + (sample.timestamp - range.start)
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
 * Assemble one AudioBuffer covering the full video timeline. Each segment's decoded audio is
 * resampled to AUDIO_RATE and written at the segment's running offset; segments with no audio (or
 * audio shorter than their video) leave silence — so audio never drifts out of sync with the frames.
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
  // Decode each segment's (kept) audio into a single buffer at AUDIO_RATE, or null if it has none.
  const perSegment: (AudioBuffer | null)[] = []
  let any = false
  for (const seg of segments) {
    const buf = await collectSegmentAudio(seg)
    perSegment.push(buf)
    if (buf) any = true
  }
  if (!any && !music) return null

  const channels = Math.max(1, music?.numberOfChannels ?? 1, ...perSegment.map((b) => b?.numberOfChannels ?? 1))
  const totalLen = Math.max(1, Math.ceil(totalVideoDuration * AUDIO_RATE))
  const master = new AudioBuffer({ length: totalLen, numberOfChannels: channels, sampleRate: AUDIO_RATE })

  let offsetSec = 0
  for (let i = 0; i < segments.length; i++) {
    const buf = perSegment[i]
    if (buf) {
      const startSample = Math.round(offsetSec * AUDIO_RATE)
      const copyLen = Math.min(buf.length, totalLen - startSample)
      for (let ch = 0; ch < channels; ch++) {
        const src = buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1))
        master.getChannelData(ch).set(src.subarray(0, Math.max(0, copyLen)), startSample)
      }
    }
    offsetSec += segments[i].videoDuration
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

/** Concatenate a segment's kept audio into one buffer at AUDIO_RATE (resampling if needed). */
async function collectSegmentAudio(seg: Segment): Promise<AudioBuffer | null> {
  const track = await seg.input.getPrimaryAudioTrack()
  if (!track) return null
  const sink = new AudioBufferSink(track)
  const chunks: AudioBuffer[] = []
  for (const range of seg.ranges) {
    for await (const wrapped of sink.buffers(range.start, range.end)) chunks.push(wrapped.buffer)
  }
  if (!chunks.length) return null

  const srcRate = chunks[0].sampleRate
  const channels = chunks[0].numberOfChannels
  const totalLen = chunks.reduce((a, b) => a + b.length, 0)
  const merged = new AudioBuffer({ length: totalLen, numberOfChannels: channels, sampleRate: srcRate })
  let at = 0
  for (const c of chunks) {
    for (let ch = 0; ch < channels; ch++) merged.getChannelData(ch).set(c.getChannelData(ch), at)
    at += c.length
  }
  if (srcRate === AUDIO_RATE) return merged
  return resample(merged, AUDIO_RATE)
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
