import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Trash2, Sparkles, Loader2, Camera, X } from 'lucide-react'
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

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

  // Check if this is a mobile device — use native camera input instead of viewfinder
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  function handleCameraClick() {
    if (isMobile) {
      // On mobile, use native file input with camera capture
      cameraInputRef.current?.click()
    } else {
      // On desktop, open live viewfinder
      openCamera()
    }
  }

  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 2048 }, height: { ideal: 2048 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
      // Wait for video element to mount, then attach stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      }, 50)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera'
      toast.error(`Camera error: ${message}`)
    }
  }

  function closeCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })
        uploadProcessedImage(file)
        toast.success('Photo captured!')
      },
      'image/jpeg',
      0.92,
    )
  }

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

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
          <div className="flex gap-3">
            {/* Drag & Drop area */}
            <div
              className={cn(
                'flex-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
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

            {/* Take Photo button */}
            <div
              className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 min-w-[120px]"
              onClick={handleCameraClick}
            >
              <Camera className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground font-medium">Take Photo</p>
            </div>

            {/* Hidden camera input for mobile */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {/* Live Camera Viewfinder (desktop) */}
          {cameraOpen && (
            <div className="mt-4 rounded-lg overflow-hidden border bg-black relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-h-[500px] object-contain"
              />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                <Button
                  size="lg"
                  className="rounded-full h-14 w-14 shadow-lg"
                  onClick={capturePhoto}
                  title="Capture"
                >
                  <Camera className="h-6 w-6" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="rounded-full h-10 w-10 shadow-lg self-center"
                  onClick={closeCamera}
                  title="Close camera"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

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
                <div key={photo.id} className="group space-y-2">
                  <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                    <img
                      src={photo.file_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Action buttons below photo — always visible on mobile, hover on desktop */}
                  <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={() => handleEnhance(photo.file_url)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Enhance
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (window.confirm('Delete this photo?')) {
                          handleDelete(photo.id)
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
