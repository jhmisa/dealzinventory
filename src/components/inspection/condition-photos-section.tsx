import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MediaUploader } from '@/components/shared/media-uploader'
import { useAddItemMedia, useDeleteItemMedia } from '@/hooks/use-items'
import type { ItemMedia } from '@/lib/types'

interface ConditionPhotosSectionProps {
  itemId: string
  media: ItemMedia[]
}

export function ConditionPhotosSection({ itemId, media }: ConditionPhotosSectionProps) {
  const addMedia = useAddItemMedia()
  const deleteMedia = useDeleteItemMedia()

  function handleUpload(url: string) {
    addMedia.mutate(
      { itemId, fileUrl: url, description: 'Inspection photo' },
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
      <CardContent className="space-y-4">
        <MediaUploader
          bucket="item-media"
          pathPrefix={`items/${itemId}`}
          onUpload={handleUpload}
        />

        {media.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {media.map((m) => (
              <div key={m.id} className="relative group">
                <img
                  src={m.file_url}
                  alt={m.description ?? 'Condition photo'}
                  className="w-full aspect-square object-cover rounded-lg border"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDelete(m.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
