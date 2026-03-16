import { useState, useMemo } from 'react'
import { GripVertical, Eye, EyeOff, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MediaUploader } from '@/components/shared/media-uploader'
import { useUpdateItem, useAddItemMedia, useUpdateItemMedia, useDeleteItemMedia } from '@/hooks/use-items'
import { cn } from '@/lib/utils'
import type { Item, ProductMedia, ItemMedia } from '@/lib/types'

type GalleryPhoto = {
  id: string
  source: 'product' | 'item'
  url: string
  description: string | null
  visible: boolean
}

interface UnifiedGalleryCardProps {
  item: Item
  productMedia: ProductMedia[]
  itemMedia: ItemMedia[]
}

export function UnifiedGalleryCard({ item, productMedia, itemMedia }: UnifiedGalleryCardProps) {
  const [showUploader, setShowUploader] = useState(false)
  const updateItem = useUpdateItem()
  const addMedia = useAddItemMedia()
  const updateMedia = useUpdateItemMedia()
  const deleteMedia = useDeleteItemMedia()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const photos = useMemo(() => {
    const hiddenIds = item.hidden_product_photo_ids ?? []

    const productPhotos: GalleryPhoto[] = [...productMedia]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: `product-${m.id}`,
        source: 'product' as const,
        url: m.file_url,
        description: m.role !== 'hero' ? m.role : null,
        visible: !hiddenIds.includes(m.id),
      }))

    const itemPhotos: GalleryPhoto[] = [...itemMedia]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: `item-${m.id}`,
        source: 'item' as const,
        url: m.file_url,
        description: m.description,
        visible: m.visible,
      }))

    const all = [...productPhotos, ...itemPhotos]

    const savedOrder = item.gallery_photo_order as string[] | null
    if (savedOrder && savedOrder.length > 0) {
      const orderMap = new Map(savedOrder.map((id, idx) => [id, idx]))
      const ordered: GalleryPhoto[] = []
      const unordered: GalleryPhoto[] = []

      for (const p of all) {
        if (orderMap.has(p.id)) {
          ordered.push(p)
        } else {
          unordered.push(p)
        }
      }

      ordered.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
      return [...ordered, ...unordered]
    }

    return all
  }, [productMedia, itemMedia, item.hidden_product_photo_ids, item.gallery_photo_order])

  function handleVisibilityToggle(photo: GalleryPhoto) {
    if (photo.source === 'product') {
      const realId = photo.id.replace('product-', '')
      const hiddenIds = item.hidden_product_photo_ids ?? []
      const newHidden = photo.visible
        ? [...hiddenIds, realId]
        : hiddenIds.filter((id) => id !== realId)

      updateItem.mutate(
        { id: item.id, updates: { hidden_product_photo_ids: newHidden } },
        { onError: () => toast.error('Failed to update visibility') },
      )
    } else {
      const realId = photo.id.replace('item-', '')
      updateMedia.mutate(
        { mediaId: realId, itemId: item.id, updates: { visible: !photo.visible } },
        { onError: () => toast.error('Failed to update visibility') },
      )
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = photos.findIndex((p) => p.id === active.id)
    const newIndex = photos.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(photos, oldIndex, newIndex)
    const newOrder = reordered.map((p) => p.id)

    updateItem.mutate(
      { id: item.id, updates: { gallery_photo_order: newOrder } },
      { onError: () => toast.error('Failed to save photo order') },
    )
  }

  function handleDeleteItemPhoto(photoId: string) {
    const realId = photoId.replace('item-', '')
    deleteMedia.mutate(
      { mediaId: realId, itemId: item.id },
      {
        onSuccess: () => toast.success('Photo removed'),
        onError: () => toast.error('Failed to remove photo'),
      },
    )
  }

  function handleUpload(url: string) {
    addMedia.mutate(
      { itemId: item.id, fileUrl: url },
      { onError: () => toast.error('Failed to save media record') },
    )
  }

  const firstVisibleId = photos.find((p) => p.visible)?.id

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Photos</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShowUploader(!showUploader)}>
          <Plus className="h-3 w-3 mr-1" />
          Add Photo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {photos.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {photos.map((photo) => (
                  <SortablePhotoCard
                    key={photo.id}
                    photo={photo}
                    isDefault={photo.id === firstVisibleId}
                    itemId={item.id}
                    onToggleVisibility={() => handleVisibilityToggle(photo)}
                    onDelete={photo.source === 'item' ? () => handleDeleteItemPhoto(photo.id) : undefined}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No photos yet.</p>
        )}

        {showUploader && (
          <MediaUploader
            bucket="item-media"
            pathPrefix={`items/${item.id}`}
            onUpload={handleUpload}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface SortablePhotoCardProps {
  photo: GalleryPhoto
  isDefault: boolean
  itemId: string
  onToggleVisibility: () => void
  onDelete?: () => void
}

function SortablePhotoCard({ photo, isDefault, itemId, onToggleVisibility, onDelete }: SortablePhotoCardProps) {
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState(photo.description ?? '')
  const updateMedia = useUpdateItemMedia()

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  }

  function handleSaveDescription() {
    const realId = photo.id.replace('item-', '')
    updateMedia.mutate(
      { mediaId: realId, itemId, updates: { description: descValue } },
      {
        onSuccess: () => {
          setEditingDesc(false)
          toast.success('Description updated')
        },
        onError: () => toast.error('Failed to update description'),
      },
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative rounded-lg border bg-background overflow-hidden',
        isDragging && 'shadow-lg ring-2 ring-primary',
      )}
    >
      {/* Image */}
      <div className={cn('aspect-square bg-muted', !photo.visible && 'opacity-40')}>
        <img
          src={photo.url}
          alt={photo.description ?? ''}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>

      {/* Controls overlay */}
      <div className="absolute top-1 left-1 right-1 flex items-center justify-between">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggleVisibility}
            className="h-6 w-6 rounded bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
            title={photo.visible ? 'Hide photo' : 'Show photo'}
          >
            {photo.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="h-6 w-6 rounded bg-red-600/70 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              title="Delete photo"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="h-6 w-6 rounded bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>

      {/* Badges */}
      <div className="absolute bottom-1 left-1 flex gap-1">
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
          {photo.source === 'product' ? 'Product' : 'Condition'}
        </Badge>
        {isDefault && (
          <Badge className="text-[10px] h-5 px-1.5">Default</Badge>
        )}
      </div>

      {/* Description area (item photos only) */}
      {photo.source === 'item' && (
        <div className="p-2">
          {editingDesc ? (
            <div className="flex gap-1">
              <Input
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                placeholder="Description..."
                className="h-6 text-xs"
              />
              <Button size="sm" className="h-6 text-xs px-2" onClick={handleSaveDescription}>
                Save
              </Button>
            </div>
          ) : (
            <button
              className="text-xs text-muted-foreground hover:text-foreground text-left truncate w-full"
              onClick={() => {
                setDescValue(photo.description ?? '')
                setEditingDesc(true)
              }}
              title={photo.description ?? 'Click to add description'}
            >
              {photo.description || 'Add description...'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
