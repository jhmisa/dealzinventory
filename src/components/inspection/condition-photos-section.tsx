import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MediaInput } from '@/components/shared/media-input'
import { useAddItemMedia, useDeleteItemMedia } from '@/hooks/use-items'
import type { UploadResult } from '@/lib/media'
import type { ItemMedia } from '@/lib/types'

interface ConditionPhotosSectionProps {
  itemId: string
  media: ItemMedia[]
}

export function ConditionPhotosSection({ itemId, media }: ConditionPhotosSectionProps) {
  const addMedia = useAddItemMedia()
  const deleteMedia = useDeleteItemMedia()

  function handleUpload(result: UploadResult) {
    addMedia.mutate(
      { itemId, fileUrl: result.displayUrl, description: 'Inspection photo' },
      {
        onError: () => toast.error('Failed to save photo'),
      },
    )
  }

  function handleDelete(mediaId: string) {
    deleteMedia.mutate(
      { mediaId, itemId },
      {
        onSuccess: () => toast.success('Photo removed'),
        onError: () => toast.error('Failed to remove photo'),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Condition Photos</CardTitle>
      </CardHeader>
      <CardContent>
        <MediaInput
          accept="image"
          bucket="item-media"
          path={`items/${itemId}`}
          onUpload={handleUpload}
          onRemove={handleDelete}
          existingMedia={media.map((m) => ({
            id: m.id,
            url: m.file_url,
            type: 'image' as const,
          }))}
        />
      </CardContent>
    </Card>
  )
}
