import { useState, useRef, useCallback } from 'react'
import { Upload, Trash2, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { processImage } from './image-processor'
import { AiEnhanceDialog } from './ai-enhance-dialog'
import { useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'

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

interface UploadProgress {
  fileName: string
  stage: 'processing' | 'uploading'
  progress: number
}

const BUCKET = 'photo-group-media'

export function PhotoSection({ productId, existingMedia, className }: PhotoSectionProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([])
  const [enhanceImageUrl, setEnhanceImageUrl] = useState<string | null>(null)
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const photos = existingMedia.filter((m) => m.media_type === 'image')

  const uploadProcessedImage = useCallback(
    async (file: File) => {
      const fileName = file.name

      setUploads((prev) => [...prev, { fileName, stage: 'processing', progress: 0 }])

      try {
        // Process image into 3 sizes
        setUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, stage: 'processing', progress: 30 } : u)),
        )
        const processed = await processImage(file)

        setUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, stage: 'uploading', progress: 50 } : u)),
        )

        const basePath = `product-media/${productId}`

        // Upload all 3 sizes
        const sizes = [
          { key: 'full', blob: processed.full, suffix: '_full.webp' },
          { key: 'display', blob: processed.display, suffix: '_display.webp' },
          { key: 'thumbnail', blob: processed.thumbnail, suffix: '_thumb.webp' },
        ] as const

        for (let i = 0; i < sizes.length; i++) {
          const { blob, suffix } = sizes[i]
          const filePath = `${basePath}/${processed.id}${suffix}`

          const { error } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
            contentType: 'image/webp',
            upsert: false,
          })

          if (error) throw error

          setUploads((prev) =>
            prev.map((u) =>
              u.fileName === fileName
                ? { ...u, progress: 50 + Math.round(((i + 1) / sizes.length) * 40) }
                : u,
            ),
          )
        }

        // Get the display URL to save to product_media
        const displayPath = `${basePath}/${processed.id}_display.webp`
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(displayPath)

        // Save to product_media table
        addMediaMutation.mutate(
          { productId, fileUrl: urlData.publicUrl, role: 'gallery', mediaType: 'image' },
          {
            onSuccess: () => {
              toast.success(`Uploaded ${fileName}`)
            },
            onError: (err) => {
              toast.error(`Failed to save media record: ${err.message}`)
            },
          },
        )

        setUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, progress: 100 } : u)),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to process ${fileName}: ${message}`)
      } finally {
        // Remove from progress list after a brief delay
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.fileName !== fileName))
        }, 500)
      }
    },
    [productId, addMediaMutation],
  )

  function handleFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(uploadProcessedImage)
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Upload Photos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50',
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag & drop images here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Images are automatically processed into 3 sizes (2048, 1080, 256px)
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {/* Upload Progress */}
          {uploads.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploads.map((upload) => (
                <div key={upload.fileName} className="flex items-center gap-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  <span className="truncate flex-1">{upload.fileName}</span>
                  <span className="text-muted-foreground text-xs capitalize">{upload.stage}</span>
                  <span className="text-muted-foreground w-10 text-right">{upload.progress}%</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Photos Grid */}
      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Photos ({photos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative">
                  <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={photo.file_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 rounded-lg transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEnhance(photo.file_url)}
                      title="Enhance with AI"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDelete(photo.id)}
                      title="Delete photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {photos.length === 0 && uploads.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Upload className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No photos yet. Upload images above to get started.</p>
        </div>
      )}

      {/* AI Enhance Dialog */}
      <AiEnhanceDialog
        open={enhanceDialogOpen}
        onOpenChange={setEnhanceDialogOpen}
        originalImageUrl={enhanceImageUrl}
        productId={productId}
      />
    </div>
  )
}
