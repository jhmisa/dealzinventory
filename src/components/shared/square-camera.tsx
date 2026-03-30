import { useState, useRef, useEffect, useCallback } from 'react'
import { Camera, X, CircleDot, Square, SwitchCamera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { VIDEO_SPECS } from '@/lib/media/config'

interface SquareCameraProps {
  mode: 'photo' | 'video'
  onCapture: (file: File) => void
  onClose: () => void
  maxDuration?: number
  facingMode?: 'environment' | 'user'
}

export function SquareCamera({
  mode,
  onCapture,
  onClose,
  maxDuration = VIDEO_SPECS.maxDurationSec,
  facingMode: initialFacing,
}: SquareCameraProps) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const defaultFacing = initialFacing ?? (isMobile ? 'environment' : 'user')
  const [facing, setFacing] = useState(defaultFacing)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [hasStream, setHasStream] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setHasStream(false)
  }, [])

  const startStream = useCallback(async (face: 'environment' | 'user') => {
    stopStream()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      setHasStream(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not access camera'
      toast.error(`Camera error: ${message}`)
      onClose()
    }
  }, [stopStream, onClose])

  // Sync srcObject when <video> mounts (hasStream gates rendering)
  useEffect(() => {
    if (hasStream && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [hasStream])

  useEffect(() => {
    startStream(facing)
    return () => {
      stopStream()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFlipCamera() {
    const newFacing = facing === 'environment' ? 'user' : 'environment'
    setFacing(newFacing)
    startStream(newFacing)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return

    const vw = video.videoWidth
    const vh = video.videoHeight
    const size = Math.min(vw, vh)
    const sx = (vw - size) / 2
    const sy = (vh - size) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })
        onCapture(file)
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
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
      const file = new File([blob], `recording_${Date.now()}.${ext}`, { type: mimeType })
      onCapture(file)
    }

    recorder.start(1000)
    recorderRef.current = recorder
    setRecording(true)
    setRecordingTime(0)

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => {
        const next = prev + 1
        if (next >= maxDuration) {
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

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center md:relative md:inset-auto md:z-auto md:rounded-lg md:overflow-hidden md:border">
      {/* Square viewfinder */}
      <div className="relative w-full max-w-[min(100vw,100vh)] aspect-square bg-black overflow-hidden">
        {hasStream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Recording indicator */}
        {recording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 z-10">
            <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-sm font-mono">
              {formatTime(recordingTime)} / {formatTime(maxDuration)}
            </span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-4 py-6 bg-black w-full">
        {/* Flip camera */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-10 w-10 text-white hover:bg-white/20"
          onClick={handleFlipCamera}
          disabled={recording}
          title="Switch camera"
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>

        {/* Main action button */}
        {mode === 'photo' ? (
          <Button
            size="lg"
            className="rounded-full h-16 w-16 shadow-lg bg-white hover:bg-white/90"
            onClick={capturePhoto}
            title="Capture photo"
          >
            <Camera className="h-7 w-7 text-black" />
          </Button>
        ) : !recording ? (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16 shadow-lg"
            onClick={startRecording}
            title="Start recording"
          >
            <CircleDot className="h-7 w-7" />
          </Button>
        ) : (
          <Button
            size="lg"
            variant="destructive"
            className="rounded-full h-16 w-16 shadow-lg"
            onClick={stopRecording}
            title="Stop recording"
          >
            <Square className="h-6 w-6" />
          </Button>
        )}

        {/* Close */}
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-10 w-10 text-white hover:bg-white/20"
          onClick={() => {
            stopRecording()
            stopStream()
            onClose()
          }}
          title="Close camera"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
