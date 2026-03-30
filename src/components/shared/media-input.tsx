import { useState, useRef, useCallback } from 'react'
import { Upload, Camera, Video, X, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { uploadMedia, type UploadResult } from '@/lib/media'
import { SquareCamera } from './square-camera'
import { cn } from '@/lib/utils'

export interface MediaItem {
  id: string
  url: string
  thumbnailUrl?: string
  type: 'image' | 'video'
}

interface MediaInputProps {
  accept: 'image' | 'video' | 'both'
  bucket: string
  path: string
  onUpload: (result: UploadResult) => void
  onRemove?: (id: string) => void
  multiple?: boolean
  maxFiles?: number
  showCamera?: boolean
  enableAiEnhance?: boolean
  onEnhance?: (imageUrl: string) => void
  existingMedia?: MediaItem[]
  className?: string
}

interface UploadingItem {
  key: string
  fileName: string
  stage: 'processing' | 'uploading'
  progress: number
}

export function MediaInput({
  accept,
  bucket,
  path,
  onUpload,
  onRemove,
  multiple = true,
  maxFiles,
  showCamera = true,
  enableAiEnhance = false,
  onEnhance,
  existingMedia = [],
  className,
}: MediaInputProps) {
  const [uploading, setUploading] = useState<UploadingItem[]>([])
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoCameraInputRef = useRef<HTMLInputElement>(null)

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

  const totalCount = existingMedia.length + uploading.length
  const atLimit = maxFiles != null && totalCount >= maxFiles

  const acceptMime =
    accept === 'image' ? 'image/*' :
    accept === 'video' ? 'video/*' :
    'image/*,video/*'

  const processAndUpload = useCallback(async (file: File) => {
    const key = `${file.name}-${Date.now()}`
    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image'

    setUploading((prev) => [...prev, { key, fileName: file.name, stage: 'processing', progress: 0 }])

    try {
      setUploading((prev) =>
        prev.map((u) => (u.key === key ? { ...u, stage: 'processing', progress: 20 } : u)),
      )

      const result = await uploadMedia({
        file,
        type,
        bucket,
        path,
        onProgress: (p) => {
          setUploading((prev) =>
            prev.map((u) => (u.key === key ? { ...u, stage: 'uploading', progress: 20 + Math.round(p * 60) } : u)),
          )
        },
      })

      setUploading((prev) =>
        prev.map((u) => (u.key === key ? { ...u, progress: 100 } : u)),
      )

      onUpload(result)
      toast.success(`Uploaded ${file.name}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Failed: ${message}`)
    } finally {
      setTimeout(() => {
        setUploading((prev) => prev.filter((u) => u.key !== key))
      }, 500)
    }
  }, [bucket, path, onUpload])

  function handleFiles(files: FileList | null) {
    if (!files) return
    const remaining = maxFiles != null ? maxFiles - totalCount : files.length
    const toProcess = Array.from(files).slice(0, Math.max(remaining, 0))
    toProcess.forEach(processAndUpload)
  }

  function handleCameraCapture(file: File) {
    setCameraMode(null)
    processAndUpload(file)
  }

  const showPhotoBtn = showCamera && (accept === 'image' || accept === 'both')
  const showVideoBtn = showCamera && (accept === 'video' || accept === 'both')

  return (
    <div className={cn('space-y-4', className)}>
      {/* Action buttons */}
      {!atLimit && !cameraMode && (
        <div className="flex flex-wrap gap-2">
          {showPhotoBtn && (
            <Button
              variant="outline"
              onClick={() => isMobile ? cameraInputRef.current?.click() : setCameraMode('photo')}
              className="gap-2"
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </Button>
          )}
          {showVideoBtn && (
            <Button
              variant="outline"
              onClick={() => isMobile ? videoCameraInputRef.current?.click() : setCameraMode('video')}
              className="gap-2"
            >
              <Video className="h-4 w-4" />
              Record Video
            </Button>
          )}
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload File
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptMime}
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {isMobile && showPhotoBtn && (
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
          )}
          {isMobile && showVideoBtn && (
            <input
              ref={videoCameraInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files)
                e.target.value = ''
              }}
            />
          )}
        </div>
      )}

      {/* Camera */}
      {cameraMode && (
        <SquareCamera
          mode={cameraMode}
          onCapture={handleCameraCapture}
          onClose={() => setCameraMode(null)}
        />
      )}

      {/* Upload progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((item) => (
            <div key={item.key} className="flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              <span className="truncate flex-1">{item.fileName}</span>
              <span className="text-muted-foreground text-xs capitalize">{item.stage}</span>
              <span className="text-muted-foreground w-10 text-right">{item.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Existing media grid */}
      {existingMedia.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {existingMedia.map((item) => (
            <div key={item.id} className="group space-y-2">
              <div className="aspect-square rounded-lg overflow-hidden border bg-muted">
                {item.type === 'video' ? (
                  <video src={item.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {enableAiEnhance && item.type === 'image' && onEnhance && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => onEnhance(item.url)}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Enhance
                  </Button>
                )}
                {onRemove && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (window.confirm('Delete this media?')) onRemove(item.id)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File count */}
      {maxFiles != null && (
        <p className="text-xs text-muted-foreground">
          {existingMedia.length}/{maxFiles} files
        </p>
      )}
    </div>
  )
}
