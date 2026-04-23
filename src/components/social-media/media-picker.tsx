import { Check, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSourceMedia } from '@/hooks/use-social-media-posts'
import { Badge } from '@/components/ui/badge'
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

  return (
    <div className="grid grid-cols-4 gap-2">
      {media.map((m) => {
        const isSelected = selected.includes(m.url)
        const isVideo = m.media_type === 'video'
        const thumbSrc = m.thumbnail_url ?? m.url

        return (
          <button
            key={m.url}
            type="button"
            onClick={() => toggle(m.url)}
            className={cn(
              'relative aspect-square rounded-md overflow-hidden border-2 transition-colors',
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
        )
      })}
    </div>
  )
}
