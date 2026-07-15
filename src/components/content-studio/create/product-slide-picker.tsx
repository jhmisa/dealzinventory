import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/hooks/use-debounce'
import { useAvailableInventorySearch } from '@/hooks/use-items'
import type { AvailableInventoryResult } from '@/services/items'
import { getShowcaseItem, getShowcaseSellGroup, getShowcaseAccessory, getShowcaseBackorder, type ShowcaseItem } from '@/services/showcase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, formatPrice } from '@/lib/utils'
import {
  PRODUCT_SLIDE_SIZE,
  type SlideOverlay,
  type ProductSlideInfo,
  slideInfoFromShowcase,
  loadImage,
  drawProductSlide,
  drawLineupCover,
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
  const addCount = basket.length + (withCover && distinctCodes.length >= 2 ? 1 : 0)

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

  function removeFromBasket(url: string) {
    setBasket((prev) => prev.filter((b) => b.photoUrl !== url))
  }

  // Live preview: last basket entry with the current overlay.
  useEffect(() => {
    const canvas = previewRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const last = basket[basket.length - 1]
    if (!last) {
      ctx.fillStyle = '#16140F'
      ctx.fillRect(0, 0, PRODUCT_SLIDE_SIZE, PRODUCT_SLIDE_SIZE)
      return
    }
    let cancelled = false
    loadImage(last.photoUrl)
      .then((img) => {
        if (!cancelled) drawProductSlide(ctx, img, last.info, overlay)
      })
      .catch(() => { /* preview only */ })
    return () => {
      cancelled = true
    }
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
      setBasket([])
      setWithCover(false)
      setSelected(null)
      setShowcase(null)
      setQuery('')
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

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="MacBook, iPhone 13, B000047…"
                className="pl-8"
              />
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
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selected.description}</p>
                    <p className="font-mono text-xs text-muted-foreground">{selected.code}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setShowcase(null) }}>
                    ← Back to results
                  </Button>
                </div>
                {loadingGallery ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
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
              <canvas
                ref={previewRef}
                width={PRODUCT_SLIDE_SIZE}
                height={PRODUCT_SLIDE_SIZE}
                className="block h-auto w-full"
              />
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
                      <button type="button" onClick={() => removeFromBasket(b.photoUrl)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <label className={cn('flex items-start gap-2 text-xs', distinctCodes.length < 2 && 'opacity-50')}>
              <Checkbox
                checked={withCover}
                onCheckedChange={(c) => setWithCover(c === true)}
                disabled={distinctCodes.length < 2}
              />
              <span>
                Also generate a <strong>lineup cover</strong> — all{' '}
                {distinctCodes.length >= 2 ? distinctCodes.length : ''} products in one grid image, added as the first slide.
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={addSlides} disabled={adding || basket.length === 0}>
            {adding
              ? (<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Rendering…</>)
              : `Add ${addCount} slide${addCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
