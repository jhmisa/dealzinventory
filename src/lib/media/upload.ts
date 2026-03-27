import { supabase } from '@/lib/supabase'
import { processImage } from './process-image'
import { processVideo } from './process-video'
import { getImageFormat } from './detect-format'

export interface UploadResult {
  id: string
  displayUrl: string
  thumbnailUrl: string
  format: string
  duration?: number
}

interface UploadMediaOptions {
  file: File | Blob
  type?: 'image' | 'video'
  bucket: string
  path: string
  onProgress?: (progress: number) => void
}

function detectMediaType(file: File | Blob): 'image' | 'video' {
  const mimeType = file.type || ''
  if (mimeType.startsWith('video/')) return 'video'
  return 'image'
}

export async function uploadMedia(options: UploadMediaOptions): Promise<UploadResult> {
  const { file, bucket, path, onProgress } = options
  const type = options.type ?? detectMediaType(file)

  if (type === 'image') {
    return uploadImage(file, bucket, path)
  } else {
    return uploadVideo(file, bucket, path, onProgress)
  }
}

async function uploadImage(file: File | Blob, bucket: string, path: string): Promise<UploadResult> {
  const processed = await processImage(file)
  const { extension } = getImageFormat()

  const displayPath = `${path}/${processed.id}_display.${extension}`
  const thumbPath = `${path}/${processed.id}_thumb.${extension}`
  const contentType = extension === 'webp' ? 'image/webp' : 'image/jpeg'

  const [displayResult, thumbResult] = await Promise.all([
    supabase.storage.from(bucket).upload(displayPath, processed.display, { contentType, upsert: false }),
    supabase.storage.from(bucket).upload(thumbPath, processed.thumbnail, { contentType, upsert: false }),
  ])

  if (displayResult.error) throw displayResult.error
  if (thumbResult.error) throw thumbResult.error

  const { data: displayUrl } = supabase.storage.from(bucket).getPublicUrl(displayPath)
  const { data: thumbUrl } = supabase.storage.from(bucket).getPublicUrl(thumbPath)

  return {
    id: processed.id,
    displayUrl: displayUrl.publicUrl,
    thumbnailUrl: thumbUrl.publicUrl,
    format: extension,
  }
}

async function uploadVideo(
  file: File | Blob,
  bucket: string,
  path: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResult> {
  const processed = await processVideo(file, onProgress)
  const { extension: imgExt } = getImageFormat()

  const ext = processed.format
  const videoContentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
  const videoPath = `${path}/${processed.id}.${ext}`
  const thumbPath = `${path}/${processed.id}_thumb.${imgExt}`
  const thumbContentType = imgExt === 'webp' ? 'image/webp' : 'image/jpeg'

  const [videoResult, thumbResult] = await Promise.all([
    supabase.storage.from(bucket).upload(videoPath, processed.video, { contentType: videoContentType, upsert: false }),
    supabase.storage.from(bucket).upload(thumbPath, processed.thumbnail, { contentType: thumbContentType, upsert: false }),
  ])

  if (videoResult.error) throw videoResult.error
  if (thumbResult.error) throw thumbResult.error

  const { data: videoUrl } = supabase.storage.from(bucket).getPublicUrl(videoPath)
  const { data: thumbUrl } = supabase.storage.from(bucket).getPublicUrl(thumbPath)

  return {
    id: processed.id,
    displayUrl: videoUrl.publicUrl,
    thumbnailUrl: thumbUrl.publicUrl,
    format: ext,
    duration: processed.duration,
  }
}
