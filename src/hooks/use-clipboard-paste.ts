import { useEffect } from 'react'

interface UseClipboardPasteOptions {
  onPaste: (files: File[]) => void
  enabled?: boolean
  accept?: 'image' | 'video' | 'both'
}

export function useClipboardPaste({
  onPaste,
  enabled = true,
  accept = 'image',
}: UseClipboardPasteOptions) {
  useEffect(() => {
    if (!enabled) return

    function handlePaste(e: ClipboardEvent) {
      // Skip if user is typing in a text input
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }

      const items = e.clipboardData?.items
      if (!items) return

      const files: File[] = []
      for (const item of items) {
        if (item.kind !== 'file') continue

        const isImage = item.type.startsWith('image/')
        const isVideo = item.type.startsWith('video/')

        if (accept === 'image' && !isImage) continue
        if (accept === 'video' && !isVideo) continue
        if (accept === 'both' && !isImage && !isVideo) continue

        const file = item.getAsFile()
        if (file) files.push(file)
      }

      if (files.length > 0) {
        e.preventDefault()
        onPaste(files)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [onPaste, enabled, accept])
}
