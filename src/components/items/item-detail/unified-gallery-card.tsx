import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { GripVertical, Eye, EyeOff, X, Plus, Upload, Camera, Video, Loader2, CircleDot, Square, Download } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { processImage, tryProcessVideo, VIDEO_SPECS, getImageFormat } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { useUpdateItem, useAddItemMedia, useUpdateItemMedia, useDeleteItemMedia } from '@/hooks/use-items'
import { cn } from '@/lib/utils'
import type { Item, ProductMedia, ItemMedia } from '@/lib/types'

type GalleryPhoto = {
  id: string
  source: 'product' | 'item'
  url: string
  description: string | null
  visible: boolean
  mediaType: 'image' | 'video'
  thumbnailUrl: string | null
}

interface UnifiedGalleryCardProps {
  item: Item
  productMedia: ProductMedia[]
  itemMedia: ItemMedia[]
}

export function UnifiedGalleryCard({ item, productMedia, itemMedia }: UnifiedGalleryCardProps) {
  const [showUploader, setShowUploader] = useState(false)
  const [mediaTab, setMediaTab] = useState<'photos' | 'videos'>('photos')
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
        mediaType: m.media_type as 'image' | 'video',
        thumbnailUrl: null,
      }))

    const itemPhotos: GalleryPhoto[] = [...itemMedia]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({
        id: `item-${m.id}`,
        source: 'item' as const,
        url: m.file_url,
        description: m.description,
        visible: m.visible,
        mediaType: m.media_type as 'image' | 'video',
        thumbnailUrl: m.thumbnail_url ?? null,
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

  const imagePhotos = useMemo(() => photos.filter((p) => p.mediaType === 'image'), [photos])
  const videoPhotos = useMemo(() => photos.filter((p) => p.mediaType === 'video'), [photos])

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

  // --- Image upload with processing ---
  const BUCKET = 'item-media'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const videoCameraInputRef = useRef<HTMLInputElement>(null)
  const [imageUploads, setImageUploads] = useState<{ fileName: string; stage: string; progress: number }[]>([])

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Video recording state
  const [videoRecordOpen, setVideoRecordOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const videoRecordRef = useRef<HTMLVideoElement>(null)
  const videoStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Video processing state
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  const uploadProcessedImage = useCallback(
    async (file: File) => {
      const fileName = file.name
      setImageUploads((prev) => [...prev, { fileName, stage: 'processing', progress: 0 }])

      try {
        setImageUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, stage: 'processing', progress: 30 } : u)),
        )
        const processed = await processImage(file)

        setImageUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, stage: 'uploading', progress: 50 } : u)),
        )

        const basePath = `items/${item.id}`
        const sizes = [
          { blob: processed.display, suffix: '_display.webp' },
          { blob: processed.thumbnail, suffix: '_thumb.webp' },
        ] as const

        for (let i = 0; i < sizes.length; i++) {
          const { blob, suffix } = sizes[i]
          const filePath = `${basePath}/${processed.id}${suffix}`

          const { error } = await supabase.storage.from(BUCKET).upload(filePath, blob, {
            contentType: 'image/webp',
            upsert: false,
          })
          if (error) throw error

          setImageUploads((prev) =>
            prev.map((u) =>
              u.fileName === fileName
                ? { ...u, progress: 50 + Math.round(((i + 1) / sizes.length) * 40) }
                : u,
            ),
          )
        }

        const displayPath = `${basePath}/${processed.id}_display.webp`
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(displayPath)

        addMedia.mutate(
          { itemId: item.id, fileUrl: urlData.publicUrl },
          {
            onSuccess: () => toast.success(`Uploaded ${fileName}`),
            onError: (err) => toast.error(`Failed to save: ${err.message}`),
          },
        )

        setImageUploads((prev) =>
          prev.map((u) => (u.fileName === fileName ? { ...u, progress: 100 } : u)),
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        toast.error(`Failed to process ${fileName}: ${message}`)
      } finally {
        setTimeout(() => {
          setImageUploads((prev) => prev.filter((u) => u.fileName !== fileName))
        }, 500)
      }
    },
    [item.id, addMedia],
  )

  function handleImageFiles(files: FileList | null) {
    if (!files) return
    Array.from(files).forEach(uploadProcessedImage)
  }

  async function handleVideoFile(file: File) {
    setVideoProcessing(true)
    setVideoProgress(0)

    try {
      const result = await tryProcessVideo(file, (progress) => {
        setVideoProgress(Math.round(progress * 100))
      })

      const ext = result.format
      const videoContentType = ext === 'webm' ? 'video/webm' : 'video/mp4'
      const filePath = `items/${item.id}/${result.id}.${ext}`
      const { error } = await supabase.storage.from(BUCKET).upload(filePath, result.video, {
        contentType: videoContentType,
        upsert: false,
      })
      if (error) throw error

      // Upload video thumbnail
      const { extension: imgExt } = getImageFormat()
      const thumbPath = `items/${item.id}/${result.id}_thumb.${imgExt}`
      const thumbContentType = imgExt === 'webp' ? 'image/webp' : 'image/jpeg'
      await supabase.storage.from(BUCKET).upload(thumbPath, result.thumbnail, {
        contentType: thumbContentType,
        upsert: false,
      })

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
      const { data: thumbUrlData } = supabase.storage.from(BUCKET).getPublicUrl(thumbPath)

      addMedia.mutate(
        { itemId: item.id, fileUrl: urlData.publicUrl, mediaType: 'video', thumbnailUrl: thumbUrlData.publicUrl },
        {
          onSuccess: () => toast.success('Video uploaded'),
          onError: (err) => toast.error(`Failed to save: ${err.message}`),
        },
      )
    } catch (err) {
      console.error('[video] handleVideoFile failed:', err)
      const message = err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err) ?? 'Unknown error'
      toast.error(`Video processing failed: ${message}`)
    } finally {
      setVideoProcessing(false)
      setVideoProgress(0)
    }
  }

  // Camera functions
  function handleCameraClick() {
    if (isMobile) {
      cameraInputRef.current?.click()
    } else {
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
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 50)
    } catch (err) {
      toast.error(`Camera error: ${err instanceof Error ? err.message : 'Could not access camera'}`)
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

  // Video recording functions
  function handleVideoRecordClick() {
    if (isMobile) {
      videoCameraInputRef.current?.click()
    } else {
      openVideoCamera()
    }
  }

  async function openVideoCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false,
      })
      videoStreamRef.current = stream
      setVideoRecordOpen(true)
      setTimeout(() => {
        if (videoRecordRef.current) videoRecordRef.current.srcObject = stream
      }, 50)
    } catch (err) {
      toast.error(`Camera error: ${err instanceof Error ? err.message : 'Could not access camera'}`)
    }
  }

  function closeVideoCamera() {
    stopVideoRecording()
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((t) => t.stop())
      videoStreamRef.current = null
    }
    setVideoRecordOpen(false)
    setRecordingTime(0)
  }

  function startVideoRecording() {
    if (!videoStreamRef.current) return
    chunksRef.current = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4'

    const recorder = new MediaRecorder(videoStreamRef.current, { mimeType })
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
      const file = new File([blob], `recording_${Date.now()}.${ext}`, { type: mimeType })
      closeVideoCamera()
      handleVideoFile(file)
    }
    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
    setRecordingTime(0)
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1
        if (next >= VIDEO_SPECS.maxDurationSec) stopVideoRecording()
        return next
      })
    }, 1000)
  }

  const stopVideoRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
    recorderRef.current = null
    setRecording(false)
  }, [])

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false)

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
    handleImageFiles(e.dataTransfer.files)
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach((t) => t.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const firstVisibleId = photos.find((p) => p.visible)?.id

  const [downloading, setDownloading] = useState<'photos' | 'videos' | null>(null)

  async function handleDownloadAll(type: 'photos' | 'videos') {
    const items = type === 'photos' ? imagePhotos : videoPhotos
    if (items.length === 0) return

    setDownloading(type)
    try {
      for (let i = 0; i < items.length; i++) {
        const media = items[i]
        const response = await fetch(media.url)
        const blob = await response.blob()
        const ext = type === 'videos'
          ? (media.url.match(/\.(mp4|webm|mov)/) ?? [, 'mp4'])[1]
          : (media.url.match(/\.(webp|jpg|jpeg|png)/) ?? [, 'webp'])[1]
        const filename = `${item.item_code}_${type === 'photos' ? 'photo' : 'video'}_${i + 1}.${ext}`

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
      toast.success(`Downloaded ${items.length} ${type}`)
    } catch {
      toast.error(`Failed to download ${type}`)
    } finally {
      setDownloading(null)
    }
  }

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
        <Tabs value={mediaTab} onValueChange={(v) => setMediaTab(v as 'photos' | 'videos')}>
          <TabsList variant="line" className="border-b border-zinc-200 w-full justify-start">
            <TabsTrigger value="photos" className="text-sm">
              Photos ({imagePhotos.length.toString().padStart(2, '0')})
            </TabsTrigger>
            <TabsTrigger value="videos" className="text-sm">
              Videos ({videoPhotos.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="photos" className="pt-3">
            {imagePhotos.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={imagePhotos.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {imagePhotos.map((photo) => (
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
          </TabsContent>

          <TabsContent value="videos" className="pt-3">
            {videoPhotos.length > 0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={videoPhotos.map((p) => p.id)} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {videoPhotos.map((photo) => (
                      <SortablePhotoCard
                        key={photo.id}
                        photo={photo}
                        isDefault={false}
                        itemId={item.id}
                        onToggleVisibility={() => handleVisibilityToggle(photo)}
                        onDelete={photo.source === 'item' ? () => handleDeleteItemPhoto(photo.id) : undefined}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No videos yet.</p>
            )}
          </TabsContent>
        </Tabs>

        {(imagePhotos.length > 0 || videoPhotos.length > 0) && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={imagePhotos.length === 0 || downloading === 'photos'}
              onClick={() => handleDownloadAll('photos')}
            >
              {downloading === 'photos' ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              Download All Photos
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={videoPhotos.length === 0 || downloading === 'videos'}
              onClick={() => handleDownloadAll('videos')}
            >
              {downloading === 'videos' ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Download className="h-3 w-3 mr-1" />
              )}
              Download All Videos
            </Button>
          </div>
        )}

        {showUploader && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {/* Drag & Drop upload area */}
              <div
                className={cn(
                  'flex-1 border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors flex items-center gap-3',
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-muted-foreground/25 hover:border-primary/50',
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div className="text-left">
                  <p className="text-sm text-muted-foreground">Drop images or click to browse</p>
                  <p className="text-xs text-muted-foreground/60">Auto-processed to 2 sizes</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleImageFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Take Photo */}
              <div
                className="border-2 border-dashed rounded-lg px-4 py-3 flex items-center gap-2 cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5"
                onClick={handleCameraClick}
              >
                <Camera className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground font-medium whitespace-nowrap">Take Photo</p>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  handleImageFiles(e.target.files)
                  e.target.value = ''
                }}
              />

              {/* Record Video */}
              <div
                className="border-2 border-dashed rounded-lg px-4 py-3 flex items-center gap-2 cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5"
                onClick={handleVideoRecordClick}
              >
                <Video className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <p className="text-sm text-muted-foreground font-medium whitespace-nowrap">Record Video</p>
              </div>
              <input
                ref={videoCameraInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  if (files?.[0]) handleVideoFile(files[0])
                  e.target.value = ''
                }}
              />
            </div>

            {/* Upload a video file */}
            <div
              className="border-2 border-dashed rounded-lg px-4 py-2 cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50 flex items-center gap-3"
              onClick={() => videoInputRef.current?.click()}
            >
              <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <p className="text-sm text-muted-foreground">Upload video file</p>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files
                  if (files?.[0]) handleVideoFile(files[0])
                  e.target.value = ''
                }}
              />
            </div>

            {/* Live Camera Viewfinder (photos) */}
            {cameraOpen && (
              <div className="rounded-lg overflow-hidden border bg-black relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[400px] object-contain"
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

            {/* Live Camera Viewfinder (video recording) */}
            {videoRecordOpen && (
              <div className="rounded-lg overflow-hidden border bg-black relative">
                <video
                  ref={videoRecordRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[400px] object-contain"
                />
                {recording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-mono">
                      {formatTime(recordingTime)} / {formatTime(VIDEO_SPECS.maxDurationSec)}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                  {!recording ? (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="rounded-full h-14 w-14 shadow-lg"
                      onClick={startVideoRecording}
                      title="Start recording"
                    >
                      <CircleDot className="h-6 w-6" />
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="rounded-full h-14 w-14 shadow-lg"
                      onClick={stopVideoRecording}
                      title="Stop recording"
                    >
                      <Square className="h-5 w-5" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full h-10 w-10 shadow-lg self-center"
                    onClick={closeVideoCamera}
                    title="Close camera"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Image Upload Progress */}
            {imageUploads.length > 0 && (
              <div className="space-y-2">
                {imageUploads.map((upload) => (
                  <div key={upload.fileName} className="flex items-center gap-3 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                    <span className="truncate flex-1">{upload.fileName}</span>
                    <span className="text-muted-foreground text-xs capitalize">{upload.stage}</span>
                    <span className="text-muted-foreground w-10 text-right">{upload.progress}%</span>
                  </div>
                ))}
              </div>
            )}

            {/* Video Processing Progress */}
            {videoProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  <span className="flex-1">Processing video...</span>
                  <span className="text-muted-foreground w-10 text-right">{videoProgress}%</span>
                </div>
                <Progress value={videoProgress} />
              </div>
            )}
          </div>
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
      {/* Media */}
      <div className={cn('aspect-square bg-muted', !photo.visible && 'opacity-40')}>
        {photo.mediaType === 'video' ? (
          <video
            src={photo.url}
            poster={photo.thumbnailUrl ?? undefined}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseEnter={(e) => e.currentTarget.play()}
            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0 }}
          />
        ) : (
          <img
            src={photo.url}
            alt={photo.description ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {photo.mediaType === 'video' && (
          <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] px-1 py-0 gap-0.5">
            <Video className="h-2.5 w-2.5" />
            Video
          </Badge>
        )}
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
