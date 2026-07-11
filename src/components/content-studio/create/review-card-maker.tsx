import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { CustomerReview } from '@/lib/types'
import { useCustomerReviews, useCreateCustomerReview, useUpdateCustomerReview } from '@/hooks/use-customer-reviews'
import { useContentCategories } from '@/hooks/use-content-categories'
import { useCreateContentItem } from '@/hooks/use-content-items'
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
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { drawReviewCard, REVIEW_CARD_SIZE, type ReviewCardStyle } from '@/lib/content-studio/review-card'

const STYLES: { value: ReviewCardStyle; label: string }[] = [
  { value: 'forest', label: 'Forest' },
  { value: 'ink', label: 'Ink' },
  { value: 'paper', label: 'Paper' },
]

/** Parse CSV rows "name,quote,rating" (quote may be quoted). Returns best-effort records. */
export function parseReviewCsv(text: string): { name: string; quote: string; rating: number | null }[] {
  const out: { name: string; quote: string; rating: number | null }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // name,"quote with, commas",rating   — split on the first comma and the last comma.
    const first = line.indexOf(',')
    const last = line.lastIndexOf(',')
    if (first === -1) continue
    const name = line.slice(0, first).trim().replace(/^"|"$/g, '')
    let quote = line.slice(first + 1, last > first ? last : undefined).trim().replace(/^"|"$/g, '')
    const ratingStr = last > first ? line.slice(last + 1).trim() : ''
    if (/^name$/i.test(name)) continue // header row
    if (!quote) quote = name
    const rating = ratingStr ? Math.max(1, Math.min(5, Number(ratingStr) || 0)) || null : null
    out.push({ name, quote, rating })
  }
  return out
}

interface ReviewCardMakerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReviewCardMaker({ open, onOpenChange }: ReviewCardMakerProps) {
  const { data: reviews = [] } = useCustomerReviews()
  const { data: categories = [] } = useContentCategories()
  const createReview = useCreateCustomerReview()
  const updateReview = useUpdateCustomerReview()
  const createItem = useCreateContentItem()

  const [reviewId, setReviewId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [quote, setQuote] = useState('')
  const [rating, setRating] = useState(5)
  const [style, setStyle] = useState<ReviewCardStyle>('forest')
  const [busy, setBusy] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const reviewsCategory = categories.find((c) => c.slug === 'reviews') ?? null

  // Live preview redraw.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    drawReviewCard(ctx, { name: name || 'Customer', quote: quote || 'Their kind words appear here…', rating, style })
  }, [name, quote, rating, style, open])

  function pickReview(r: CustomerReview) {
    setReviewId(r.id)
    setName(r.customer_name)
    setQuote(r.customer_quote)
    setRating(r.rating ?? 5)
  }

  async function saveAsReview(from: 'manual' | 'paste') {
    if (!name.trim() || !quote.trim()) {
      toast.error('Add a name and a quote first.')
      return
    }
    const r = await createReview.mutateAsync({ customer_name: name.trim(), customer_quote: quote.trim(), rating, imported_from: from })
    setReviewId(r.id)
    toast.success('Review saved')
  }

  async function importCsv(file: File | null | undefined) {
    if (!file) return
    const text = await file.text()
    const rows = parseReviewCsv(text)
    if (!rows.length) {
      toast.error('No reviews found in that CSV.')
      return
    }
    let ok = 0
    for (const row of rows) {
      try {
        await createReview.mutateAsync({ customer_name: row.name, customer_quote: row.quote, rating: row.rating, imported_from: 'csv' })
        ok++
      } catch {
        /* skip bad row */
      }
    }
    toast.success(`Imported ${ok} review${ok === 1 ? '' : 's'}`)
  }

  async function generate() {
    if (!name.trim() || !quote.trim()) {
      toast.error('Add a name and a quote first.')
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    setBusy(true)
    try {
      const blob: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/webp', 0.9),
      )
      const path = `review-cards/${crypto.randomUUID()}.webp`
      const up = await supabase.storage.from('social-media').upload(path, blob, { contentType: 'image/webp' })
      if (up.error) throw up.error
      const { data: pub } = supabase.storage.from('social-media').getPublicUrl(path)
      const item = await createItem.mutateAsync({
        kind: 'review_card',
        title: `Review · ${name.trim()}`,
        media_urls: [pub.publicUrl],
        category_id: reviewsCategory?.id ?? null,
        orientation: 'square',
        source: 'review',
      })
      if (reviewId) {
        await updateReview.mutateAsync({ id: reviewId, updates: { review_card_content_item_id: item.id } })
      }
      toast.success('Review card added to your Library')
      onOpenChange(false)
    } catch (e) {
      toast.error(`Couldn't generate: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle>Make a review card</DialogTitle>
          <DialogDescription>
            Turn a customer review into a branded 1080×1080 card in your Library. Import reviews manually, by paste, or CSV —
            Facebook blocks live ratings scraping.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Source + fields */}
          <div className="space-y-3">
            {reviews.length > 0 && (
              <div className="space-y-1.5">
                <Label>Pick a saved review</Label>
                <Select value={reviewId ?? undefined} onValueChange={(id) => {
                  const r = reviews.find((x) => x.id === id)
                  if (r) pickReview(r)
                }}>
                  <SelectTrigger><SelectValue placeholder={`${reviews.length} saved reviews`} /></SelectTrigger>
                  <SelectContent>
                    {reviews.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.customer_name} — {r.customer_quote.slice(0, 30)}…</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Reviewer name</Label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setReviewId(null) }} placeholder="Ana R." />
            </div>
            <div className="space-y-1.5">
              <Label>Quote</Label>
              <Textarea value={quote} onChange={(e) => { setQuote(e.target.value); setReviewId(null) }} rows={3} placeholder="Super smooth transaction, phone was exactly as described!" />
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label>Rating</Label>
                <Select value={String(rating)} onValueChange={(v) => setRating(Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((n) => <SelectItem key={n} value={String(n)}>{n} ★</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => saveAsReview('manual')} disabled={createReview.isPending}>
                Save review
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-sm">
                <Upload className="h-3.5 w-3.5" /> CSV
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          {/* Style + preview */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Style</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStyle(s.value)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium',
                      style === s.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <canvas ref={canvasRef} width={REVIEW_CARD_SIZE} height={REVIEW_CARD_SIZE} className="block h-auto w-full" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate card'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
