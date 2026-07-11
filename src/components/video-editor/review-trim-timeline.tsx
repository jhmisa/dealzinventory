import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  pieces, isRemoved, cutTotal, finalLength,
  type TimelineState, type Range,
} from '@/lib/video-editor/timeline'
import { sceneFill } from '@/lib/video-editor/scene-colors'
import { cn } from '@/lib/utils'

interface ReviewTrimTimelineProps {
  state: TimelineState
  playhead: number
  zoom: number
  selected: Range | null
  onScrub: (t: number) => void
  onSelectPiece: (p: Range | null) => void
  onRestorePiece: (p: Range) => void
  onSetTrim: (start: number, end: number) => void
}

const REMOVED_HATCH =
  'repeating-linear-gradient(45deg,oklch(0.42 0.10 25),oklch(0.42 0.10 25) 6px,oklch(0.30 0.07 25) 6px,oklch(0.30 0.07 25) 12px)'

function fmtC(s: number): string {
  const v = Math.max(0, Math.round(s))
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`
}

function tickStep(zoom: number): number {
  return zoom >= 8 ? 1 : zoom >= 4 ? 2 : zoom >= 2 ? 5 : 10
}

export function ReviewTrimTimeline({
  state, playhead, zoom, selected, onScrub, onSelectPiece, onRestorePiece, onSetTrim,
}: ReviewTrimTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(800)

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => setContainerW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const duration = state.duration || 1
  const base = Math.max(6, (containerW - 2) / duration)
  const pps = base * zoom
  const t2x = useCallback((t: number) => t * pps, [pps])

  const x2t = useCallback(
    (clientX: number) => {
      const rect = innerRef.current?.getBoundingClientRect()
      if (!rect) return 0
      return Math.min(duration, Math.max(0, (clientX - rect.left) / pps))
    },
    [duration, pps],
  )

  // Scrub on the ruler.
  const startScrub = useCallback(
    (e: React.PointerEvent) => {
      onScrub(x2t(e.clientX))
      const move = (ev: PointerEvent) => onScrub(x2t(ev.clientX))
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
    },
    [onScrub, x2t],
  )

  // Drag a trim handle.
  const startTrim = useCallback(
    (side: 'L' | 'R') => (e: React.PointerEvent) => {
      e.stopPropagation()
      const move = (ev: PointerEvent) => {
        const t = x2t(ev.clientX)
        if (side === 'L') onSetTrim(Math.min(t, state.trimEnd - 0.5), state.trimEnd)
        else onSetTrim(state.trimStart, Math.max(t, state.trimStart + 0.5))
      }
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
    },
    [onSetTrim, state.trimStart, state.trimEnd, x2t],
  )

  const ps = pieces(state)
  const removedTotal = cutTotal(state)
  const finalTotal = finalLength(state)

  // Ruler ticks.
  const step = tickStep(zoom)
  const ticks: number[] = []
  for (let t = 0; t <= duration; t += step) ticks.push(t)

  const isSel = (p: Range) =>
    !!selected && Math.abs(selected.start - p.start) < 0.01 && Math.abs(selected.end - p.end) < 0.01

  const innerWidth = duration * pps

  return (
    <div className="space-y-2">
      {/* Readouts */}
      <div className="flex gap-6 text-[13px] text-muted-foreground">
        <span>
          Original <b className="font-semibold tabular-nums text-foreground">{fmtC(duration)}</b>
        </span>
        <span>
          Removed <b className="font-semibold tabular-nums text-destructive">{fmtC(removedTotal)}</b>
        </span>
        <span>
          Final <b className="font-semibold tabular-nums text-foreground">{fmtC(finalTotal)}</b>
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="overflow-x-auto overflow-y-hidden rounded-lg border border-border bg-muted/30"
      >
        <div ref={innerRef} className="relative h-[118px]" style={{ width: innerWidth, minWidth: '100%' }}>
          {/* Ruler */}
          <div
            className="relative h-[26px] cursor-pointer border-b border-border bg-black/20"
            onPointerDown={startScrub}
          >
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: t2x(t) }}>
                <span className="absolute left-1 top-[5px] font-mono text-[9.5px] tabular-nums text-muted-foreground">
                  {fmtC(t)}
                </span>
              </div>
            ))}
          </div>

          {/* Track */}
          <div className="absolute left-0 right-0 top-[26px] h-[92px]">
            {/* Pieces */}
            {ps.map((p) => {
              const removed = isRemoved(state, p)
              return (
                <div
                  key={`${p.start}-${p.end}`}
                  className={cn(
                    'absolute top-[14px] bottom-[12px] flex items-center justify-center overflow-hidden rounded-[5px]',
                    'cursor-pointer border border-white/20 font-mono text-[11px] text-foreground',
                    isSel(p) && 'outline outline-2 outline-offset-[-2px] outline-foreground ring-2 ring-foreground/25',
                  )}
                  style={{
                    left: t2x(p.start),
                    width: Math.max(1, t2x(p.end) - t2x(p.start)),
                    background: removed ? REMOVED_HATCH : sceneFill(p.start, state.itemBounds),
                    borderColor: removed ? 'transparent' : undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (removed) onRestorePiece(p)
                    else onSelectPiece(p)
                  }}
                >
                  {removed && (
                    <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-foreground text-[10px] font-extrabold text-destructive">
                      ×
                    </span>
                  )}
                </div>
              )
            })}

            {/* Item boundary lines (SPACE taps) */}
            {state.itemBounds.map((t) => (
              <div key={`ib-${t}`} className="absolute top-0 bottom-0 z-[3] w-[2px] bg-muted-foreground/70" style={{ left: t2x(t) }} />
            ))}

            {/* User split lines */}
            {state.userSplits.map((t) => (
              <div key={`us-${t}`} className="absolute top-[8px] bottom-[6px] z-[3] w-[2px] bg-foreground" style={{ left: t2x(t) }} />
            ))}

            {/* Trim veils */}
            {state.trimStart > 0 && (
              <div className="absolute top-[14px] bottom-[12px] z-[4] bg-background/75" style={{ left: 0, width: t2x(state.trimStart) }} />
            )}
            {state.trimEnd < duration && (
              <div
                className="absolute top-[14px] bottom-[12px] z-[4] bg-background/75"
                style={{ left: t2x(state.trimEnd), width: t2x(duration) - t2x(state.trimEnd) }}
              />
            )}

            {/* Trim handles */}
            <div
              className="absolute top-[8px] bottom-[6px] z-[7] flex w-[11px] cursor-ew-resize items-center justify-center rounded-[2px] bg-amber-200 text-[10px] font-extrabold text-background"
              style={{ left: t2x(state.trimStart) }}
              onPointerDown={startTrim('L')}
            >
              ⇤
            </div>
            <div
              className="absolute top-[8px] bottom-[6px] z-[7] flex w-[11px] cursor-ew-resize items-center justify-center rounded-[2px] bg-amber-200 text-[10px] font-extrabold text-background"
              style={{ left: t2x(state.trimEnd) - 11 }}
              onPointerDown={startTrim('R')}
            >
              ⇥
            </div>
          </div>

          {/* Playhead (spans ruler + track) */}
          <div
            className="pointer-events-none absolute top-0 z-[6] h-[118px] w-[2px] bg-foreground"
            style={{ left: t2x(Math.min(playhead, duration)) }}
          >
            <div className="absolute -left-[5px] top-0 h-0 w-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-foreground" />
          </div>
        </div>
      </div>
    </div>
  )
}
