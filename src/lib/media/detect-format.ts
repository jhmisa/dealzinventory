let cachedFormat: { mimeType: string; extension: string } | null = null

function detectWebPSupport(): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

export function getImageFormat(): { mimeType: string; extension: string } {
  if (cachedFormat) return cachedFormat

  cachedFormat = detectWebPSupport()
    ? { mimeType: 'image/webp', extension: 'webp' }
    : { mimeType: 'image/jpeg', extension: 'jpeg' }

  return cachedFormat
}
