import { useState } from 'react'
import { Check, Film, Play, X, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSourceMedia } from '@/hooks/use-social-media-posts'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { MediaSourceType } from '@/services/social-media-posts'

interface MediaPickerProps {
  sourceType: MediaSourceType | undefined
  sourceId: string | undefined
  productId: string | null | undefined
  accessoryId: string | null | undefined
  selected: string[]
  onSelectionChange: (urls: string[]) => void
}

export function MediaPicker({ sourceType, sourceId, productId, accessoryId, selected, onSelectionChange }: MediaPickerProps) {
  const { data: media = [], isLoading } = useSourceMedia(sourceType, sourceId, productId, accessoryId)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewIsVideo, setPreviewIsVideo] = useState(false)

  if (!sourceId) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Select an item first to see available media.
      </p>
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading media...</p>
  }

  if (media.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No media found for this item.
      </p>
    )
  }

  function toggle(url: string) {
    if (selected.includes(url)) {
      onSelectionChange(selected.filter((u) => u !== url))
    } else {
      onSelectionChange([...selected, url])
    }
  }

  function openPreview(url: string, isVideo: boolean) {
    setPreviewUrl(url)
    setPreviewIsVideo(isVideo)
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {media.map((m) => {
          const isSelected = selected.includes(m.url)
          const isVideo = m.media_type === 'video'
          const thumbSrc = m.thumbnail_url ?? m.url

          return (
            <div key={m.url} className="relative group">
              <button
                type="button"
                onClick={() => toggle(m.url)}
                className={cn(
                  'relative aspect-square w-full rounded-md overflow-hidden border-2 transition-colors',
                  isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-muted-foreground/30'
                )}
              >
                {isVideo ? (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    {m.thumbnail_url ? (
                      <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                ) : (
                  <img src={thumbSrc} alt="" className="w-full h-full object-cover" />
                )}

                {isSelected && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground rounded-full p-1">
                      <Check className="h-3 w-3" />
                    </div>
                  </div>
                )}

                <Badge
                  variant="secondary"
                  className="absolute bottom-1 left-1 text-[10px] px-1 py-0"
                >
                  {m.source}
                </Badge>

                {isVideo && (
                  <div className="absolute top-1 right-1">
                    <Film className="h-3 w-3 text-white drop-shadow" />
                  </div>
                )}
              </button>

              {/* Preview button — shows on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openPreview(m.url, isVideo)
                }}
                className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white rounded p-1 z-10"
                title="Preview"
              >
                {isVideo ? <Play className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
          )
        })}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-[600px] p-2">
          {previewUrl && previewIsVideo ? (
            <video
              src={previewUrl}
              controls
              autoPlay
              className="w-full max-h-[70vh] rounded-md bg-black"
            />
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt=""
              className="w-full max-h-[70vh] object-contain rounded-md"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
