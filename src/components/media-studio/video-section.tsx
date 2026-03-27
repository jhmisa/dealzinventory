import { Video, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MediaInput, type MediaItem } from '@/components/shared/media-input'
import { useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'
import type { UploadResult } from '@/lib/media'
import { cn } from '@/lib/utils'

interface ProductMediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

interface VideoSectionProps {
  productId: string
  existingMedia: ProductMediaItem[]
  className?: string
}

const BUCKET = 'photo-group-media'

export function VideoSection({ productId, existingMedia, className }: VideoSectionProps) {
  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const videos = existingMedia.filter((m) => m.media_type === 'video')

  function handleUpload(result: UploadResult) {
    addMediaMutation.mutate(
      { productId, fileUrl: result.displayUrl, role: 'gallery', mediaType: 'video' },
      {
        onError: (err) => toast.error(`Failed to save media record: ${err.message}`),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => toast.success('Video deleted'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  const mediaItems: MediaItem[] = videos.map((v) => ({
    id: v.id,
    url: v.file_url,
    type: 'video' as const,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4" />
            Upload Video
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediaInput
            accept="video"
            bucket={BUCKET}
            path={`product-media/${productId}`}
            onUpload={handleUpload}
            onRemove={handleDelete}
            existingMedia={mediaItems}
          />
        </CardContent>
      </Card>

      {videos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No videos yet. Upload a video above to get started.</p>
        </div>
      )}
    </div>
  )
}
