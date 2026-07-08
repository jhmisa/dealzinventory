import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Circle, Square, SkipForward, X, AlertCircle, Camera, Mic, Image as ImageIcon, Video, Smartphone, Monitor, Pause, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { getClaimableByCode } from '@/services/mine'
import { VIDEO_CONSTRAINTS, pickSupportedMimeType } from '@/lib/media-recording'
import {
  compositeFrame, computeItemBounds, ORIENTATION_DIMS,
  type RecorderCard, type CardRuntime, type MediaMode, type Orientation,
} from '@/lib/video-recorder'
import type { GalleryImage } from '@/components/shared/image-gallery'
import { CodeStrip } from './code-strip'

const PHOTO_MS = 3000 // matches the showcase page's photo auto-rotation cadence
const LS_CAM = 'recorder.cameraId'
const LS_MIC = 'recorder.micId'
const LS_ORIENTATION = 'recorder.orientation'

interface RecorderProps {
  codes: string[]
  onComplete: (blob: Blob, itemBounds: number[], durationSec: number, firstCode: string | null) => void
  onCancel: () => void
  /** Default frame shape (vertical 9:16 vs landscape 16:9). Falls back to last-used, then portrait. */
  initialOrientation?: Orientation
}

type Phase = 'loading' | 'ready' | 'recording' | 'error'

const COUNTDOWN_FROM = 5 // seconds shown over the live preview before capture begins

function fmt(s: number): string {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

/** Build preloaded, CORS-clean media elements for a claimable product's gallery. */
function buildMedia(media: GalleryImage[]): { photos: HTMLImageElement[]; videos: HTMLVideoElement[] } {
  const photos: HTMLImageElement[] = []
  const videos: HTMLVideoElement[] = []
  const vids = media.filter((m) => m.mediaType === 'video')
  for (const m of media.filter((m) => m.mediaType !== 'video')) {
    const img = new Image()
    img.crossOrigin = 'anonymous' // CORS-clean draw — avoids canvas taint
    img.src = m.url
    photos.push(img)
  }
  for (const m of vids) {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.loop = vids.length === 1 // single video loops; multiple advance on end
    v.preload = 'auto'
    v.src = m.url
    videos.push(v)
  }
  return { photos, videos }
}

async function acquireStream(camId: string, micId: string): Promise<MediaStream> {
  const video: MediaTrackConstraints = camId
    ? { ...VIDEO_CONSTRAINTS, deviceId: { exact: camId } }
    : { ...VIDEO_CONSTRAINTS }
  const audio: MediaTrackConstraints | boolean = micId ? { deviceId: { exact: micId } } : true
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video })
  } catch {
    // A saved device may be unplugged — fall back to browser defaults.
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: VIDEO_CONSTRAINTS })
  }
}

export function Recorder({ codes, onComplete, onCancel, initialOrientation }: RecorderProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [cards, setCards] = useState<RecorderCard[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeMode, setActiveMode] = useState<MediaMode>('photos')
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [orientation, setOrientation] = useState<Orientation>(
    initialOrientation ?? (localStorage.getItem(LS_ORIENTATION) as Orientation | null) ?? 'portrait',
  )
  const dims = ORIENTATION_DIMS[orientation]

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [selectedCam, setSelectedCam] = useState('')
  const [selectedMic, setSelectedMic] = useState('')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<{ mimeType: string; extension: string } | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const pausedTotalRef = useRef(0) // cumulative ms spent paused (excluded from the output clock)
  const pauseStartedAtRef = useRef(0) // performance.now() when the current pause began (0 = not paused)
  const spaceTimesRef = useRef<number[]>([])
  const activeIndexRef = useRef(0)
  const cardsRef = useRef<RecorderCard[]>([])
  const runtimeRef = useRef<CardRuntime[]>([])
  const currentVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => { activeIndexRef.current = activeIndex }, [activeIndex])
  useEffect(() => { cardsRef.current = cards }, [cards])

  // 1. Load overlay cards for each code, then acquire camera + mic.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded: RecorderCard[] = []
      for (const code of codes) {
        try {
          const p = await getClaimableByCode(code)
          if (!p) continue
          const { photos, videos } = buildMedia(p.media)
          loaded.push({
            code: p.code,
            title: p.title,
            subtitle: p.subtitle,
            grade: p.grade,
            price: p.price,
            originalPrice: p.originalPrice ?? null,
            conditionNotes: p.conditionNotes ?? null,
            photos,
            videos,
          })
        } catch {
          // skip un-loadable codes
        }
      }
      if (cancelled) return
      if (!loaded.length) {
        setPhase('error')
        setErrorMsg('None of the selected item codes could be loaded.')
        return
      }
      runtimeRef.current = loaded.map((c) => ({
        mode: c.photos.length ? 'photos' : c.videos.length ? 'videos' : 'photos',
        photoIndex: 0,
        videoIndex: 0,
        photoStart: performance.now(),
      }))
      setCards(loaded)
      setActiveMode(runtimeRef.current[0]?.mode ?? 'photos')

      const mime = pickSupportedMimeType('video')
      if (!mime) {
        setPhase('error')
        setErrorMsg('Your browser does not support video recording.')
        return
      }
      mimeRef.current = mime
      try {
        const savedCam = localStorage.getItem(LS_CAM) ?? ''
        const savedMic = localStorage.getItem(LS_MIC) ?? ''
        const stream = await acquireStream(savedCam, savedMic)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setPhase('ready')

        // Device labels are only populated once permission is granted.
        const devices = await navigator.mediaDevices.enumerateDevices()
        if (cancelled) return
        setCameras(devices.filter((d) => d.kind === 'videoinput'))
        setMics(devices.filter((d) => d.kind === 'audioinput'))
        setSelectedCam(stream.getVideoTracks()[0]?.getSettings().deviceId ?? savedCam)
        setSelectedMic(stream.getAudioTracks()[0]?.getSettings().deviceId ?? savedMic)
      } catch {
        if (cancelled) return
        setPhase('error')
        setErrorMsg('Could not access your camera/microphone. Allow access and try again.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [codes])

  // Attach the camera stream to the off-screen <video> for compositing.
  // NOTE: the element must stay in the paint tree (not display:none) or the browser
  // won't decode frames from a real camera track, so drawImage() paints black.
  useEffect(() => {
    const cam = cameraRef.current
    if ((phase === 'ready' || phase === 'recording') && cam && streamRef.current) {
      if (cam.srcObject !== streamRef.current) cam.srcObject = streamRef.current
      cam.play().catch(() => {})
    }
  }, [phase])

  // Compositing loop: rotate photos / advance & play videos for the active card.
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'recording') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => {
      const now = performance.now()
      const idx = activeIndexRef.current
      const card = cardsRef.current[idx]
      const rt = runtimeRef.current[idx]
      if (card && rt) {
        if (rt.mode === 'photos' && card.photos.length > 1 && now - rt.photoStart >= PHOTO_MS) {
          rt.photoIndex = (rt.photoIndex + 1) % card.photos.length
          rt.photoStart = now
        }

        // Play only the active card's current video; pause everything else.
        let desired: HTMLVideoElement | null = null
        if (rt.mode === 'videos' && card.videos.length) {
          const cur = card.videos[rt.videoIndex % card.videos.length]
          if (cur.ended && card.videos.length > 1) {
            rt.videoIndex = (rt.videoIndex + 1) % card.videos.length
          }
          desired = card.videos[rt.videoIndex % card.videos.length]
        }
        if (currentVideoRef.current && currentVideoRef.current !== desired) {
          currentVideoRef.current.pause()
        }
        if (desired && desired !== currentVideoRef.current) {
          try { desired.currentTime = 0 } catch { /* not seekable yet */ }
          desired.play().catch(() => {})
        }
        currentVideoRef.current = desired

        compositeFrame({
          ctx,
          canvasW: dims.canvasW,
          canvasH: dims.canvasH,
          product: dims.product,
          cameraBox: dims.camera,
          card,
          mode: rt.mode,
          photoIndex: rt.photoIndex,
          videoIndex: rt.videoIndex,
          camera: cameraRef.current,
        })
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    rafRef.current = raf
    return () => cancelAnimationFrame(raf)
  }, [phase, dims])

  // Teardown.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop()
        } catch {
          // already stopped
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      // cardsRef is read at cleanup time (cards load async, after mount).
      for (const c of cardsRef.current) for (const v of c.videos) { v.pause(); v.removeAttribute('src'); v.load() }
    }
  }, [])

  // Recording clock in seconds, excluding time spent paused. SPACE boundaries,
  // the elapsed timer, and the final duration all read from this so a paused take
  // still lines up with the exported (paused-time-removed) video.
  const clockSec = useCallback(() => {
    const now = performance.now()
    const extra = pauseStartedAtRef.current ? now - pauseStartedAtRef.current : 0
    return Math.max(0, (now - startedAtRef.current - pausedTotalRef.current - extra) / 1000)
  }, [])

  const advance = useCallback(() => {
    setActiveIndex((i) => {
      if (i >= cardsRef.current.length - 1) return i
      spaceTimesRef.current.push(clockSec())
      const next = i + 1
      const rt = runtimeRef.current[next]
      if (rt) {
        rt.photoStart = performance.now()
        setActiveMode(rt.mode)
      }
      return next
    })
  }, [clockSec])

  const toggleMode = useCallback(() => {
    const idx = activeIndexRef.current
    const card = cardsRef.current[idx]
    const rt = runtimeRef.current[idx]
    if (!card || !rt) return
    const other: MediaMode = rt.mode === 'photos' ? 'videos' : 'photos'
    if (other === 'videos' && !card.videos.length) return
    if (other === 'photos' && !card.photos.length) return
    rt.mode = other
    rt.photoStart = performance.now()
    setActiveMode(other)
  }, [])

  const setMode = useCallback((m: MediaMode) => {
    const idx = activeIndexRef.current
    const card = cardsRef.current[idx]
    const rt = runtimeRef.current[idx]
    if (!card || !rt || rt.mode === m) return
    if (m === 'videos' && !card.videos.length) return
    if (m === 'photos' && !card.photos.length) return
    rt.mode = m
    rt.photoStart = performance.now()
    setActiveMode(m)
  }, [])

  // Keyboard: SPACE advances (while recording); T toggles photo/video for the current item.
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'recording') return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.code === 'Space' || e.key === ' ') {
        if (phase !== 'recording') return
        e.preventDefault()
        advance()
      } else if (e.code === 'KeyT') {
        e.preventDefault()
        toggleMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, advance, toggleMode])

  // Elapsed timer. Reads the paused-adjusted clock, so it naturally freezes while paused.
  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => setElapsed(clockSec()), 250)
    return () => clearInterval(id)
  }, [phase, clockSec])

  const changeOrientation = useCallback((o: Orientation) => {
    setOrientation(o)
    localStorage.setItem(LS_ORIENTATION, o)
  }, [])

  const applyDevices = useCallback(async (camId: string, micId: string) => {
    try {
      const next = await acquireStream(camId, micId)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = next
      if (cameraRef.current) {
        cameraRef.current.srcObject = next
        cameraRef.current.play().catch(() => {})
      }
      const camActual = next.getVideoTracks()[0]?.getSettings().deviceId ?? camId
      const micActual = next.getAudioTracks()[0]?.getSettings().deviceId ?? micId
      setSelectedCam(camActual)
      setSelectedMic(micActual)
      if (camActual) localStorage.setItem(LS_CAM, camActual)
      if (micActual) localStorage.setItem(LS_MIC, micActual)
    } catch {
      toast.error('Could not switch to that device.')
    }
  }, [])

  const startRecording = useCallback(() => {
    const canvas = canvasRef.current
    const stream = streamRef.current
    const mime = mimeRef.current
    if (!canvas || !stream || !mime) return
    if (!('captureStream' in canvas)) {
      setPhase('error')
      setErrorMsg('This browser cannot capture the canvas. Please use Chrome or Edge.')
      return
    }
    const canvasStream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream }).captureStream(30)
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...stream.getAudioTracks()])
    const recorder = new MediaRecorder(combined, {
      mimeType: mime.mimeType,
      videoBitsPerSecond: 2_500_000,
      audioBitsPerSecond: 128_000,
    })
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime.mimeType })
      const durationSec = clockSec()
      const itemBounds = computeItemBounds(spaceTimesRef.current, durationSec)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      onComplete(blob, itemBounds, durationSec, cardsRef.current[0]?.code ?? null)
    }
    recorderRef.current = recorder
    spaceTimesRef.current = []
    setActiveIndex(0)
    // Rewind every card's media so the take starts each item from the top.
    const now = performance.now()
    runtimeRef.current.forEach((rt) => { rt.photoIndex = 0; rt.videoIndex = 0; rt.photoStart = now })
    const rt0 = runtimeRef.current[0]
    if (rt0) setActiveMode(rt0.mode)
    recorder.start(1000)
    startedAtRef.current = performance.now()
    pausedTotalRef.current = 0
    pauseStartedAtRef.current = 0
    setPaused(false)
    setElapsed(0)
    setPhase('recording')
  }, [onComplete, clockSec])

  // "Start recording" runs a 5→1 countdown over the live preview first, then captures.
  const beginCountdown = useCallback(() => {
    if (!streamRef.current) return
    setCountdown(COUNTDOWN_FROM)
  }, [])

  useEffect(() => {
    if (countdown == null) return
    // Last tick shows "1" for a full second, then clears the overlay and captures.
    if (countdown <= 1) {
      const id = setTimeout(() => {
        setCountdown(null)
        startRecording()
      }, 1000)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000)
    return () => clearTimeout(id)
  }, [countdown, startRecording])

  const togglePause = useCallback(() => {
    const r = recorderRef.current
    if (!r) return
    if (r.state === 'recording') {
      r.pause()
      pauseStartedAtRef.current = performance.now()
      setPaused(true)
    } else if (r.state === 'paused') {
      if (pauseStartedAtRef.current) {
        pausedTotalRef.current += performance.now() - pauseStartedAtRef.current
        pauseStartedAtRef.current = 0
      }
      r.resume()
      setPaused(false)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  const titles = Object.fromEntries(cards.map((c) => [c.code, c.title]))
  const isLast = activeIndex >= cards.length - 1
  const activeCard = cards[activeIndex]
  const hasPhotos = !!activeCard?.photos.length
  const hasVideos = !!activeCard?.videos.length

  const deviceLabel = (list: MediaDeviceInfo[], id: string, fallback: string) => {
    const d = list.find((x) => x.deviceId === id)
    return d?.label || fallback
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="max-w-sm text-sm text-muted-foreground">{errorMsg}</p>
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <CodeStrip codes={cards.map((c) => c.code)} activeIndex={activeIndex} titles={titles} />
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={phase === 'recording'}>
          <X className="mr-1.5 h-4 w-4" />
          Cancel
        </Button>
      </div>

      {/* Preview canvas — product showcase square + seller camera (stacked for 9:16, side-by-side for 16:9) */}
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg border border-border bg-black"
        style={{ maxWidth: orientation === 'portrait' ? 300 : 560 }}
      >
        <canvas ref={canvasRef} width={dims.canvasW} height={dims.canvasH} className="h-auto w-full" />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing…
          </div>
        )}
        {phase === 'recording' && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            <span className={cn('h-2 w-2 rounded-full', paused ? 'bg-white/70' : 'animate-pulse bg-red-500')} />
            {paused ? 'PAUSED' : 'REC'} {fmt(elapsed)}
          </div>
        )}
        {countdown != null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="text-7xl font-bold tabular-nums text-white drop-shadow-lg">{countdown}</span>
          </div>
        )}
      </div>

      {/* Off-screen camera source (composited onto the canvas). Must stay painted —
          display:none stops frame decoding on a real camera track (paints black). */}
      <video
        ref={cameraRef}
        autoPlay
        muted
        playsInline
        className="pointer-events-none fixed left-[-9999px] top-0 h-[2px] w-[2px] opacity-0"
      />

      {/* Ready: grouped setup panel (format + devices), then Start recording */}
      {phase === 'ready' && (
        <div className="mx-auto max-w-md space-y-4">
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            {/* Format */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Format</span>
                <span className="text-[10px] text-muted-foreground">
                  Press <kbd className="rounded border border-border px-1">T</kbd> to switch media
                </span>
              </div>
              <div className="inline-flex w-full rounded-md border border-border p-0.5">
                <Button
                  variant={orientation === 'portrait' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => changeOrientation('portrait')}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Vertical 9:16
                </Button>
                <Button
                  variant={orientation === 'landscape' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 flex-1 gap-1.5 text-xs"
                  onClick={() => changeOrientation('landscape')}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Landscape 16:9
                </Button>
              </div>
              {activeCard && (
                <div className="inline-flex w-full rounded-md border border-border p-0.5">
                  <Button
                    variant={activeMode === 'photos' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 flex-1 gap-1.5 text-xs"
                    disabled={!hasPhotos}
                    onClick={() => setMode('photos')}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    Photos{hasPhotos ? ` (${activeCard.photos.length})` : ''}
                  </Button>
                  <Button
                    variant={activeMode === 'videos' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 flex-1 gap-1.5 text-xs"
                    disabled={!hasVideos}
                    onClick={() => setMode('videos')}
                  >
                    <Video className="h-3.5 w-3.5" />
                    Video{hasVideos ? ` (${activeCard.videos.length})` : ''}
                  </Button>
                </div>
              )}
            </div>

            {/* Devices */}
            {(cameras.length > 0 || mics.length > 0) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Devices</span>
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Select value={selectedCam} onValueChange={(v) => applyDevices(v, selectedMic)}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Camera" /></SelectTrigger>
                    <SelectContent>
                      {cameras.map((d, i) => (
                        <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Select value={selectedMic} onValueChange={(v) => applyDevices(selectedCam, v)}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Microphone" /></SelectTrigger>
                    <SelectContent>
                      {mics.map((d, i) => (
                        <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <Button size="lg" onClick={beginCountdown} disabled={countdown != null}>
              <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />
              Start recording
            </Button>
          </div>
        </div>
      )}

      {/* Recording: media toggle + device label + transport controls */}
      {phase === 'recording' && (
        <>
          {activeCard && (
            <div className="flex items-center justify-center gap-2">
              <div className="inline-flex rounded-md border border-border p-0.5">
                <Button
                  variant={activeMode === 'photos' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!hasPhotos}
                  onClick={() => setMode('photos')}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  Photos{hasPhotos ? ` (${activeCard.photos.length})` : ''}
                </Button>
                <Button
                  variant={activeMode === 'videos' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  disabled={!hasVideos}
                  onClick={() => setMode('videos')}
                >
                  <Video className="h-3.5 w-3.5" />
                  Video{hasVideos ? ` (${activeCard.videos.length})` : ''}
                </Button>
              </div>
              <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">T</kbd>
            </div>
          )}
          <p className="text-center text-[11px] text-muted-foreground">
            <Camera className="mr-1 inline h-3 w-3" />
            {deviceLabel(cameras, selectedCam, 'Default camera')}
            <span className="mx-1.5">·</span>
            <Mic className="mr-1 inline h-3 w-3" />
            {deviceLabel(mics, selectedMic, 'Default mic')}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={advance} disabled={isLast}>
              <SkipForward className="mr-2 h-4 w-4" />
              Next item
              <kbd className="ml-2 rounded border border-border px-1 text-[10px]">Space</kbd>
            </Button>
            <Button variant="outline" onClick={togglePause}>
              {paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4 fill-current" />
              Stop
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Talk about the current item, then press <b>Space</b> to advance. Press <b>T</b> to switch between its photos and video. One continuous take.
          </p>
        </>
      )}
    </div>
  )
}
