import { useState } from 'react'
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MediaInput, type MediaItem } from '@/components/shared/media-input'
import { AiEnhanceDialog } from './ai-enhance-dialog'
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

interface PhotoSectionProps {
  productId: string
  existingMedia: ProductMediaItem[]
  className?: string
}

const BUCKET = 'photo-group-media'

export function PhotoSection({ productId, existingMedia, className }: PhotoSectionProps) {
  const [enhanceImageUrl, setEnhanceImageUrl] = useState<string | null>(null)
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false)

  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const photos = existingMedia.filter((m) => m.media_type === 'image')

  function handleUpload(result: UploadResult) {
    addMediaMutation.mutate(
      { productId, fileUrl: result.displayUrl, role: 'gallery', mediaType: 'image' },
      {
        onError: (err) => toast.error(`Failed to save media record: ${err.message}`),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => toast.success('Photo deleted'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  function handleEnhance(imageUrl: string) {
    setEnhanceImageUrl(imageUrl)
    setEnhanceDialogOpen(true)
  }

  const mediaItems: MediaItem[] = photos.map((p) => ({
    id: p.id,
    url: p.file_url,
    type: 'image' as const,
  }))

  return (
    <div className={cn('space-y-6', className)}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MediaInput
            accept="image"
            bucket={BUCKET}
            path={`product-media/${productId}`}
            onUpload={handleUpload}
            onRemove={handleDelete}
            enableAiEnhance
            onEnhance={handleEnhance}
            existingMedia={mediaItems}
          />
        </CardContent>
      </Card>

      {photos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No photos yet. Upload images above to get started.</p>
        </div>
      )}

      <AiEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={setEnhanceDialogOpen}
        originalImageUrl={enhanceImageUrl}
        productId={productId}
      />
    </div>
  )
}
