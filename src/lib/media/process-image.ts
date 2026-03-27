import { IMAGE_SIZES, type ImageSizeKey } from './config'
import { getImageFormat } from './detect-format'

export interface ProcessedImage {
  id: string
  display: Blob
  thumbnail: Blob
  format: string
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-')
}

function loadImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

function resizeAndCompress(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number,
  mimeType: string,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Could not get canvas 2d context'))
      return
    }

    const srcSize = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - srcSize) / 2
    const sy = (img.naturalHeight - srcSize) / 2

    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, targetWidth, targetHeight)

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob returned null'))
      },
      mimeType,
      quality,
    )
  })
}

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  const img = await loadImage(file)
  const { mimeType, extension } = getImageFormat()
  const id = generateId()

  const [display, thumbnail] = await Promise.all(
    (['display', 'thumbnail'] as ImageSizeKey[]).map((key) => {
      const { width, height, quality } = IMAGE_SIZES[key]
      return resizeAndCompress(img, width, height, quality, mimeType)
    }),
  )

  return { id, display, thumbnail, format: extension }
}
