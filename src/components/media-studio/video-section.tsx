import { useState, useRef, useEffect, useCallback } from 'react'
import { Video, Upload, Trash2, Loader2, Camera, X, CircleDot, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { processVideo, VIDEO_SPECS } from './video-processor'
import type { ProcessedVideo } from './video-processor'
import { VideoPlayer } from './video-player'
import { useAddProductMedia, useDeleteProductMedia } from '@/hooks/use-product-models'

interface ProductMediaItem {
  id: string
  file_url: string
  media_type: string
  role: string
  sort_order: number
}

interface VideoSectionProps {
  productId: string
  existingMedia: ProductMediaItem[]
  className?: string
}

const BUCKET = 'photo-group-media'

/** Create a synthetic FileList from a single File (needed to reuse handleFileSelect) */
function createFileList(file: File): FileList {
  const dt = new DataTransfer()
  dt.items.add(file)
  return dt.files
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VideoSection({ productId, existingMedia, className }: VideoSectionProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [processedVideo, setProcessedVideo] = useState<ProcessedVideo | null>(null)
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  // Camera recording state
  const [cameraOpen, setCameraOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const addMediaMutation = useAddProductMedia()
  const deleteMediaMutation = useDeleteProductMedia()

  const videos = existingMedia.filter((m) => m.media_type === 'video')

  function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return

    const file = files[0]

    // Revoke previous previews
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl)

    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setProcessedVideo(null)
    setProcessedPreviewUrl(null)
    setProcessProgress(0)
  }

  async function handleProcess() {
    if (!selectedFile) return

    setProcessing(true)
    setProcessProgress(0)

    try {
      const result = await processVideo(selectedFile, (progress) => {
        setProcessProgress(Math.round(progress * 100))
      })

      setProcessedVideo(result)
      setProcessedPreviewUrl(URL.createObjectURL(result.blob))
      toast.success('Video processed successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Video processing failed: ${message}`)
    } finally {
      setProcessing(false)
    }
  }

  async function handleUpload() {
    if (!processedVideo) return

    setUploading(true)

    try {
      const filePath = `product-media/${productId}/${processedVideo.fileName}`

      const { error } = await supabase.storage.from(BUCKET).upload(filePath, processedVideo.blob, {
        contentType: 'video/mp4',
        upsert: false,
      })

      if (error) throw error

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath)

      addMediaMutation.mutate(
        { productId, fileUrl: urlData.publicUrl, role: 'gallery', mediaType: 'video' },
        {
          onSuccess: () => {
            toast.success('Video uploaded')
            // Reset state
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl)
            setSelectedFile(null)
            setPreviewUrl(null)
            setProcessedVideo(null)
            setProcessedPreviewUrl(null)
            setProcessProgress(0)
          },
          onError: (err) => toast.error(`Failed to save: ${err.message}`),
        },
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Upload failed: ${message}`)
    } finally {
      setUploading(false)
    }
  }

  function handleDelete(mediaId: string) {
    deleteMediaMutation.mutate(mediaId, {
      onSuccess: () => toast.success('Video deleted'),
      onError: (err) => toast.error(`Delete failed: ${err.message}`),
    })
  }

  function handleReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (processedPreviewUrl) URL.revokeObjectURL(processedPreviewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
    setProcessedVideo(null)
    setProcessedPreviewUrl(null)
    setProcessProgress(0)
  }

  // Check if this is a mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

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
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false, // No audio needed — we strip it anyway
      })
      streamRef.current = stream
      setCameraOpen(true)
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
    stopRecording()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
    setRecordingTime(0)
  }

  function startRecording() {
    if (!streamRef.current) return

    chunksRef.current = []

    // Pick a supported mime type
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const file = new File([blob], `recording_${Date.now()}.webm`, { type: mimeType })
      handleFileSelect(createFileList(file))
      closeCamera()
      toast.success('Video recorded! Process it to optimize.')
    }

    recorder.start(1000) // collect data every second
    recorderRef.current = recorder
    setRecording(true)
    setRecordingTime(0)

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1
        if (next >= VIDEO_SPECS.maxDurationSec) {
          stopRecording()
        }
        return next
      })
    }, 1000)
  }

  const stopRecording = useCallback(() => {
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Upload & Process Area */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Video className="h-4 w-4" />
            Upload Video
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video Specs Info */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground text-sm">Processing Specs</p>
            <p>Output: {VIDEO_SPECS.width}x{VIDEO_SPECS.height}px (square, letterboxed)</p>
            <p>Max duration: {VIDEO_SPECS.maxDurationSec}s | Max size: {formatFileSize(VIDEO_SPECS.maxSizeBytes)}</p>
            <p>Codec: H.264 CRF {VIDEO_SPECS.crf} | Audio stripped</p>
          </div>

          {!selectedFile ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                {/* File upload area */}
                <div
                  className="flex-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50"
                  onClick={() => inputRef.current?.click()}
                >
                  <Video className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to select a video file
                  </p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      handleFileSelect(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </div>

                {/* Record Video button */}
                <div
                  className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors border-muted-foreground/25 hover:border-primary/50 hover:bg-primary/5 min-w-[120px]"
                  onClick={handleCameraClick}
                >
                  <Camera className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">Record Video</p>
                </div>

                {/* Hidden camera input for mobile */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    handleFileSelect(e.target.files)
                    e.target.value = ''
                  }}
                />
              </div>

              {/* Live Camera Viewfinder (desktop) */}
              {cameraOpen && (
                <div className="rounded-lg overflow-hidden border bg-black relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[500px] object-contain"
                  />

                  {/* Recording indicator */}
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
                        onClick={startRecording}
                        title="Start recording"
                      >
                        <CircleDot className="h-6 w-6" />
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="destructive"
                        className="rounded-full h-14 w-14 shadow-lg"
                        onClick={stopRecording}
                        title="Stop recording"
                      >
                        <Square className="h-5 w-5" />
                      </Button>
                    )}
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
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Preview */}
                <div>
                  <p className="text-sm font-medium mb-2">Original</p>
                  {previewUrl && (
                    <VideoPlayer src={previewUrl} />
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                </div>

                {/* Processed Preview */}
                <div>
                  <p className="text-sm font-medium mb-2">Processed</p>
                  {processedPreviewUrl ? (
                    <>
                      <VideoPlayer src={processedPreviewUrl} />
                      <p className="text-xs text-muted-foreground mt-1">
                        {processedVideo?.fileName} ({formatFileSize(processedVideo?.blob.size ?? 0)})
                      </p>
                    </>
                  ) : (
                    <div className="aspect-square rounded-lg border bg-muted flex items-center justify-center">
                      {processing ? (
                        <div className="text-center space-y-3 px-4 w-full">
                          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                          <Progress value={processProgress} className="w-full" />
                          <p className="text-sm text-muted-foreground">{processProgress}%</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Click &quot;Process Video&quot; to start
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* File Size Comparison */}
              {processedVideo && selectedFile && (
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-medium mb-1">Size Comparison</p>
                  <div className="flex items-center gap-4 text-muted-foreground text-xs">
                    <span>Original: {formatFileSize(selectedFile.size)}</span>
                    <span>→</span>
                    <span>Processed: {formatFileSize(processedVideo.blob.size)}</span>
                    <span className="text-foreground font-medium">
                      ({Math.round((1 - processedVideo.blob.size / selectedFile.size) * 100)}% reduction)
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Clear
                </Button>
                {!processedVideo && (
                  <Button onClick={handleProcess} disabled={processing}>
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Process Video'
                    )}
                  </Button>
                )}
                {processedVideo && (
                  <Button onClick={handleUpload} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Videos */}
      {videos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Videos ({videos.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {videos.map((video) => (
                <div key={video.id} className="space-y-2">
                  <VideoPlayer src={video.file_url} />
                  <div className="flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(video.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {videos.length === 0 && !selectedFile && (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No videos yet. Upload a video above to get started.</p>
        </div>
      )}
    </div>
  )
}
