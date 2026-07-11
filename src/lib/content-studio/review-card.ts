// Review-card rendering: a pure text-wrap/layout core (unit-tested) + a canvas draw fn.
// Produces a 1080×1080 branded quote card from a customer review.

export type ReviewCardStyle = 'forest' | 'ink' | 'paper'

export interface ReviewCardPalette {
  bg: string
  fg: string
  accent: string
  sub: string
}

export const REVIEW_CARD_STYLES: Record<ReviewCardStyle, ReviewCardPalette> = {
  forest: { bg: '#14352A', fg: '#F3F1EC', accent: '#7FC8A9', sub: '#B9C9BF' },
  ink: { bg: '#16140F', fg: '#F3F1EC', accent: '#C8A96A', sub: '#A9A392' },
  paper: { bg: '#F3F1EC', fg: '#16140F', accent: '#4A463E', sub: '#7A7565' },
}

export const REVIEW_CARD_SIZE = 1080

/** Greedy word-wrap by character budget; the last line gets an ellipsis if text overflows maxLines. */
export function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxCharsPerLine) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
      if (lines.length === maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)

  // Did we consume every word? If not, mark overflow with an ellipsis on the last line.
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1]
    while (last.length > 1 && (last + '…').length > maxCharsPerLine) last = last.slice(0, -1).trimEnd()
    lines[lines.length - 1] = last + '…'
  }
  return lines
}

/** e.g. rating 4 → "★★★★☆" (5 slots). Clamped to 0–5. */
export function starString(rating: number | null | undefined): string {
  const n = Math.max(0, Math.min(5, Math.round(rating ?? 0)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Draw the 1080×1080 review card. Canvas side-effect — verified visually, not unit-tested. */
export function drawReviewCard(
  ctx: Ctx2D,
  opts: { name: string; quote: string; rating: number | null; style: ReviewCardStyle },
): void {
  const S = REVIEW_CARD_SIZE
  const pal = REVIEW_CARD_STYLES[opts.style] ?? REVIEW_CARD_STYLES.forest
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, S, S)

  const pad = 96

  // Big opening quote mark.
  ctx.fillStyle = pal.accent
  ctx.font = '700 220px Georgia, "Times New Roman", serif'
  ctx.textBaseline = 'top'
  ctx.fillText('“', pad - 12, pad - 40)

  // Stars.
  ctx.fillStyle = pal.accent
  ctx.font = '400 56px Georgia, serif'
  ctx.fillText(starString(opts.rating), pad, pad + 210)

  // Quote body — wrapped.
  ctx.fillStyle = pal.fg
  const quoteSize = 60
  ctx.font = `600 ${quoteSize}px Georgia, "Times New Roman", serif`
  const maxChars = 30
  const lines = wrapText(opts.quote, maxChars, 7)
  let y = pad + 300
  const lineH = quoteSize * 1.32
  for (const line of lines) {
    ctx.fillText(line, pad, y)
    y += lineH
  }

  // Attribution.
  ctx.fillStyle = pal.sub
  ctx.font = '600 40px Georgia, serif'
  ctx.fillText(`— ${opts.name}`, pad, y + 30)

  // Dealz wordmark bottom-right.
  ctx.fillStyle = pal.accent
  ctx.font = '800 44px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'bottom'
  const mark = 'dealz.'
  const mw = ctx.measureText(mark).width
  ctx.fillText(mark, S - pad - mw, S - pad)
  ctx.textBaseline = 'alphabetic'
}
