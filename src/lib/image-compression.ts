import imageCompression, { type Options } from 'browser-image-compression'

// Longest edge in px. Aspect ratio is preserved — a 1080×1920 portrait
// screenshot stays 1080×1920; a 4032×3024 photo becomes 1920×1440.
// Never upscales smaller images.
const MAX_EDGE_PX = 1920

// WebP quality (0-1). 0.82 is a good balance for photos and screenshots.
const WEBP_QUALITY = 0.82

// Hard post-compression cap. If the compressed file is still larger than
// this, we reject the upload rather than silently letting a huge attachment
// through. In practice an iPhone photo compresses to ~200-500KB at these
// settings, so this only triggers on pathological inputs.
const MAX_SIZE_MB = 2

// Maximum accepted input size before we even try to compress. Lets users
// drop in raw phone photos (often 5-15MB) but stops absurd inputs.
const MAX_INPUT_SIZE_MB = 50

export interface CompressImageOptions {
  signal?: AbortSignal
  onProgress?: (percent: number) => void
}

/**
 * Compress an image file for messaging attachments.
 *
 * - Preserves aspect ratio (no cropping)
 * - Downscales longest edge to MAX_EDGE_PX, never upscales
 * - Converts to WebP at WEBP_QUALITY
 * - Throws if compressed size is still > MAX_SIZE_MB
 *
 * Non-image files must not be passed to this function.
 */
export async function compressImageForMessaging(
  file: File,
  { signal, onProgress }: CompressImageOptions = {},
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('compressImageForMessaging: expected an image file')
  }

  if (file.size > MAX_INPUT_SIZE_MB * 1024 * 1024) {
    throw new Error(
      `Image is too large to upload (${humanFileSize(file.size)}). Max ${MAX_INPUT_SIZE_MB}MB.`,
    )
  }

  const opts: Options = {
    maxSizeMB: MAX_SIZE_MB,
    maxWidthOrHeight: MAX_EDGE_PX,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: WEBP_QUALITY,
    signal,
    onProgress,
  }

  const compressed = await imageCompression(file, opts)

  // The library returns a File with the original name but a different mime
  // type. Rename to .webp so the extension matches.
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const renamed = new File([compressed], `${baseName}.webp`, {
    type: 'image/webp',
    lastModified: Date.now(),
  })

  // Belt-and-suspenders: the library should respect maxSizeMB, but verify.
  if (renamed.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(
      `Image is still too large after compression (${humanFileSize(renamed.size)}). Please resize before uploading.`,
    )
  }

  return renamed
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export const IMAGE_MAX_SIZE_MB = MAX_SIZE_MB
export const IMAGE_MAX_INPUT_SIZE_MB = MAX_INPUT_SIZE_MB
export const IMAGE_MAX_EDGE_PX = MAX_EDGE_PX
