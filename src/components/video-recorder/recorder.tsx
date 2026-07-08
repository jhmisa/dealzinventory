import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Circle, Square, SkipForward, X, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getClaimableByCode } from '@/services/mine'
import { VIDEO_CONSTRAINTS, pickSupportedMimeType } from '@/lib/media-recording'
import {
  compositeFrame, computeItemBounds,
  type RecorderCard, type RecorderLayout,
} from '@/lib/video-recorder'
import { CodeStrip } from './code-strip'

const CANVAS_W = 720
const CANVAS_H = 1280
const LAYOUT: RecorderLayout = { pipCorner: 'tr', pipScale: 0.3 }

interface RecorderProps {
  codes: string[]
  onComplete: (blob: Blob, itemBounds: number[], durationSec: number, firstCode: string | null) => void
  onCancel: () => void
}

type Phase = 'loading' | 'ready' | 'recording' | 'error'

function fmt(s: number): string {
  const v = Math.max(0, Math.floor(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

export function Recorder({ codes, onComplete, onCancel }: RecorderProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [cards, setCards] = useState<RecorderCard[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cameraRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<{ mimeType: string; extension: string } | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const spaceTimesRef = useRef<number[]>([])
  const activeIndexRef = useRef(0)
  const cardsRef = useRef<RecorderCard[]>([])

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
          const card: RecorderCard = {
            code: p.code,
            title: p.title,
            subtitle: p.subtitle,
            grade: p.grade,
            price: p.price,
            originalPrice: p.originalPrice ?? null,
            conditionNotes: p.conditionNotes ?? null,
            hero: null,
          }
          const heroUrl = p.media.find((m) => m.mediaType === 'image')?.url
          if (heroUrl) {
            const img = new Image()
            img.crossOrigin = 'anonymous' // CORS-clean draw (spike-verified) — avoids canvas taint
            img.src = heroUrl
            card.hero = img
          }
          loaded.push(card)
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
      setCards(loaded)

      const mime = pickSupportedMimeType('video')
      if (!mime) {
        setPhase('error')
        setErrorMsg('Your browser does not support video recording.')
        return
      }
      mimeRef.current = mime
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: VIDEO_CONSTRAINTS })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setPhase('ready')
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

  // Attach the camera stream to the hidden <video> for compositing.
  useEffect(() => {
    if ((phase === 'ready' || phase === 'recording') && cameraRef.current && streamRef.current) {
      cameraRef.current.srcObject = streamRef.current
    }
  }, [phase])

  // Compositing loop.
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'recording') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => {
      const card = cardsRef.current[activeIndexRef.current]
      if (card) compositeFrame({ ctx, w: CANVAS_W, h: CANVAS_H, card, camera: cameraRef.current, layout: LAYOUT })
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    rafRef.current = raf
    return () => cancelAnimationFrame(raf)
  }, [phase])

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
    }
  }, [])

  const advance = useCallback(() => {
    setActiveIndex((i) => {
      if (i >= cardsRef.current.length - 1) return i
      spaceTimesRef.current.push((performance.now() - startedAtRef.current) / 1000)
      return i + 1
    })
  }, [])

  // SPACE advances the overlay to the next item (while recording).
  useEffect(() => {
    if (phase !== 'recording') return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        const el = e.target as HTMLElement | null
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, advance])

  // Elapsed timer.
  useEffect(() => {
    if (phase !== 'recording') return
    const id = setInterval(() => setElapsed((performance.now() - startedAtRef.current) / 1000), 250)
    return () => clearInterval(id)
  }, [phase])

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
    // Combined stream = composited canvas video + live mic audio (spike-validated pattern).
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
      const durationSec = (performance.now() - startedAtRef.current) / 1000
      const itemBounds = computeItemBounds(spaceTimesRef.current, durationSec)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      onComplete(blob, itemBounds, durationSec, cardsRef.current[0]?.code ?? null)
    }
    recorderRef.current = recorder
    spaceTimesRef.current = []
    setActiveIndex(0)
    recorder.start(1000)
    startedAtRef.current = performance.now()
    setElapsed(0)
    setPhase('recording')
  }, [onComplete])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }, [])

  const titles = Object.fromEntries(cards.map((c) => [c.code, c.title]))
  const isLast = activeIndex >= cards.length - 1

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

      {/* Portrait preview canvas */}
      <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-lg border border-border bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="h-auto w-full"
        />
        {phase === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing…
          </div>
        )}
        {phase === 'recording' && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            REC {fmt(elapsed)}
          </div>
        )}
        {(phase === 'ready' || phase === 'recording') && cards.length > 0 && (
          <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            Item {Math.min(activeIndex + 1, cards.length)} / {cards.length}
          </div>
        )}
      </div>

      {/* Hidden camera source (composited onto the canvas) */}
      <video ref={cameraRef} autoPlay muted playsInline className="hidden" />

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {phase === 'ready' && (
          <Button onClick={startRecording}>
            <Circle className="mr-2 h-4 w-4 fill-red-500 text-red-500" />
            Start recording
          </Button>
        )}
        {phase === 'recording' && (
          <>
            <Button variant="outline" onClick={advance} disabled={isLast}>
              <SkipForward className="mr-2 h-4 w-4" />
              Next item
              <kbd className="ml-2 rounded border border-border px-1 text-[10px]">Space</kbd>
            </Button>
            <Button variant="destructive" onClick={stopRecording}>
              <Square className="mr-2 h-4 w-4 fill-current" />
              Stop
            </Button>
          </>
        )}
      </div>
      {phase === 'recording' && (
        <p className="text-center text-xs text-muted-foreground">
          Talk about the current item, then press <b>Space</b> (or “Next item”) to advance the overlay. One continuous take.
        </p>
      )}
    </div>
  )
}
