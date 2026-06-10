import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Mic, Video, Square, RotateCcw, Send, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  MEDIA_MAX_BYTES,
  VIDEO_MAX_DURATION_S,
  AUDIO_MAX_DURATION_S,
  VIDEO_BITS_PER_SECOND,
  VIDEO_AUDIO_BITS_PER_SECOND,
  VOICE_BITS_PER_SECOND,
  VIDEO_CONSTRAINTS,
  pickSupportedMimeType,
  humanFileSize,
  type RecordingKind,
} from '@/lib/media-recording'

interface MediaRecorderPanelProps {
  open: boolean
  kind: RecordingKind
  onClose: () => void
  /** Called with the finished clip; the composer routes it through its upload flow. */
  onCapture: (file: File) => void
}

type Phase = 'requesting' | 'ready' | 'recording' | 'recorded' | 'error'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const MediaRecorderPanel = memo(function MediaRecorderPanel({
  open,
  kind,
  onClose,
  onCapture,
}: MediaRecorderPanelProps) {
  const isVideo = kind === 'video'
  const maxDuration = isVideo ? VIDEO_MAX_DURATION_S : AUDIO_MAX_DURATION_S

  const [phase, setPhase] = useState<Phase>('requesting')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [elapsed, setElapsed] = useState(0)
  const [recordedBytes, setRecordedBytes] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<{ mimeType: string; extension: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const livePreviewRef = useRef<HTMLVideoElement | null>(null)
  const blobRef = useRef<Blob | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  // Full teardown when the dialog closes.
  const teardown = useCallback(() => {
    stopTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        // already stopped
      }
    }
    recorderRef.current = null
    releaseStream()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    blobRef.current = null
    chunksRef.current = []
    setElapsed(0)
    setRecordedBytes(0)
  }, [stopTimer, releaseStream, previewUrl])

  const handleClose = useCallback(() => {
    teardown()
    onClose()
  }, [teardown, onClose])

  // Acquire camera/mic when the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const mime = pickSupportedMimeType(kind)
    if (!mime) {
      setPhase('error')
      setErrorMsg('Your browser does not support recording this format.')
      return
    }
    mimeRef.current = mime

    setPhase('requesting')
    navigator.mediaDevices
      .getUserMedia(isVideo ? { audio: true, video: VIDEO_CONSTRAINTS } : { audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setPhase('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof DOMException ? err.name : ''
        setPhase('error')
        setErrorMsg(
          name === 'NotAllowedError'
            ? 'Camera/microphone access was blocked. Allow it in your browser settings and try again.'
            : name === 'NotFoundError'
              ? `No ${isVideo ? 'camera' : 'microphone'} was found on this device.`
              : 'Could not access your camera/microphone.',
        )
      })

    return () => {
      cancelled = true
    }
    // Re-acquire only when opened or kind changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind])

  // Tear down whenever the dialog is closed.
  useEffect(() => {
    if (!open) teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Attach the live camera stream to the preview element while ready/recording.
  useEffect(() => {
    if (isVideo && (phase === 'ready' || phase === 'recording') && livePreviewRef.current) {
      livePreviewRef.current.srcObject = streamRef.current
    }
  }, [isVideo, phase])

  const startRecording = useCallback(() => {
    const stream = streamRef.current
    const mime = mimeRef.current
    if (!stream || !mime) return

    chunksRef.current = []
    setRecordedBytes(0)
    setElapsed(0)

    const recorder = new MediaRecorder(stream, {
      mimeType: mime.mimeType,
      ...(isVideo
        ? {
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
            audioBitsPerSecond: VIDEO_AUDIO_BITS_PER_SECOND,
          }
        : { audioBitsPerSecond: VOICE_BITS_PER_SECOND }),
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
        setRecordedBytes((prev) => prev + e.data.size)
      }
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime.mimeType })
      blobRef.current = blob
      setRecordedBytes(blob.size)
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPhase('recorded')
      releaseStream()
    }

    recorderRef.current = recorder
    recorder.start(1000) // 1s chunks → live size meter
    setPhase('recording')

    const startedAt = performance.now()
    timerRef.current = setInterval(() => {
      const secs = (performance.now() - startedAt) / 1000
      setElapsed(secs)
      if (secs >= maxDuration) stopRecording()
    }, 250)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, maxDuration, releaseStream])

  const stopRecording = useCallback(() => {
    stopTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [stopTimer])

  // Re-acquire the stream for another take.
  const reRecord = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    blobRef.current = null
    chunksRef.current = []
    setRecordedBytes(0)
    setElapsed(0)
    setPhase('requesting')
    navigator.mediaDevices
      .getUserMedia(isVideo ? { audio: true, video: VIDEO_CONSTRAINTS } : { audio: true })
      .then((stream) => {
        streamRef.current = stream
        setPhase('ready')
      })
      .catch(() => {
        setPhase('error')
        setErrorMsg('Could not access your camera/microphone.')
      })
  }, [isVideo, previewUrl])

  const oversize = recordedBytes > MEDIA_MAX_BYTES

  const handleSend = useCallback(() => {
    const blob = blobRef.current
    const mime = mimeRef.current
    if (!blob || !mime || oversize) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const prefix = isVideo ? 'video-message' : 'voice-note'
    const file = new File([blob], `${prefix}-${stamp}.${mime.extension}`, {
      type: mime.mimeType,
    })
    onCapture(file)
    handleClose()
  }, [oversize, isVideo, onCapture, handleClose])

  const sizePercent = Math.min(100, (recordedBytes / MEDIA_MAX_BYTES) * 100)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isVideo ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {isVideo ? 'Record video message' : 'Record voice note'}
          </DialogTitle>
        </DialogHeader>

        {phase === 'error' ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Preview area */}
            <div className="relative overflow-hidden rounded-md bg-muted">
              {isVideo ? (
                phase === 'recorded' && previewUrl ? (
                  <video
                    src={previewUrl}
                    controls
                    playsInline
                    className="aspect-video w-full bg-black"
                  />
                ) : (
                  <video
                    ref={livePreviewRef}
                    autoPlay
                    muted
                    playsInline
                    className="aspect-video w-full bg-black object-cover"
                  />
                )
              ) : (
                <div className="flex aspect-[3/1] w-full items-center justify-center">
                  {phase === 'recorded' && previewUrl ? (
                    <audio src={previewUrl} controls className="w-full px-4" />
                  ) : (
                    <Mic
                      className={cn(
                        'h-10 w-10 text-muted-foreground',
                        phase === 'recording' && 'animate-pulse text-destructive',
                      )}
                    />
                  )}
                </div>
              )}
              {phase === 'recording' && (
                <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  REC
                </div>
              )}
            </div>

            {/* Timer + size meter */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatDuration(elapsed)} / {formatDuration(maxDuration)}
                </span>
                <span className={cn(oversize && 'font-medium text-destructive')}>
                  {humanFileSize(recordedBytes)} / {humanFileSize(MEDIA_MAX_BYTES)}
                </span>
              </div>
              <Progress
                value={sizePercent}
                className={cn(oversize && '[&>div]:bg-destructive')}
              />
              {oversize && (
                <p className="text-xs text-destructive">
                  Clip is too large to send. Please record a shorter one.
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-2">
              {phase === 'requesting' && (
                <Button disabled variant="outline">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing…
                </Button>
              )}
              {phase === 'ready' && (
                <Button onClick={startRecording}>
                  <span className="mr-2 h-2.5 w-2.5 rounded-full bg-red-500" />
                  Start recording
                </Button>
              )}
              {phase === 'recording' && (
                <Button variant="destructive" onClick={stopRecording}>
                  <Square className="mr-2 h-4 w-4 fill-current" />
                  Stop
                </Button>
              )}
              {phase === 'recorded' && (
                <>
                  <Button variant="outline" onClick={reRecord}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Re-record
                  </Button>
                  <Button onClick={handleSend} disabled={oversize}>
                    <Send className="mr-2 h-4 w-4" />
                    Send
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
})
