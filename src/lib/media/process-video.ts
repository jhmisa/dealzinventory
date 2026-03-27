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
      try {
        const ffmpeg = new FFmpeg()
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
        const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript')
        const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
        await ffmpeg.load({ coreURL, wasmURL })
        ffmpegInstance = ffmpeg
      } catch (e) {
        console.error('[video] FFmpeg load failed:', e)
        loadPromise = null
        throw e
      }
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
      '-vf', 'scale=256:256:force_original_aspect_ratio=increase,crop=256:256',
      '-q:v', '2',
      outFile,
    ])

    // If seeking to 2s fails (video shorter than 2s), try first frame
    if (exitCode !== 0) {
      await safeDelete(ffmpeg, outFile)
      await ffmpeg.exec([
        '-i', inputFile,
        '-vframes', '1',
        '-vf', 'scale=256:256:force_original_aspect_ratio=increase,crop=256:256',
        '-q:v', '2',
        outFile,
      ])
    }

    const data = await ffmpeg.readFile(outFile)
    if (typeof data === 'string') throw new Error('Unexpected string from readFile')
    return new Blob([data.buffer], { type: isWebP ? 'image/webp' : 'image/jpeg' })
  } catch (err) {
    console.error('[video] thumbnail extraction failed:', err)
    throw err
  } finally {
    await safeDelete(ffmpeg, outFile)
  }
}

async function extractThumbnailFromVideo(file: File | Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url

    video.onloadeddata = () => {
      video.currentTime = Math.min(2, video.duration / 2)
    }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      // Center-crop to square
      const size = Math.min(video.videoWidth, video.videoHeight)
      const sx = (video.videoWidth - size) / 2
      const sy = (video.videoHeight - size) / 2
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 256, 256)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/jpeg',
        0.8,
      )
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Video element failed to load'))
    }
  })
}

async function processVideoCanvas(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<ProcessedVideo> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder not supported')
  }

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'

  const url = URL.createObjectURL(file)

  try {
    // Load video metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('Failed to load video for canvas processing'))
      video.src = url
    })

    const { width, height, maxDurationSec } = VIDEO_SPECS
    const effectiveDuration = Math.min(video.duration, maxDurationSec)
    const srcW = video.videoWidth
    const srcH = video.videoHeight

    // Center-crop source rect
    const srcSize = Math.min(srcW, srcH)
    const sx = (srcW - srcSize) / 2
    const sy = (srcH - srcSize) / 2

    // Set up canvas
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    // Check captureStream support
    if (!('captureStream' in canvas)) {
      throw new Error('canvas.captureStream not supported')
    }

    const stream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30)

    // Pick best available codec
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : (() => { throw new Error('No suitable MediaRecorder MIME type for canvas fallback') })()

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    // Wait for video to be ready to play
    await new Promise<void>((resolve, reject) => {
      video.oncanplay = () => resolve()
      video.onerror = () => reject(new Error('Video cannot play'))
      // If already ready
      if (video.readyState >= 3) resolve()
    })

    // Start recording and playback
    recorder.start(1000)
    video.currentTime = 0
    await video.play()

    // Draw frames loop
    await new Promise<void>((resolve) => {
      function drawFrame() {
        if (video.paused || video.ended || video.currentTime >= effectiveDuration) {
          video.pause()
          recorder.stop()
          resolve()
          return
        }
        ctx.drawImage(video, sx, sy, srcSize, srcSize, 0, 0, width, height)
        onProgress?.(Math.min(video.currentTime / effectiveDuration, 1))
        requestAnimationFrame(drawFrame)
      }
      drawFrame()
    })

    // Wait for recorder to finish
    const videoBlob = await new Promise<Blob>((resolve) => {
      if (recorder.state === 'inactive') {
        resolve(new Blob(chunks, { type: mimeType }))
      } else {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
      }
    })

    onProgress?.(1)

    const thumbnail = await extractThumbnailFromVideo(file)
    const id = crypto.randomUUID()

    return {
      video: videoBlob,
      thumbnail,
      id,
      duration: effectiveDuration,
      format: 'webm',
    }
  } finally {
    video.pause()
    video.src = ''
    URL.revokeObjectURL(url)
  }
}

export async function tryProcessVideo(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<ProcessedVideo> {
  // Tier 1: FFmpeg WASM
  try {
    return await processVideo(file, onProgress)
  } catch (err) {
    console.warn('[video] FFmpeg processing failed, trying canvas fallback:', err)
  }

  // Tier 2: Canvas + MediaRecorder
  try {
    return await processVideoCanvas(file, onProgress)
  } catch (err) {
    console.warn('[video] Canvas processing failed, uploading raw:', err)
  }

  // Tier 3: Raw upload
  const thumbnail = await extractThumbnailFromVideo(file)
  const ext = file instanceof File ? (file.name.split('.').pop() ?? 'mp4') : 'mp4'
  return {
    video: file instanceof Blob ? file : new Blob([file]),
    thumbnail,
    id: crypto.randomUUID(),
    duration: 0,
    format: ext,
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

    const vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`

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
  } catch (err) {
    console.error('[video] processVideo failed:', err)
    throw err
  } finally {
    ffmpeg.off('progress', progressHandler)
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}
