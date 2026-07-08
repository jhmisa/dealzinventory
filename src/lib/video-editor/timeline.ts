// Pure, immutable cut-list model for the Review & Trim editor.
// Ported from docs/investigations/recorder-trim-mockup.html (the LOCKED interaction spec).
// One track + a list of removed ranges. keepIntervals() is the export contract.

export interface Range {
  start: number
  end: number
}

export interface TimelineState {
  /** Source duration in seconds. */
  duration: number
  /** Segment boundaries from the recorder's SPACE taps (item starts). Empty for plain uploads. */
  itemBounds: number[]
  /** User-added razor splits. */
  userSplits: number[]
  /** Removed pieces (each aligned to boundaries). */
  removed: Range[]
  /** Trim-in point (dead air at the head). */
  trimStart: number
  /** Trim-out point (dead air at the tail). */
  trimEnd: number
}

const EPS = 0.2

export function makeTimeline(duration: number, itemBounds: number[] = []): TimelineState {
  const bounds = [...new Set(itemBounds.filter((t) => t > 0 && t < duration))].sort((a, b) => a - b)
  return { duration, itemBounds: bounds, userSplits: [], removed: [], trimStart: 0, trimEnd: duration }
}

export function boundaries(s: TimelineState): number[] {
  return [...new Set([0, s.duration, ...s.itemBounds, ...s.userSplits])].sort((a, b) => a - b)
}

export function pieces(s: TimelineState): Range[] {
  const b = boundaries(s)
  const out: Range[] = []
  for (let i = 0; i < b.length - 1; i++) out.push({ start: b[i], end: b[i + 1] })
  return out
}

export function isRemoved(s: TimelineState, p: Range): boolean {
  return s.removed.some((r) => r.start <= p.start + 0.01 && r.end >= p.end - 0.01)
}

export function cutTotal(s: TimelineState): number {
  return s.removed.reduce((a, r) => a + (r.end - r.start), 0)
}

/** The ordered list of source-time ranges to KEEP: [trimStart,trimEnd] minus removed ranges. */
export function keepIntervals(s: TimelineState): Range[] {
  const cuts = s.removed
    .map((r) => ({ start: Math.max(r.start, s.trimStart), end: Math.min(r.end, s.trimEnd) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const keep: Range[] = []
  let cursor = s.trimStart
  for (const c of cuts) {
    if (c.start > cursor) keep.push({ start: cursor, end: c.start })
    cursor = Math.max(cursor, c.end)
  }
  if (cursor < s.trimEnd) keep.push({ start: cursor, end: s.trimEnd })
  return keep
}

export function finalLength(s: TimelineState): number {
  return keepIntervals(s).reduce((a, r) => a + (r.end - r.start), 0)
}

export function addSplit(s: TimelineState, t: number): TimelineState {
  if (t <= 0 || t >= s.duration) return s
  const existing = [...s.userSplits, ...s.itemBounds]
  if (existing.some((x) => Math.abs(x - t) < EPS)) return s
  return { ...s, userSplits: [...s.userSplits, t].sort((a, b) => a - b) }
}

export function removePiece(s: TimelineState, p: Range): TimelineState {
  if (s.removed.some((r) => r.start === p.start && r.end === p.end)) return s
  return { ...s, removed: [...s.removed, { start: p.start, end: p.end }].sort((a, b) => a.start - b.start) }
}

export function restorePiece(s: TimelineState, p: Range): TimelineState {
  return { ...s, removed: s.removed.filter((r) => !(r.start <= p.start + 0.01 && r.end >= p.end - 0.01)) }
}

export function setTrim(s: TimelineState, start: number, end: number): TimelineState {
  const trimStart = Math.min(Math.max(0, start), end - 0.5)
  const trimEnd = Math.max(Math.min(s.duration, end), trimStart + 0.5)
  return { ...s, trimStart, trimEnd }
}
