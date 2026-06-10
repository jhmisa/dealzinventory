import { fetchFile } from '@ffmpeg/util'
import { loadFFmpeg } from './process-video'

// Facebook Messenger does NOT play audio-only WebM/Opus — it arrives blank
// (confirmed in the Phase 0 spike: a3_voice.webm never showed, only the MP3 and
// M4A clips did). Chrome's MediaRecorder can only capture audio as WebM/Opus, so
// a recorded voice note has to be transcoded to AAC/M4A (which Messenger accepts)
// before sending. Safari records audio/mp4 directly and skips this path.
//
// Reuses the shared ffmpeg.wasm instance from process-video.ts (loadFFmpeg).

/** True when a recorded clip needs transcoding to reach Messenger playably. */
export function audioNeedsTranscode(mimeType: string): boolean {
  return mimeType.startsWith('audio/webm') || mimeType.startsWith('audio/ogg')
}

export interface TranscodedAudio {
  blob: Blob
  mimeType: string
  extension: string
}

/** Transcode a recorded audio blob (WebM/Opus) to AAC in an M4A container. */
export async function transcodeAudioToM4a(input: Blob): Promise<TranscodedAudio> {
  const ffmpeg = await loadFFmpeg()
  const inName = 'voice-in'
  const outName = 'voice-out.m4a'
  try {
    await ffmpeg.writeFile(inName, await fetchFile(input))
    const code = await ffmpeg.exec([
      '-i', inName,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outName,
    ])
    if (code !== 0) throw new Error(`audio transcode failed (exit ${code})`)
    const data = await ffmpeg.readFile(outName)
    if (typeof data === 'string') throw new Error('unexpected string from ffmpeg readFile')
    return {
      blob: new Blob([data.buffer], { type: 'audio/mp4' }),
      mimeType: 'audio/mp4',
      extension: 'm4a',
    }
  } finally {
    try {
      await ffmpeg.deleteFile(inName)
    } catch {
      // file may not exist
    }
    try {
      await ffmpeg.deleteFile(outName)
    } catch {
      // file may not exist
    }
  }
}
