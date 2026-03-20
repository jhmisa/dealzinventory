import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Upload, X, Loader2, Camera, Video, CircleDot, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useOrder } from '@/hooks/use-orders'
import { useCreateReturnRequest, useUploadReturnMedia } from '@/hooks/use-returns'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { FormSkeleton, PriceDisplay } from '@/components/shared'
import { RETURN_REASONS } from '@/lib/constants'
import { createReturnSchema, type CreateReturnFormValues } from '@/validators/return'
import { cn } from '@/lib/utils'
import { processReturnImage } from '@/components/media-studio/image-processor'
import { processVideo, VIDEO_SPECS } from '@/components/media-studio/video-processor'

type OrderItemRow = {
  id: string
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  items: {
    item_code: string
    condition_grade: string
    product_models: {
      brand: string
      model_name: string
      color: string | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

const STEPS = ['Select Items', 'Describe Issue', 'Upload Evidence', 'Review & Submit'] as const
const MAX_FILES = 5

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

interface MediaItem {
  blob: Blob
  previewUrl: string
  type: 'image' | 'video'
}

export default function CustomerReturnRequestPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { customer } = useCustomerAuth()
  const { data: order, isLoading } = useOrder(orderId!)
  const createReturn = useCreateReturnRequest()
  const uploadMedia = useUploadReturnMedia()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)
  const [processLabel, setProcessLabel] = useState('')

  // Desktop camera state
  const [cameraMode, setCameraMode] = useState<'photo' | 'video' | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const form = useForm<CreateReturnFormValues>({
    resolver: zodResolver(createReturnSchema),
    defaultValues: {
      reason_category: undefined,
      description: '',
      items: [],
    },
  })

  const { watch, setValue, trigger } = form
  const selectedItems = watch('items')
  const reasonCategory = watch('reason_category')
  const description = watch('description')

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const orderItems = (order.order_items ?? []) as OrderItemRow[]

  function isItemSelected(orderItemId: string): boolean {
    return selectedItems.some(i => i.order_item_id === orderItemId)
  }

  function toggleItem(orderItemId: string) {
    const current = form.getValues('items')
    if (current.some(i => i.order_item_id === orderItemId)) {
      setValue('items', current.filter(i => i.order_item_id !== orderItemId))
    } else {
      setValue('items', [...current, { order_item_id: orderItemId, reason_note: '' }])
    }
  }

  // --- Media processing ---

  const addProcessedMedia = useCallback((blob: Blob, type: 'image' | 'video') => {
    const previewUrl = URL.createObjectURL(blob)
    setMediaItems(prev => [...prev, { blob, previewUrl, type }])
  }, [])

  async function processAndAddImage(file: File | Blob) {
    if (mediaItems.length >= MAX_FILES) return
    setProcessing(true)
    setProcessLabel('Compressing image…')
    setProcessProgress(30)
    try {
      const compressed = await processReturnImage(file)
      setProcessProgress(100)
      addProcessedMedia(compressed, 'image')
      toast.success('Photo ready')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Image processing failed: ${message}`)
    } finally {
      setProcessing(false)
      setProcessProgress(0)
      setProcessLabel('')
    }
  }

  async function processAndAddVideo(file: File) {
    if (mediaItems.length >= MAX_FILES) return
    setProcessing(true)
    setProcessLabel('Compressing video…')
    setProcessProgress(0)
    try {
      const result = await processVideo(file, (p) => {
        setProcessProgress(Math.round(p * 100))
      })
      addProcessedMedia(result.blob, 'video')
      toast.success('Video ready')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Video processing failed: ${message}`)
    } finally {
      setProcessing(false)
      setProcessProgress(0)
      setProcessLabel('')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = Array.from(e.target.files ?? [])
    e.target.value = ''
    const remaining = MAX_FILES - mediaItems.length
    const toProcess = fileList.slice(0, remaining)
    for (const file of toProcess) {
      if (file.type.startsWith('video/')) {
        await processAndAddVideo(file)
      } else {
        await processAndAddImage(file)
      }
    }
  }

  function removeMediaItem(index: number) {
    setMediaItems(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  // --- Camera: photo ---

  function handleTakePhoto() {
    if (isMobile) {
      cameraInputRef.current?.click()
    } else {
      openCamera('photo')
    }
  }

  // --- Camera: video ---

  function handleRecordVideo() {
    if (isMobile) {
      videoInputRef.current?.click()
    } else {
      openCamera('video')
    }
  }

  async function openCamera(mode: 'photo' | 'video') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1080 }, height: { ideal: 1080 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraMode(mode)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 50)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera'
      toast.error(`Camera error: ${message}`)
    }
  }

  function closeCamera() {
    stopRecording()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraMode(null)
    setRecordingTime(0)
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
        closeCamera()
        processAndAddImage(blob)
      },
      'image/jpeg',
      0.92,
    )
  }

  function startRecording() {
    if (!streamRef.current) return
    chunksRef.current = []
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
      closeCamera()
      processAndAddVideo(file)
    }
    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
    setRecordingTime(0)
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        const next = prev + 1
        if (next >= VIDEO_SPECS.maxDurationSec) stopRecording()
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

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (timerRef.current) clearInterval(timerRef.current)
      mediaItems.forEach(m => URL.revokeObjectURL(m.previewUrl))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function canAdvance(): Promise<boolean> {
    if (step === 0) {
      return selectedItems.length > 0
    }
    if (step === 1) {
      const valid = await trigger(['reason_category', 'description'])
      return valid
    }
    return true
  }

  async function handleNext() {
    const ok = await canAdvance()
    if (ok) setStep(s => s + 1)
  }

  async function handleSubmit() {
    const valid = await trigger()
    if (!valid || !customer) return

    setIsSubmitting(true)
    try {
      const values = form.getValues()
      const result = await createReturn.mutateAsync({
        order_id: orderId!,
        customer_id: customer.id,
        reason_category: values.reason_category,
        description: values.description,
        items: values.items,
      })

      const returnId = result.id

      for (const item of mediaItems) {
        await uploadMedia.mutateAsync({
          returnRequestId: returnId,
          file: item.blob,
          mediaType: item.type,
        })
      }

      navigate(`/account/returns/${returnId}`)
    } catch {
      // Error toast is handled by the mutation's onError or global error handler
    } finally {
      setIsSubmitting(false)
    }
  }

  const reasonLabel = RETURN_REASONS.find(r => r.value === reasonCategory)?.label

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to order">
          <a href={`/account/orders/${orderId}`}>
            <ArrowLeft className="h-4 w-4" />
          </a>
        </Button>
        <h1 className="text-2xl font-bold">Request a Return</h1>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 border-2',
                idx < step
                  ? 'bg-primary border-primary text-primary-foreground'
                  : idx === step
                    ? 'border-primary text-primary ring-2 ring-primary ring-offset-2'
                    : 'border-muted-foreground/30 text-muted-foreground',
              )}
            >
              {idx + 1}
            </div>
            <span className={cn('text-xs hidden sm:block', idx === step ? 'font-semibold' : 'text-muted-foreground')}>
              {label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5', idx < step ? 'bg-primary' : 'bg-muted-foreground/20')} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Items */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select items to return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {orderItems.map((oi) => {
              const pm = oi.items?.product_models
              const heroMedia = pm?.product_media
                ?.filter(m => m.role === 'hero')
                .sort((a, b) => a.sort_order - b.sort_order)[0]
              const fallbackMedia = pm?.product_media
                ?.sort((a, b) => a.sort_order - b.sort_order)[0]
              const imgUrl = heroMedia?.file_url ?? fallbackMedia?.file_url
              const checked = isItemSelected(oi.id)

              return (
                <label
                  key={oi.id}
                  className={cn(
                    'flex items-center gap-4 p-3 border rounded-lg cursor-pointer transition-colors',
                    checked ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleItem(oi.id)}
                  />
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={oi.description}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                      No img
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{oi.description}</p>
                    {pm && (
                      <p className="text-sm text-muted-foreground">
                        {[pm.brand, pm.model_name, pm.color].filter(Boolean).join(' / ')}
                      </p>
                    )}
                    {oi.items && (
                      <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                    )}
                  </div>
                  <div className="shrink-0">
                    <PriceDisplay price={Number(oi.unit_price)} />
                  </div>
                </label>
              )
            })}
            {selectedItems.length === 0 && (
              <p className="text-sm text-destructive">Please select at least one item to return.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Reason & Description */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Describe the issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason</label>
              <Select
                value={reasonCategory}
                onValueChange={(val) => setValue('reason_category', val as CreateReturnFormValues['reason_category'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.reason_category && (
                <p className="text-sm text-destructive">{form.formState.errors.reason_category.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Please describe the issue in detail (at least 10 characters)..."
                rows={4}
                {...form.register('description')}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Upload Evidence */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Take photos or record a video showing the issue. Up to {MAX_FILES} files — all media is automatically compressed.
            </p>

            {/* Action buttons */}
            {mediaItems.length < MAX_FILES && !processing && !cameraMode && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleTakePhoto} className="gap-2">
                  <Camera className="h-4 w-4" />
                  Take Photo
                </Button>
                <Button variant="outline" onClick={handleRecordVideo} className="gap-2">
                  <Video className="h-4 w-4" />
                  Record Video
                </Button>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Upload File
                </Button>

                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) processAndAddImage(file)
                  }}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) processAndAddVideo(file)
                  }}
                />
              </div>
            )}

            {/* Desktop Camera Viewfinder */}
            {cameraMode && (
              <div className="rounded-lg overflow-hidden border bg-black relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[400px] object-contain"
                />

                {/* Recording indicator */}
                {recording && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-white text-sm font-mono">
                      {formatTime(recordingTime)} / {formatTime(VIDEO_SPECS.maxDurationSec)}
                    </span>
                  </div>
                )}

                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                  {cameraMode === 'photo' ? (
                    <Button
                      size="lg"
                      className="rounded-full h-14 w-14 shadow-lg"
                      onClick={capturePhoto}
                      title="Capture photo"
                    >
                      <Camera className="h-6 w-6" />
                    </Button>
                  ) : !recording ? (
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

            {/* Processing progress */}
            {processing && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="flex-1">{processLabel}</span>
                  <span className="text-muted-foreground">{processProgress}%</span>
                </div>
                <Progress value={processProgress} />
              </div>
            )}

            {/* Thumbnails grid */}
            {mediaItems.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {mediaItems.map((item, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                    {item.type === 'video' ? (
                      <video src={item.previewUrl} className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.previewUrl} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removeMediaItem(idx)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {item.type === 'video' && (
                      <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
                        <Video className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {mediaItems.length}/{MAX_FILES} files added
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review your return request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Items to return ({selectedItems.length})</p>
              <div className="space-y-2">
                {selectedItems.map((si) => {
                  const oi = orderItems.find(o => o.id === si.order_item_id)
                  return (
                    <div key={si.order_item_id} className="flex items-center gap-3 p-2 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{oi?.description ?? 'Unknown item'}</p>
                        {oi?.items && (
                          <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                        )}
                      </div>
                      {oi && <PriceDisplay price={Number(oi.unit_price)} />}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm font-medium">{reasonLabel ?? reasonCategory}</p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Description</p>
              <p className="text-sm whitespace-pre-wrap">{description}</p>
            </div>

            {mediaItems.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">Attached files ({mediaItems.length})</p>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {mediaItems.map((item, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border">
                      {item.type === 'video' ? (
                        <video src={item.previewUrl} className="w-full h-full object-cover" />
                      ) : (
                        <img src={item.previewUrl} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                      )}
                      {item.type === 'video' && (
                        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
                          <Video className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(s => s - 1)}
          disabled={step === 0}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={handleNext} className="gap-2">
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Return Request
          </Button>
        )}
      </div>
    </div>
  )
}
