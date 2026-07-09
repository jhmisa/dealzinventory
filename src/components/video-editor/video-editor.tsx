import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, Scissors, Trash2, Undo2, ZoomIn, ZoomOut, Loader2, ArrowRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  makeTimeline, addSplit, removePiece, restorePiece, setTrim, keepIntervals,
  type TimelineState, type Range,
} from '@/lib/video-editor/timeline'
import { canExportVideo, exportEditedVideo } from '@/lib/video-editor/export-video'
import type { LogoConfig, LogoCorner } from '@/lib/video-editor/logo'
import { ReviewTrimTimeline } from './review-trim-timeline'
import { LogoControls } from './logo-controls'
import { IntroOutroControls, type ClipSelection } from './intro-outro-controls'
import { useVideoAssets } from '@/hooks/use-video-assets'
import { fetchAssetBlob } from '@/services/video-assets'

interface VideoEditorProps {
  source: Blob
  /** Optional recorder-provided item boundaries (seconds). Phase 1b passes these; uploads pass []. */
  itemBounds?: number[]
  /** Fallback duration (seconds) for sources whose <video>.duration isn't finite (MediaRecorder webm blobs). */
  durationHint?: number
  /** Called with the finished MP4 to hand off to the page (upload + draft post). */
  onExport: (mp4: Blob) => Promise<void> | void
}

const CORNER_CLASS: Record<LogoCorner, string> = {
  tl: 'top-2 left-2',
  tr: 'top-2 right-2',
  bl: 'bottom-2 left-2',
  br: 'bottom-2 right-2',
}

export function VideoEditor({ source, itemBounds, durationHint, onExport }: VideoEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number | null>(null)
  const [srcUrl, setSrcUrl] = useState<string | null>(null)

  const [state, setState] = useState<TimelineState | null>(null)
  const historyRef = useRef<TimelineState[]>([])
  const [canUndo, setCanUndo] = useState(false)

  const [playhead, setPlayhead] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<Range | null>(null)
  const [playing, setPlaying] = useState(false)
  const [logo, setLogo] = useState<LogoConfig>({ enabled: true, corner: 'br' })
  const [intro, setIntro] = useState<ClipSelection>({ enabled: false, id: null })
  const [outro, setOutro] = useState<ClipSelection>({ enabled: false, id: null })
  const { data: videoAssets = [] } = useVideoAssets()

  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const exportable = canExportVideo()

  // Object URL for the preview.
  useEffect(() => {
    const url = URL.createObjectURL(source)
    setSrcUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [source])

  // Build the timeline once the video's duration is known.
  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    // MediaRecorder-webm blobs report duration = Infinity until fully seeked (spike-confirmed);
    // fall back to the recorder's measured durationHint in that case.
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : (durationHint ?? 0)
    if (dur <= 0) return
    setState(makeTimeline(dur, itemBounds ?? []))
  }, [itemBounds, durationHint])

  // Snapshot + mutate helper (undo history, cap 50).
  const mutate = useCallback((fn: (s: TimelineState) => TimelineState) => {
    setState((prev) => {
      if (!prev) return prev
      historyRef.current = [...historyRef.current, prev].slice(-50)
      setCanUndo(true)
      return fn(prev)
    })
  }, [])

  const undo = useCallback(() => {
    const h = historyRef.current
    if (!h.length) return
    const prev = h[h.length - 1]
    historyRef.current = h.slice(0, -1)
    setCanUndo(historyRef.current.length > 0)
    setSelected(null)
    setState(prev)
  }, [])

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (v) v.currentTime = t
    setPlayhead(t)
  }, [])

  const doSplit = useCallback(() => {
    mutate((s) => addSplit(s, playhead))
  }, [mutate, playhead])

  const doRemove = useCallback(() => {
    if (!selected) return
    mutate((s) => removePiece(s, selected))
    setSelected(null)
  }, [mutate, selected])

  const doRestore = useCallback((p: Range) => {
    mutate((s) => restorePiece(s, p))
  }, [mutate])

  const doSetTrim = useCallback((start: number, end: number) => {
    mutate((s) => setTrim(s, start, end))
  }, [mutate])

  // Keyboard: S = split, Backspace/Delete = remove. Ignore when typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); doSplit() }
      else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); doRemove() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSplit, doRemove])

  // Playback loop: native play + skip removed ranges + loop within trim window.
  const stopLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !state) return
    if (playing) {
      v.pause()
      setPlaying(false)
      stopLoop()
      return
    }
    // Preview the FINAL edit: play only the kept ranges (trim window minus removed
    // pieces), jumping over each cut without pausing. This is the exact export contract.
    const keep = keepIntervals(state)
    if (!keep.length) return
    const inKeep = (t: number) => keep.some((r) => t >= r.start - 0.02 && t < r.end)
    if (!inKeep(v.currentTime)) v.currentTime = keep[0].start
    void v.play()
    setPlaying(true)
    const tick = () => {
      const cur = v.currentTime
      // First kept interval whose end is still ahead of the playhead.
      const seg = keep.find((r) => cur < r.end - 0.02)
      if (!seg) {
        // Past the last kept range → stop cleanly at the end of the edit.
        v.pause()
        setPlaying(false)
        setPlayhead(keep[keep.length - 1].end)
        stopLoop()
        return
      }
      // Inside a removed gap comfortably before this segment → skip to its start.
      // The 0.15s tolerance keeps a seek that lands a few ms shy of the boundary
      // from re-triggering the jump every frame (which would pin the decoder and
      // freeze playback). Re-kick play() since a seek can briefly drop readyState.
      if (cur < seg.start - 0.15) {
        v.currentTime = seg.start
        void v.play()
      }
      setPlayhead(v.currentTime)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [playing, state, stopLoop])

  useEffect(() => stopLoop, [stopLoop])

  const changeZoom = useCallback((factor: number) => {
    setZoom((z) => Math.min(16, Math.max(1, factor > 1 ? z * 2 : z / 2)))
  }, [])

  const runExport = useCallback(async () => {
    if (!state) return
    const keep = keepIntervals(state)
    if (!keep.length) { toast.error('Nothing to export — the whole clip is trimmed or cut.'); return }
    setExporting(true)
    setProgress(0)
    if (playing) togglePlay()
    try {
      // Resolve the selected intro/outro clips (if enabled) to blobs for stitching.
      const urlFor = (sel: ClipSelection) =>
        sel.enabled ? videoAssets.find((a) => a.id === (sel.id ?? ''))?.file_url ?? null : null
      const introUrl = urlFor(intro)
      const outroUrl = urlFor(outro)
      const [introBlob, outroBlob] = await Promise.all([
        introUrl ? fetchAssetBlob(introUrl) : Promise.resolve(null),
        outroUrl ? fetchAssetBlob(outroUrl) : Promise.resolve(null),
      ])
      const mp4 = await exportEditedVideo({ source, keep, logo, intro: introBlob, outro: outroBlob, onProgress: setProgress })
      await onExport(mp4)
    } catch (err) {
      console.error('[video-editor] export failed', err)
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }, [state, source, logo, intro, outro, videoAssets, onExport, playing, togglePlay])

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-lg border border-border bg-black">
        {srcUrl && (
          <video
            ref={videoRef}
            src={srcUrl}
            playsInline
            className="mx-auto max-h-[60vh] w-full bg-black object-contain"
            onLoadedMetadata={handleLoadedMetadata}
            onClick={togglePlay}
          />
        )}
        {logo.enabled && (
          <div
            className={cn(
              'pointer-events-none absolute rounded-md bg-black/45 px-2 py-1 text-sm font-bold text-white',
              CORNER_CLASS[logo.corner],
            )}
          >
            {logo.text ?? 'Dealz'}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={togglePlay} disabled={!state || exporting}>
          {playing ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="outline" size="sm" onClick={doSplit} disabled={!state || exporting}>
          <Scissors className="mr-1.5 h-4 w-4" />
          Split <kbd className="ml-1.5 rounded border border-border px-1 text-[10px]">S</kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={doRemove} disabled={!selected || exporting}>
          <Trash2 className="mr-1.5 h-4 w-4" />
          Remove <kbd className="ml-1.5 rounded border border-border px-1 text-[10px]">⌫</kbd>
        </Button>
        <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo || exporting}>
          <Undo2 className="mr-1.5 h-4 w-4" />
          Undo
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeZoom(0.5)} disabled={zoom <= 1}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-8 text-center text-xs tabular-nums text-muted-foreground">{zoom}×</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeZoom(2)} disabled={zoom >= 16}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Timeline */}
      {state ? (
        <ReviewTrimTimeline
          state={state}
          playhead={playhead}
          zoom={zoom}
          selected={selected}
          onScrub={seekTo}
          onSelectPiece={setSelected}
          onRestorePiece={doRestore}
          onSetTrim={doSetTrim}
        />
      ) : (
        <div className="text-sm text-muted-foreground">Loading video…</div>
      )}

      {/* Finishing + export */}
      <div className="border-t border-border pt-4">
        <IntroOutroControls
          intro={intro}
          outro={outro}
          onIntroChange={setIntro}
          onOutroChange={setOutro}
          disabled={exporting}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <LogoControls value={logo} onChange={setLogo} />
        <div className="ml-auto flex items-center gap-3">
          {exporting && <Progress value={Math.round(progress * 100)} className="w-40" />}
          {!exportable ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-500">
              <AlertTriangle className="h-4 w-4" />
              Use Chrome or Edge to export
            </span>
          ) : (
            <Button onClick={runExport} disabled={!state || exporting}>
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting… {Math.round(progress * 100)}%
                </>
              ) : (
                <>
                  Export &amp; continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Renders with cuts skipped (WebCodecs). Logo burned in. Audio preserved. Intro/outro stitched when enabled. Music bed coming soon.
      </p>
    </div>
  )
}
