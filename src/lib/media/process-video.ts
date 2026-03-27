import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { VIDEO_SPECS } from './config'
import { getImageFormat } from './detect-format'

export interface ProcessedVideo {
  video: Blob
  thumbnail: Blob
  id: string
  duration: number
  format: string
}

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<void> | null = null

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      await ffmpeg.load({ coreURL, wasmURL })
      ffmpegInstance = ffmpeg
    })()
  }

  await loadPromise

  if (!ffmpegInstance) {
    loadPromise = null
    throw new Error('FFmpeg failed to load')
  }

  return ffmpegInstance
}

async function safeDelete(ffmpeg: FFmpeg, path: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(path)
  } catch {
    // file may not exist
  }
}

async function probeDuration(ffmpeg: FFmpeg, fileName: string): Promise<number> {
  const probeOutput = 'probe.txt'
  try {
    const code = await ffmpeg.ffprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      fileName,
      '-o', probeOutput,
    ])
    if (code !== 0) return 0
    const raw = await ffmpeg.readFile(probeOutput)
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const parsed = parseFloat(text.trim())
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  } finally {
    await safeDelete(ffmpeg, probeOutput)
  }
}

async function extractThumbnail(ffmpeg: FFmpeg, inputFile: string): Promise<Blob> {
  const { mimeType } = getImageFormat()
  const isWebP = mimeType === 'image/webp'
  const outFile = isWebP ? 'thumb.webp' : 'thumb.jpg'

  try {
    const exitCode = await ffmpeg.exec([
      '-i', inputFile,
      '-ss', '2',
      '-vframes', '1',
      '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=256:256',
      '-q:v', '2',
      outFile,
    ])

    // If seeking to 2s fails (video shorter than 2s), try first frame
    if (exitCode !== 0) {
      await safeDelete(ffmpeg, outFile)
      await ffmpeg.exec([
        '-i', inputFile,
        '-vframes', '1',
        '-vf', 'crop=min(iw\\,ih):min(iw\\,ih),scale=256:256',
        '-q:v', '2',
        outFile,
      ])
    }

    const data = await ffmpeg.readFile(outFile)
    if (typeof data === 'string') throw new Error('Unexpected string from readFile')
    return new Blob([data.buffer], { type: isWebP ? 'image/webp' : 'image/jpeg' })
  } finally {
    await safeDelete(ffmpeg, outFile)
  }
}

export async function processVideo(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<ProcessedVideo> {
  const ffmpeg = await loadFFmpeg()

  const inputName = 'input.mp4'
  const outputName = 'output.mp4'

  const progressHandler = ({ progress }: { progress: number; time: number }) => {
    onProgress?.(Math.min(Math.max(progress, 0), 1))
  }

  ffmpeg.on('progress', progressHandler)

  try {
    const inputData = await fetchFile(file)
    await ffmpeg.writeFile(inputName, inputData)

    const { width, height, maxDurationSec, crf, codec } = VIDEO_SPECS

    const vf = [
      'crop=min(iw\\,ih):min(iw\\,ih)',
      `scale=${width}:${height}`,
    ].join(',')

    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-an',
      '-vf', vf,
      '-c:v', codec,
      '-crf', String(crf),
      '-t', String(maxDurationSec),
      '-movflags', '+faststart',
      outputName,
    ])

    if (exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${exitCode}`)
    }

    const outputData = await ffmpeg.readFile(outputName)
    if (typeof outputData === 'string') {
      throw new Error('Unexpected string output from FFmpeg readFile')
    }

    const videoBlob = new Blob([outputData.buffer], { type: 'video/mp4' })
    const duration = await probeDuration(ffmpeg, outputName)
    const thumbnail = await extractThumbnail(ffmpeg, outputName)
    const id = crypto.randomUUID()

    return {
      video: videoBlob,
      thumbnail,
      id,
      duration,
      format: 'mp4',
    }
  } finally {
    ffmpeg.off('progress', progressHandler)
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}
