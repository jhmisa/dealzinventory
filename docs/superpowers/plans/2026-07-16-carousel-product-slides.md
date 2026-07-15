# Carousel From Products (P/B/G/A codes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Content Studio → Create → Build carousel, staff can search products by code or name (P-items, B-backorders, G-sell-groups, A-accessories), pick photos from each product's existing gallery, optionally bake a specs + price overlay into each slide, optionally generate a single "lineup cover" compositing all selected products into one 1080×1080 grid — and save it all as a `content_items` carousel tagged with `item_codes`.

**Architecture:** Reuse the two layers that already exist — `useAvailableInventorySearch` (unified P/A/G/B search with description + effective price + thumbnail) and `getShowcase{Item,SellGroup,Accessory,Backorder}` (unified gallery: `photos[]`, `videos[]`, description, price, discount, grade). A new pure module `product-slide.ts` holds the canvas geometry/text logic (unit-tested) plus the draw functions (same pattern as `review-card.ts`). A new `ProductSlidePicker` dialog does search → gallery → basket → render → upload to the `social-media` bucket, and hands finished slide URLs (+codes) back to `CarouselBuilder`, which now tracks a code per slide and saves `item_codes`.

**Tech Stack:** React + shadcn Dialog, TanStack Query (existing hooks), HTML canvas (crossOrigin `anonymous` — precedent in `video-recorder/recorder.tsx:65`), Supabase Storage `social-media` bucket, node:assert tests run with `npx tsx`.

**Scope notes (decisions locked):**
- **Photos only this phase.** Videos-in-carousel publishing is unverified with Blotato (open question #4 in the Content Studio spec) — the picker shows photo galleries only.
- **Every product slide is baked through canvas** (even overlay = none): guarantees square 1080², public bucket URL, uniform publish pipeline.
- Overlay style is **global per picker session** (None / Specs + price), not per-slide — keep the UI simple.
- Descriptions come from `ShowcaseItem.description` (customer-facing builder, same as /mine — consistent with [[feedback_consistent_descriptions]]; deliberately *without* the staff-only backorder identifier).
- Effective price = `max(0, selling_price − discount)`; original price struck-through when a discount exists.
- Branch: `feat/carousel-product-slides` off `origin/main` (v1.108.0). The dirty `deno.lock` on `feat/ai-ops` gets stashed with a labelled message, NOT carried over.

---

## File Structure

- **Create** `src/lib/content-studio/product-slide.ts` — pure geometry/text (`coverCrop`, `formatYen`, `gridLayout`, `slideInfoFromShowcase`) + canvas draws (`drawProductSlide`, `drawLineupCover`) + `loadImage`.
- **Create** `src/lib/content-studio/product-slide.test.ts` — node:assert tests for the pure parts.
- **Create** `src/components/content-studio/create/product-slide-picker.tsx` — search → gallery → basket → render/upload dialog.
- **Modify** `src/components/content-studio/create/carousel-builder.tsx` — slides become `{url, code}`, "Add from products" button, code chips, `item_codes` on save.
- **Modify** `src/pages/admin/content-studio.tsx:49` — Create-hub card description mentions products.

---

### Task 0: Branch setup

- [x] **Step 1: Stash the ai-ops deno.lock modification and branch off origin/main**

```bash
git stash push deno.lock -m "feat/ai-ops deno.lock (restore when back on that branch)"
git checkout -b feat/carousel-product-slides origin/main
npm install --no-audit --no-fund   # in case main's deps differ from feat/ai-ops
npx tsc --noEmit                   # sanity: clean baseline
```

Expected: new branch at `b9a620d`, tsc clean.

---

### Task 1: Pure slide module (`product-slide.ts` pure parts) — TDD

**Files:**
- Create: `src/lib/content-studio/product-slide.ts`
- Test: `src/lib/content-studio/product-slide.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import assert from 'node:assert/strict'
import { coverCrop, formatYen, gridLayout, slideInfoFromShowcase } from './product-slide'

// coverCrop: landscape image into square cell — crops the sides.
const lc = coverCrop(2000, 1000, 1080, 1080)
assert.equal(lc.sh, 1000)
assert.equal(lc.sw, 1000)
assert.equal(lc.sx, 500)
assert.equal(lc.sy, 0)

// coverCrop: portrait image into square cell — crops top/bottom.
const pc = coverCrop(1000, 2000, 1080, 1080)
assert.equal(pc.sw, 1000)
assert.equal(pc.sh, 1000)
assert.equal(pc.sx, 0)
assert.equal(pc.sy, 500)

// coverCrop: already square → whole image.
assert.deepEqual(coverCrop(800, 800, 1080, 1080), { sx: 0, sy: 0, sw: 800, sh: 800 })

// coverCrop: non-square cell (wide) — source rect matches cell aspect.
const wc = coverCrop(1000, 1000, 1080, 540)
assert.equal(wc.sw, 1000)
assert.equal(wc.sh, 500)
assert.equal(wc.sy, 250)

// formatYen
assert.equal(formatYen(129800), '¥129,800')
assert.equal(formatYen(0), '¥0')

// gridLayout: cell count matches n, all cells within bounds, no overlap.
for (const n of [1, 2, 3, 4, 5, 6, 9]) {
  const cells = gridLayout(n, 1080, 8)
  assert.equal(cells.length, n, `n=${n} count`)
  for (const c of cells) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1080 && c.y + c.h <= 1080, `n=${n} in bounds`)
    assert.ok(c.w > 100 && c.h > 100, `n=${n} cells usable size`)
  }
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j]
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
      assert.ok(!overlap, `n=${n} cells ${i},${j} must not overlap`)
    }
}
// gridLayout caps at 9.
assert.equal(gridLayout(12, 1080, 8).length, 9)
// 1 image fills the whole canvas.
assert.deepEqual(gridLayout(1, 1080, 8)[0], { x: 0, y: 0, w: 1080, h: 1080 })

// slideInfoFromShowcase: effective price + struck original when discounted.
const info = slideInfoFromShowcase({
  item_code: 'B000047', description: 'Apple MacBook Pro M2 16GB 512GB',
  selling_price: 148000, discount: 10000, condition_grade: 'A',
})
assert.equal(info.price, 138000)
assert.equal(info.originalPrice, 148000)
assert.equal(info.code, 'B000047')
assert.equal(info.grade, 'A')

// no discount → no originalPrice; null price stays null.
const plain = slideInfoFromShowcase({ item_code: 'P000001', description: 'x', selling_price: 5000, discount: null, condition_grade: null })
assert.equal(plain.price, 5000)
assert.equal(plain.originalPrice, undefined)
const nul = slideInfoFromShowcase({ item_code: 'P000002', description: 'x', selling_price: null, discount: null, condition_grade: 'B' })
assert.equal(nul.price, null)

console.log('product-slide tests passed')
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx tsx src/lib/content-studio/product-slide.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write the pure implementation** (top half of `product-slide.ts`; canvas half comes in Task 2)

```ts
// Product slide rendering for the carousel builder: bake a product photo (P/B/G/A)
// into a 1080×1080 slide, optionally with a specs + price overlay, plus a multi-
// product "lineup cover" grid. Pure geometry/text here is unit-tested; canvas
// drawing mirrors review-card.ts.

export const PRODUCT_SLIDE_SIZE = 1080

export type SlideOverlay = 'none' | 'specs'

export interface ProductSlideInfo {
  code: string
  description: string
  price: number | null
  originalPrice?: number
  grade: string | null
}

/** Source rect that center-crops an imgW×imgH image to cover a cellW×cellH box. */
export function coverCrop(imgW: number, imgH: number, cellW: number, cellH: number): { sx: number; sy: number; sw: number; sh: number } {
  const cellAspect = cellW / cellH
  const imgAspect = imgW / imgH
  if (imgAspect > cellAspect) {
    const sw = imgH * cellAspect
    return { sx: (imgW - sw) / 2, sy: 0, sw, sh: imgH }
  }
  const sh = imgW / cellAspect
  return { sx: 0, sy: (imgH - sh) / 2, sw: imgW, sh }
}

export function formatYen(n: number): string {
  return `¥${Math.round(n).toLocaleString('en-US')}`
}

/** Uniform grid cells (row-major, last row centered) for up to 9 images on a size×size canvas. */
export function gridLayout(n: number, size: number, gutter = 8): { x: number; y: number; w: number; h: number }[] {
  const count = Math.min(Math.max(n, 1), 9)
  if (count === 1) return [{ x: 0, y: 0, w: size, h: size }]
  const cols = count <= 2 ? 2 : count <= 6 ? (count <= 4 ? 2 : 3) : 3
  const rows = Math.ceil(count / cols)
  const cw = (size - gutter * (cols - 1)) / cols
  const ch = (size - gutter * (rows - 1)) / rows
  const cells: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const inRow = row === rows - 1 ? count - row * cols : cols
    const rowOffset = (size - (inRow * cw + (inRow - 1) * gutter)) / 2
    const col = i - row * cols
    cells.push({ x: rowOffset + col * (cw + gutter), y: row * (ch + gutter), w: cw, h: ch })
  }
  return cells
}

/** Map a ShowcaseItem-shaped record to overlay info (effective price, struck original). */
export function slideInfoFromShowcase(s: {
  item_code: string
  description: string
  selling_price: number | null
  discount: number | null
  condition_grade: string | null
}): ProductSlideInfo {
  const discount = Number(s.discount ?? 0)
  const price = s.selling_price != null ? Math.max(0, s.selling_price - discount) : null
  return {
    code: s.item_code,
    description: s.description,
    price,
    originalPrice: s.selling_price != null && discount > 0 ? s.selling_price : undefined,
    grade: s.condition_grade,
  }
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx tsx src/lib/content-studio/product-slide.test.ts`
Expected: `product-slide tests passed`

- [x] **Step 5: Commit**

```bash
git add src/lib/content-studio/product-slide.ts src/lib/content-studio/product-slide.test.ts
git commit -m "feat(content-studio): pure product-slide geometry (coverCrop/grid/price) + tests"
```

---

### Task 2: Canvas draws (`drawProductSlide`, `drawLineupCover`, `loadImage`)

**Files:**
- Modify: `src/lib/content-studio/product-slide.ts` (append)

- [x] **Step 1: Append the canvas half**

```ts
type Ctx2D = CanvasRenderingContext2D

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // CORS-clean draw — avoids canvas taint (same as recorder.tsx)
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Couldn't load image: ${url}`))
    img.src = url
  })
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawImageCover(ctx: Ctx2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const { sx, sy, sw, sh } = coverCrop(img.naturalWidth, img.naturalHeight, w, h)
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/** One product photo baked to a 1080² slide; overlay 'specs' adds grade chip + description + price band. */
export function drawProductSlide(ctx: Ctx2D, img: HTMLImageElement, info: ProductSlideInfo, overlay: SlideOverlay): void {
  const S = PRODUCT_SLIDE_SIZE
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#16140F'
  ctx.fillRect(0, 0, S, S)
  drawImageCover(ctx, img, 0, 0, S, S)
  if (overlay === 'none') return

  const pad = 56

  // Bottom gradient band.
  const bandTop = S - 380
  const grad = ctx.createLinearGradient(0, bandTop, 0, S)
  grad.addColorStop(0, 'rgba(10,9,6,0)')
  grad.addColorStop(0.45, 'rgba(10,9,6,0.72)')
  grad.addColorStop(1, 'rgba(10,9,6,0.92)')
  ctx.fillStyle = grad
  ctx.fillRect(0, bandTop, S, S - bandTop)

  // Grade chip, top-left.
  if (info.grade) {
    const label = `GRADE ${info.grade}`
    ctx.font = '700 34px Inter, system-ui, sans-serif'
    const w = ctx.measureText(label).width + 44
    ctx.fillStyle = 'rgba(22,20,15,0.85)'
    roundRect(ctx, pad, pad, w, 62, 31)
    ctx.fill()
    ctx.fillStyle = '#F3F1EC'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, pad + 22, pad + 33)
    ctx.textBaseline = 'alphabetic'
  }

  // Wordmark, top-right.
  ctx.font = '800 40px Inter, system-ui, sans-serif'
  const mark = 'dealz.'
  ctx.fillStyle = 'rgba(243,241,236,0.92)'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 12
  ctx.fillText(mark, S - pad - ctx.measureText(mark).width, pad + 40)
  ctx.shadowBlur = 0

  // Description — up to 2 wrapped lines above the price row.
  ctx.fillStyle = '#F3F1EC'
  const descSize = 42
  ctx.font = `600 ${descSize}px Inter, system-ui, sans-serif`
  const lines = wrapSlideText(info.description, 42, 2)
  let y = S - pad - 96 - (lines.length - 1) * (descSize * 1.3)
  for (const line of lines) {
    ctx.fillText(line, pad, y)
    y += descSize * 1.3
  }

  // Price row: big effective price, struck original, code right-aligned.
  const baseline = S - pad
  if (info.price != null) {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 76px Inter, system-ui, sans-serif'
    const priceStr = formatYen(info.price)
    ctx.fillText(priceStr, pad, baseline)
    if (info.originalPrice != null) {
      const px = pad + ctx.measureText(priceStr).width + 28
      ctx.font = '600 44px Inter, system-ui, sans-serif'
      ctx.fillStyle = 'rgba(243,241,236,0.65)'
      const orig = formatYen(info.originalPrice)
      ctx.fillText(orig, px, baseline - 6)
      const ow = ctx.measureText(orig).width
      ctx.strokeStyle = 'rgba(243,241,236,0.65)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(px - 2, baseline - 20)
      ctx.lineTo(px + ow + 2, baseline - 20)
      ctx.stroke()
    }
  }
  ctx.font = '500 34px "JetBrains Mono", ui-monospace, monospace'
  ctx.fillStyle = 'rgba(243,241,236,0.7)'
  const code = info.code
  ctx.fillText(code, S - pad - ctx.measureText(code).width, baseline)
}

/** Multi-product lineup cover: grid of photos, price pill per cell, wordmark. */
export function drawLineupCover(ctx: Ctx2D, entries: { img: HTMLImageElement; info: ProductSlideInfo }[]): void {
  const S = PRODUCT_SLIDE_SIZE
  ctx.clearRect(0, 0, S, S)
  ctx.fillStyle = '#16140F'
  ctx.fillRect(0, 0, S, S)
  const cells = gridLayout(entries.length, S, 10)
  cells.forEach((cell, i) => {
    const { img, info } = entries[i]
    drawImageCover(ctx, img, cell.x, cell.y, cell.w, cell.h)
    if (info.price != null) {
      const label = formatYen(info.price)
      ctx.font = '700 34px Inter, system-ui, sans-serif'
      const w = ctx.measureText(label).width + 36
      const px = cell.x + 16
      const py = cell.y + cell.h - 16 - 56
      ctx.fillStyle = 'rgba(22,20,15,0.85)'
      roundRect(ctx, px, py, w, 56, 28)
      ctx.fill()
      ctx.fillStyle = '#F3F1EC'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, px + 18, py + 30)
      ctx.textBaseline = 'alphabetic'
    }
  })
  ctx.font = '800 44px Inter, system-ui, sans-serif'
  const mark = 'dealz.'
  ctx.fillStyle = 'rgba(243,241,236,0.95)'
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 14
  ctx.fillText(mark, S - 40 - ctx.measureText(mark).width, S - 40)
  ctx.shadowBlur = 0
}
```

Also add near the pure section (and test it in Task 1's file if not already): `wrapSlideText` — re-export of `wrapText` from `review-card.ts` to avoid duplication:

```ts
import { wrapText } from './review-card'
/** Word-wrap shared with review cards (ellipsis on overflow). */
const wrapSlideText = wrapText
```

(Import goes at the top of the file.)

- [x] **Step 2: tsc + tests still green**

Run: `npx tsc --noEmit && npx tsx src/lib/content-studio/product-slide.test.ts`
Expected: clean + `product-slide tests passed`

- [x] **Step 3: Commit**

```bash
git add src/lib/content-studio/product-slide.ts
git commit -m "feat(content-studio): product-slide + lineup-cover canvas renderers"
```

---

### Task 3: `ProductSlidePicker` component

**Files:**
- Create: `src/components/content-studio/create/product-slide-picker.tsx`

Behaviour: search (debounced, `useAvailableInventorySearch`) → click result → gallery from `getShowcase*` by code prefix (`A`→accessory, `G`→sell group, `B`→backorder, else item — same dispatch as `src/pages/admin/showcase.tsx:51`) → click photos to toggle into a cross-product **basket** → overlay toggle (None / Specs + price) + live canvas preview of the last basket entry → optional "lineup cover" checkbox (enabled at ≥2 distinct products) → **Add**: renders each basket photo through an offscreen canvas → webp → upload `carousels/{uuid}.webp` to `social-media` → `onAdd(slides)` where `slides: { url: string; code: string }[]` (cover first when generated, `code` of the cover = first product's code).

- [x] **Step 1: Write the component**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/hooks/use-debounce'
import { useAvailableInventorySearch } from '@/hooks/use-items'
import type { AvailableInventoryResult } from '@/services/items'
import { getShowcaseItem, getShowcaseSellGroup, getShowcaseAccessory, getShowcaseBackorder, type ShowcaseItem } from '@/services/showcase'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, formatPrice } from '@/lib/utils'
import {
  PRODUCT_SLIDE_SIZE, type SlideOverlay, type ProductSlideInfo,
  slideInfoFromShowcase, loadImage, drawProductSlide, drawLineupCover,
} from '@/lib/content-studio/product-slide'

interface BasketEntry {
  photoUrl: string
  info: ProductSlideInfo
}

interface ProductSlidePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (slides: { url: string; code: string }[]) => void
}

function showcaseFetcher(code: string) {
  const upper = code.toUpperCase()
  return upper.startsWith('A') ? getShowcaseAccessory
    : upper.startsWith('G') ? getShowcaseSellGroup
    : upper.startsWith('B') ? getShowcaseBackorder
    : getShowcaseItem
}

export function ProductSlidePicker({ open, onOpenChange, onAdd }: ProductSlidePickerProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 300)
  const { data: results = [], isFetching } = useAvailableInventorySearch(debounced)

  const [selected, setSelected] = useState<AvailableInventoryResult | null>(null)
  const [showcase, setShowcase] = useState<ShowcaseItem | null>(null)
  const [loadingGallery, setLoadingGallery] = useState(false)
  const [basket, setBasket] = useState<BasketEntry[]>([])
  const [overlay, setOverlay] = useState<SlideOverlay>('specs')
  const [withCover, setWithCover] = useState(false)
  const [adding, setAdding] = useState(false)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const distinctCodes = useMemo(() => [...new Set(basket.map((b) => b.info.code))], [basket])

  async function pick(r: AvailableInventoryResult) {
    setSelected(r)
    setShowcase(null)
    setLoadingGallery(true)
    try {
      const sc = await showcaseFetcher(r.code)(r.code)
      setShowcase(sc)
      if (!sc) toast.error(`Couldn't load ${r.code}`)
    } catch (e) {
      toast.error(`Couldn't load ${r.code}: ${(e as Error).message}`)
    } finally {
      setLoadingGallery(false)
    }
  }

  function togglePhoto(url: string) {
    if (!showcase) return
    setBasket((prev) => {
      const exists = prev.find((b) => b.photoUrl === url)
      if (exists) return prev.filter((b) => b.photoUrl !== url)
      return [...prev, { photoUrl: url, info: slideInfoFromShowcase(showcase) }]
    })
  }

  // Live preview: last basket entry with the current overlay.
  useEffect(() => {
    const canvas = previewRef.current
    const ctx = canvas?.getContext('2d')
    const last = basket[basket.length - 1]
    if (!canvas || !ctx) return
    if (!last) {
      ctx.fillStyle = '#16140F'
      ctx.fillRect(0, 0, PRODUCT_SLIDE_SIZE, PRODUCT_SLIDE_SIZE)
      return
    }
    let cancelled = false
    loadImage(last.photoUrl)
      .then((img) => { if (!cancelled) drawProductSlide(ctx, img, last.info, overlay) })
      .catch(() => { /* preview only */ })
    return () => { cancelled = true }
  }, [basket, overlay])

  async function renderAndUpload(draw: (ctx: CanvasRenderingContext2D) => void): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = PRODUCT_SLIDE_SIZE
    canvas.height = PRODUCT_SLIDE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    draw(ctx)
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/webp', 0.9),
    )
    const path = `carousels/${crypto.randomUUID()}.webp`
    const up = await supabase.storage.from('social-media').upload(path, blob, { contentType: 'image/webp' })
    if (up.error) throw up.error
    return supabase.storage.from('social-media').getPublicUrl(path).data.publicUrl
  }

  async function addSlides() {
    if (!basket.length) return
    setAdding(true)
    try {
      const slides: { url: string; code: string }[] = []
      if (withCover && distinctCodes.length >= 2) {
        // First photo of each distinct product, in basket order.
        const firsts = distinctCodes
          .map((code) => basket.find((b) => b.info.code === code))
          .filter(Boolean) as BasketEntry[]
        const entries = await Promise.all(
          firsts.map(async (b) => ({ img: await loadImage(b.photoUrl), info: b.info })),
        )
        slides.push({ url: await renderAndUpload((ctx) => drawLineupCover(ctx, entries)), code: firsts[0].info.code })
      }
      for (const b of basket) {
        const img = await loadImage(b.photoUrl)
        slides.push({ url: await renderAndUpload((ctx) => drawProductSlide(ctx, img, b.info, overlay)), code: b.info.code })
      }
      onAdd(slides)
      setBasket([]); setWithCover(false); setSelected(null); setShowcase(null); setQuery('')
      onOpenChange(false)
    } catch (e) {
      toast.error(`Couldn't add slides: ${(e as Error).message}`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Add slides from products</DialogTitle>
          <DialogDescription>
            Search inventory (P / B / G / A codes or name), pick photos from each product, and they're baked into
            1080×1080 slides — optionally with the specs and price on the image.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="MacBook, iPhone 13, B000047…" className="pl-8" />
              {isFetching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            {/* Results */}
            {query.trim().length >= 2 && !selected && (
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
                {results.length === 0 && !isFetching && (
                  <p className="p-3 text-sm text-muted-foreground">No available products match.</p>
                )}
                {results.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => pick(r)}
                    className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-accent"
                  >
                    {r.thumbnail_url
                      ? <img src={r.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover" />
                      : <div className="h-10 w-10 rounded bg-muted" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{r.description}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.code}{r.grade ? ` · ${r.grade}` : ''}</p>
                    </div>
                    {r.price != null && <span className="text-sm font-semibold">{formatPrice(r.price)}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Gallery of the selected product */}
            {selected && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selected.description}</p>
                    <p className="font-mono text-xs text-muted-foreground">{selected.code}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setShowcase(null) }}>
                    ← Back to results
                  </Button>
                </div>
                {loadingGallery ? (
                  <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : showcase && showcase.photos.length > 0 ? (
                  <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto">
                    {showcase.photos.map((p) => {
                      const inBasket = basket.some((b) => b.photoUrl === p.url)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePhoto(p.url)}
                          className={cn(
                            'relative overflow-hidden rounded-md border-2',
                            inBasket ? 'border-primary' : 'border-transparent hover:border-border',
                          )}
                        >
                          <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                          {inBasket && (
                            <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[10px] font-bold text-primary-foreground">✓</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No photos on this product.</p>
                )}
              </div>
            )}
          </div>

          {/* Right rail: overlay, preview, basket */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Overlay</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {([['none', 'None'], ['specs', 'Specs + price']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOverlay(v)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium',
                      overlay === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <canvas ref={previewRef} width={PRODUCT_SLIDE_SIZE} height={PRODUCT_SLIDE_SIZE} className="block h-auto w-full" />
            </div>

            <div className="space-y-1.5">
              <Label>Selected photos ({basket.length}{distinctCodes.length > 1 ? ` · ${distinctCodes.length} products` : ''})</Label>
              {basket.length === 0 ? (
                <p className="text-xs text-muted-foreground">Pick photos on the left — you can add several products.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {basket.map((b) => (
                    <span key={b.photoUrl} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]">
                      <img src={b.photoUrl} alt="" className="h-5 w-5 rounded-sm object-cover" />
                      {b.info.code}
                      <button type="button" onClick={() => togglePhoto(b.photoUrl)}><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <label className={cn('flex items-start gap-2 text-xs', distinctCodes.length < 2 && 'opacity-50')}>
              <Checkbox checked={withCover} onCheckedChange={(c) => setWithCover(c === true)} disabled={distinctCodes.length < 2} />
              <span>Also generate a <strong>lineup cover</strong> — all {distinctCodes.length >= 2 ? distinctCodes.length : ''} products in one grid image, added as the first slide.</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={addSlides} disabled={adding || basket.length === 0}>
            {adding ? (<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Rendering…</>) : `Add ${basket.length + (withCover && distinctCodes.length >= 2 ? 1 : 0)} slide${basket.length + (withCover && distinctCodes.length >= 2 ? 1 : 0) === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

Note: verify `formatPrice` exists in `src/lib/utils.ts` (CLAUDE.md lists it); if its signature differs, use `formatYen` from the slide module instead. Verify `useDebounce` export shape in `src/hooks/use-debounce.ts` and adapt the call.

- [x] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/components/content-studio/create/product-slide-picker.tsx
git commit -m "feat(content-studio): product slide picker — search P/B/G/A, pick gallery photos, bake overlay slides"
```

---

### Task 4: Wire into `CarouselBuilder` (+ Create-hub copy)

**Files:**
- Modify: `src/components/content-studio/create/carousel-builder.tsx`
- Modify: `src/pages/admin/content-studio.tsx:49`

- [x] **Step 1: Slides carry a code; add the picker entry point**

In `carousel-builder.tsx`:

1. Replace `const [slides, setSlides] = useState<string[]>([])` with:

```tsx
interface Slide { url: string; code: string | null }
// inside component:
const [slides, setSlides] = useState<Slide[]>([])
const [pickerOpen, setPickerOpen] = useState(false)
```

2. `addImages` pushes `{ url: pub.publicUrl, code: null }`.

3. `save()` gains `item_codes`:

```tsx
const codes = [...new Set(slides.map((s) => s.code).filter((c): c is string => !!c))]
await createItem.mutateAsync({
  kind: 'carousel',
  title: title.trim(),
  media_urls: slides.map((s) => s.url),
  item_codes: codes.length ? codes : null,
  category_id: categoryId || null,
  orientation: 'square',
  source: 'carousel',
})
```

4. Header controls — add the products button next to "Add images":

```tsx
<div className="flex items-center gap-1.5">
  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setPickerOpen(true)}>
    <PackageSearch className="h-3.5 w-3.5" /> Add from products
  </Button>
  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs">
    {/* existing Add images label unchanged */}
  </label>
</div>
```

(`import { PackageSearch } from 'lucide-react'` — add to the existing lucide import.)

5. Slide tiles — keyed by `slide.url`, render `<img src={slide.url} …>`, and a code chip when present:

```tsx
{slide.code && (
  <span className="absolute right-1 top-1 rounded bg-black/60 px-1 font-mono text-[9px] text-white">{slide.code}</span>
)}
```

(Cover badge stays; when both show on slide 0, cover is left, code is right.)

6. Mount the picker before `</Dialog>`'s closing content:

```tsx
<ProductSlidePicker
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  onAdd={(added) => setSlides((prev) => [...prev, ...added])}
/>
```

with `import { ProductSlidePicker } from './product-slide-picker'`.

7. Empty state copy: `Add images or pick product photos to build the carousel.`

In `content-studio.tsx` the carousel card description (line ~50) becomes:
`'Ordered slides for a multi-image post — from uploads or product photos with specs + price baked in.'`

- [x] **Step 2: tsc + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [x] **Step 3: Commit**

```bash
git add src/components/content-studio/create/carousel-builder.tsx src/pages/admin/content-studio.tsx
git commit -m "feat(content-studio): carousel builder — add-from-products flow, item_codes, code chips"
```

---

### Task 5: E2E verify in real Chromium, cleanup, ship

- [x] **Step 1: Run dev server + Playwright pass** (dev staff login per [[reference_dev_staff_login]], creds in `.env.local`)

Flow: `/admin/content-studio?tab=create` → Build carousel → **Add from products** → search a real term (`iPhone`) → pick product → select 2 photos → switch overlay Specs + price → preview shows price band → search a second product → pick 1 photo → tick **lineup cover** → Add 4 slides → slides appear with code chips (cover first) → title `E2E test — delete me` → Save → Library tab shows the carousel card. Screenshot each key state.

Expected: no console errors; `content_items` row has `kind='carousel'`, 4 `media_urls`, `item_codes` with both codes.

- [x] **Step 2: Clean up test data**

Delete the test `content_items` row and the uploaded `carousels/*.webp` objects created during the test (SQL via available CLI path + `supabase storage`/REST as available; verify gone).

- [x] **Step 3: Version bump + PROJECT_STATE**

`package.json` → `1.109.0`. PROJECT_STATE "Now": carousel-from-products shipped on `feat/carousel-product-slides` (branch off main, NOT merged — Joey to review); note videos-in-carousel deferred pending Blotato verification.

- [x] **Step 4: Commit + push branch**

```bash
git add package.json docs/PROJECT_STATE.md docs/superpowers/plans/2026-07-16-carousel-product-slides.md
git commit -m "chore(release): v1.109.0 — carousel from products (P/B/G/A slides + lineup cover)"
git push -u origin feat/carousel-product-slides
```

---

## Self-Review

- **Spec coverage:** select product ✓ (Task 3 search), choose image/s ✓ (gallery multi-select), multiple products → carousel ✓ (basket across products), 5-computers-1-image-each ✓ (per-product slides + optional lineup cover in one image), specs + price overlay ✓ (Task 2 `drawProductSlide`), posted ✓ (saves as `content_items` carousel → existing publish pipeline). Videos: explicitly deferred (documented).
- **Placeholder scan:** none — all steps carry real code/commands.
- **Type consistency:** `ProductSlideInfo`/`SlideOverlay` defined Task 1/2, consumed Task 3; `onAdd(slides: {url, code}[])` matches Task 4's `setSlides` merge; `Slide.code: string | null` vs picker's `code: string` — compatible (widening).
