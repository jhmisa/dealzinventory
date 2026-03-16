import { useState } from 'react'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface GalleryImage {
  id: string
  url: string
  alt?: string
  mediaType?: 'image' | 'video'
}

interface ImageGalleryProps {
  images: GalleryImage[]
  className?: string
  /** Columns for the thumbnail grid (default 4) */
  columns?: 2 | 3 | 4 | 5 | 6
}

const colsClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
  6: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6',
}

export function ImageGallery({ images, className, columns = 4 }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (images.length === 0) return null

  function openLightbox(index: number) {
    setLightboxIndex(index)
  }

  function closeLightbox() {
    setLightboxIndex(null)
  }

  function prev() {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : images.length - 1))
  }

  function next() {
    setLightboxIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : 0))
  }

  return (
    <>
      {/* Thumbnail Grid */}
      <div className={cn('grid gap-3', colsClass[columns], className)}>
        {images.map((img, idx) => (
          <button
            key={img.id}
            onClick={() => openLightbox(idx)}
            className="aspect-square rounded-lg overflow-hidden border bg-muted hover:ring-2 hover:ring-primary transition-all relative"
          >
            {img.mediaType === 'video' ? (
              <>
                <video src={img.url} className="w-full h-full object-cover" muted preload="metadata" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="h-8 w-8 text-white fill-white" />
                </div>
              </>
            ) : (
              <img
                src={img.url}
                alt={img.alt ?? ''}
                className="w-full h-full object-cover"
              />
            )}
          </button>
        ))}
      </div>

      {/* Lightbox Overlay */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); closeLightbox() }}
          >
            <X className="h-6 w-6" />
          </Button>

          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); prev() }}
              >
                <ChevronLeft className="h-8 w-8" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); next() }}
              >
                <ChevronRight className="h-8 w-8" />
              </Button>
            </>
          )}

          {images[lightboxIndex].mediaType === 'video' ? (
            <video
              src={images[lightboxIndex].url}
              className="max-h-[85vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
              controls
              autoPlay
              muted
            />
          ) : (
            <img
              src={images[lightboxIndex].url}
              alt={images[lightboxIndex].alt ?? ''}
              className="max-h-[85vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}

          <div className="absolute bottom-4 text-white text-sm">
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  )
}
