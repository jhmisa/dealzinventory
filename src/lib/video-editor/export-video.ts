// Client-side video export via MediaBunny (WebCodecs). Keeps only `keepIntervals`
// (re-timestamped continuously so there are no gaps), draws each frame + logo onto a
// canvas, re-encodes H.264/AAC, muxes MP4. Chromium-only (WebCodecs VideoEncoder).
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
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export function canExportVideo(): boolean {
  return typeof globalThis !== 'undefined' && 'VideoEncoder' in globalThis
}

function keptDuration(keep: Range[]): number {
  return keep.reduce((a, r) => a + (r.end - r.start), 0)
}

export async function exportEditedVideo(opts: ExportOptions): Promise<Blob> {
  const { source, keep, logo, onProgress, signal } = opts
  if (!canExportVideo()) {
    throw new Error('This browser cannot export video. Please use Chrome or Edge.')
  }
  if (keep.length === 0) throw new Error('Nothing to export — the whole clip is trimmed/cut.')

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) })
  const videoTrack = await input.getPrimaryVideoTrack()
  if (!videoTrack) throw new Error('No video track found in the source file.')
  const audioTrack = await input.getPrimaryAudioTrack()

  const width = videoTrack.displayWidth || videoTrack.codedWidth
  const height = videoTrack.displayHeight || videoTrack.codedHeight

  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context for export.')

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
  const videoSource = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH })
  output.addVideoTrack(videoSource)

  let audioSource: AudioBufferSource | null = null
  if (audioTrack) {
    audioSource = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_MEDIUM })
    output.addAudioTrack(audioSource)
  }

  await output.start()

  const total = keptDuration(keep) || 1
  const videoWeight = audioTrack ? 0.5 : 1

  // ---- VIDEO: keep-loop, continuous re-timestamping, per-frame logo burn ----
  const videoSink = new VideoSampleSink(videoTrack)
  let outCursor = 0
  for (const range of keep) {
    for await (const sample of videoSink.samples(range.start, range.end)) {
      if (signal?.aborted) { sample.close(); throw new DOMException('Export cancelled', 'AbortError') }
      const outTs = outCursor + (sample.timestamp - range.start)
      ctx.clearRect(0, 0, width, height)
      sample.draw(ctx, 0, 0, width, height)
      drawLogo(ctx, logo, width, height)
      await videoSource.add(outTs, sample.duration)
      sample.close()
      onProgress?.(Math.min(0.98, (outTs / total) * videoWeight))
    }
    outCursor += range.end - range.start
  }
  videoSource.close()

  // ---- AUDIO: sequential append of kept buffers (MediaBunny lays them end-to-end) ----
  if (audioTrack && audioSource) {
    const audioSink = new AudioBufferSink(audioTrack)
    let played = 0
    for (const range of keep) {
      for await (const wrapped of audioSink.buffers(range.start, range.end)) {
        if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
        await audioSource.add(wrapped.buffer)
        played += wrapped.duration
        onProgress?.(Math.min(0.98, 0.5 + (played / total) * 0.5))
      }
    }
    audioSource.close()
  }

  await output.finalize()
  onProgress?.(1)
  const bytes = (output.target as BufferTarget).buffer
  if (!bytes) throw new Error('Export produced no data.')
  return new Blob([bytes], { type: 'video/mp4' })
}
