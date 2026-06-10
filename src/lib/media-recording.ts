import { humanFileSize } from './image-compression'

// Recorded voice notes and webcam videos are sent to Facebook Messenger through
// Missive's Drafts API, which base64-encodes attachments into a JSON payload
// capped at 10 MB. Phase 0 spike (docs/investigations/messaging-media-recording-spike.md)
// confirmed clips up to ~7 MB raw / ~9.4 MB base64 deliver and play, and that
// WebM/Opus + WebM/VP8 play natively on the customer's phone (Facebook re-encodes
// on its CDN), so no MP4 transcoding is needed.

// Hard size budget for a single recorded clip (raw bytes, before base64).
// 6 MB → ~8.05 MB base64, leaving headroom under Missive's 10 MB payload cap.
export const MEDIA_MAX_BYTES = 6 * 1024 * 1024

// Recording duration caps (hard-stop the recorder when hit).
export const VIDEO_MAX_DURATION_S = 60
export const AUDIO_MAX_DURATION_S = 180

// Capture settings tuned so a max-length clip stays within MEDIA_MAX_BYTES.
// Video: ~6 MB / 60s ≈ 800 kbps total budget; keep video+audio comfortably under it.
export const VIDEO_BITS_PER_SECOND = 700_000
export const VIDEO_AUDIO_BITS_PER_SECOND = 64_000
// Voice notes: low-bitrate Opus is plenty for speech and keeps 3 min ≈ 1 MB.
export const VOICE_BITS_PER_SECOND = 48_000

// getUserMedia video constraints — 480p keeps bitrate honest and files small.
export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 854 },
  height: { ideal: 480 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: 'user',
}

export type RecordingKind = 'audio' | 'video'

export interface SupportedMimeType {
  mimeType: string
  extension: string
}

// Codec/container preference per kind, most-preferred first. Chrome yields WebM,
// Safari falls through to MP4 — both confirmed to play in Messenger.
const MIME_PREFERENCES: Record<RecordingKind, SupportedMimeType[]> = {
  audio: [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/mpeg', extension: 'mp3' },
  ],
  video: [
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ],
}

/**
 * Pick the first MediaRecorder-supported container/codec for the given kind.
 * Returns null if the browser supports none (caller should surface an error).
 */
export function pickSupportedMimeType(kind: RecordingKind): SupportedMimeType | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const candidate of MIME_PREFERENCES[kind]) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate
  }
  return null
}

/** True if this mime type is a recordable/sendable audio or video clip. */
export function isRecordableMedia(mimeType: string): boolean {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/')
}

export { humanFileSize }
