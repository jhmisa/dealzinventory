export const IMAGE_SIZES = {
  display: { width: 1080, height: 1080, quality: 0.82 },
  thumbnail: { width: 256, height: 256, quality: 0.80 },
} as const

export type ImageSizeKey = keyof typeof IMAGE_SIZES

export const VIDEO_SPECS = {
  width: 1080,
  height: 1080,
  codec: 'libx264',
  crf: 23,
  maxDurationSec: 60,
  maxSizeBytes: 25 * 1024 * 1024,
  format: 'mp4',
  audio: false,
} as const

export const FORMAT_PREFERENCE = {
  image: ['webp', 'jpeg'] as const,
  video: ['mp4'] as const,
}
