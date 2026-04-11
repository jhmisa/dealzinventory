import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CodeDisplay } from '@/components/shared'
import { useItem } from '@/hooks/use-items'
import { buildShortDescription } from '@/lib/utils'
import type { ProductModel, ProductMedia, ItemMedia } from '@/lib/types'

type ProductModelJoined = ProductModel & {
  categories?: { name: string; form_fields: string[]; description_fields: string[] } | null
  product_media?: ProductMedia[]
}

export default function ItemSlideshowPage() {
  const { id } = useParams<{ id: string }>()
  const { data: item, isLoading } = useItem(id!)
  const [index, setIndex] = useState(0)

  // Build image list from product_media + item_media
  const images = (() => {
    if (!item) return []
    const pm = item.product_models as ProductModelJoined | null
    const productMedia = (pm?.product_media ?? []) as ProductMedia[]
    const itemMedia = (item.item_media ?? []) as ItemMedia[]

    const result: { id: string; url: string; label: string }[] = []
    for (const m of productMedia) {
      if (m.media_type === 'image' || !m.media_type) {
        result.push({ id: m.id, url: m.display_url || m.file_url, label: 'Product' })
      }
    }
    for (const m of itemMedia) {
      if (m.media_type === 'image' || !m.media_type) {
        result.push({ id: m.id, url: m.display_url || m.file_url, label: m.label || 'Item' })
      }
    }
    return result
  })()

  // Reset index when item changes
  useEffect(() => {
    setIndex(0)
  }, [id])

  // Clamp index when images change
  useEffect(() => {
    if (index >= images.length && images.length > 0) {
      setIndex(0)
    }
  }, [images.length, index])

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1))
  }, [images.length])

  const next = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0))
  }, [images.length])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [prev, next])

  // Build description
  const pm = item?.product_models as ProductModelJoined | null
  const descriptionFields = pm?.categories?.description_fields ?? []
  const description = (() => {
    if (!item) return ''
    if (descriptionFields.length > 0) {
      const resolvedValues: Record<string, unknown> = {}
      for (const key of descriptionFields) {
        resolvedValues[key] = (item as Record<string, unknown>)[key] ?? (pm as Record<string, unknown> | null)?.[key]
      }
      return buildShortDescription(resolvedValues, descriptionFields) || ''
    }
    const brand = item.brand ?? pm?.brand
    const modelName = item.model_name ?? pm?.model_name
    const color = item.color ?? pm?.color
    return brand && modelName ? `${brand} ${modelName}${color ? ` (${color})` : ''}` : ''
  })()

  // Update tab title
  useEffect(() => {
    if (item) {
      document.title = `${item.item_code} Slideshow`
    }
    return () => { document.title = 'Dealz Inventory' }
  }, [item])

  if (isLoading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-white/60 text-sm">Loading...</div>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-white/60 text-sm">Item not found.</div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-black flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/80 border-b border-white/10">
        <div className="flex items-center gap-3">
          <CodeDisplay code={item.item_code} className="text-lg text-white" />
          {description && (
            <span className="text-white/60 text-sm">{description}</span>
          )}
        </div>
        {images.length > 0 && (
          <span className="text-white/50 text-sm">
            {index + 1} / {images.length}
          </span>
        )}
      </div>

      {/* Main image area */}
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        {images.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-white/40">
            <ImageOff className="h-16 w-16" />
            <span className="text-sm">No photos available</span>
          </div>
        ) : (
          <>
            <img
              src={images[index].url}
              alt={`${item.item_code} photo ${index + 1}`}
              className="max-h-full max-w-full object-contain p-4"
            />

            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                  onClick={prev}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                  onClick={next}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
