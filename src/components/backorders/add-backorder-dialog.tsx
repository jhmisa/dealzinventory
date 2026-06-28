import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ProductPicker } from '@/components/intake/product-picker'
import { useProductModelsWithHeroImage } from '@/hooks/use-product-models'
import { useSuppliers } from '@/hooks/use-suppliers'
import {
  fetchSupplierProduct,
  searchProductImages,
  createBackorderLine,
  saveBackorderPhotos,
} from '@/services/backorders'
import { backorderSchema, type BackorderFormValues } from '@/validators/backorder'
import { cn } from '@/lib/utils'

const GRADES = ['S', 'A', 'B', 'C', 'D', 'J'] as const

interface AddBackorderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// iosys (and similar) galleries often list size-variants of the SAME image,
// e.g. `.../384323_1_L.jpg` and `.../384323_1_S.jpg`. We group candidates by the
// trailing `_<index>_<size>.jpg`, keep the `_L` (large) variant per index, and
// fall back to whatever exists. Non-matching URLs pass through untouched.
function dedupeSupplierImages(urls: string[]): string[] {
  const SIZE_RANK: Record<string, number> = { L: 3, M: 2, S: 1 }
  const byIndex = new Map<string, { url: string; rank: number }>()
  const passthrough: string[] = []

  for (const url of urls) {
    const match = url.match(/_(\d+)_([LMS])\.jpe?g(?:\?.*)?$/i)
    if (!match) {
      if (!passthrough.includes(url)) passthrough.push(url)
      continue
    }
    const index = match[1]
    const size = match[2].toUpperCase()
    const rank = SIZE_RANK[size] ?? 0
    const existing = byIndex.get(index)
    if (!existing || rank > existing.rank) {
      byIndex.set(index, { url, rank })
    }
  }

  const grouped = [...byIndex.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, v]) => v.url)

  return [...grouped, ...passthrough]
}

const defaultValues: BackorderFormValues = {
  product_id: '',
  supplier_id: '',
  condition_grade: 'A',
  selling_price: 0,
  color: '',
  color_ja: '',
  storage_gb: undefined,
  ram_gb: undefined,
  cpu: '',
  screen_size: undefined,
  supplier_price: undefined,
  markup_jpy: 4000,
  supplier_url: '',
  supplier_product_code: '',
  supplier_stock: undefined,
  quantity_total: 1,
  lead_time_min_days: 4,
  lead_time_days: 7,
}

export function AddBackorderDialog({ open, onOpenChange }: AddBackorderDialogProps) {
  const queryClient = useQueryClient()
  const { data: products } = useProductModelsWithHeroImage()
  const { data: suppliers } = useSuppliers()

  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsedHint, setParsedHint] = useState('')

  // Photo curation. Candidates are seeded from the fetched listing (after the
  // dedupe-by-index/prefer-_L normalization). `kept` tracks which survive.
  const [photos, setPhotos] = useState<string[]>([])
  const [kept, setKept] = useState<Set<string>>(new Set())

  // Web image search availability. Probed lazily; `false` disables the button.
  const [imageSearchConfigured, setImageSearchConfigured] = useState<boolean | null>(null)
  const [searching, setSearching] = useState(false)

  const form = useForm<BackorderFormValues>({
    resolver: zodResolver(backorderSchema),
    defaultValues,
  })

  const supplierList = suppliers ?? []
  const productList = products ?? []

  // Keep selling price = supplier price + markup as either changes. Selling remains directly
  // editable; a manual edit holds until supplier price or markup changes again.
  const watchedSupplierPrice = form.watch('supplier_price')
  const watchedMarkup = form.watch('markup_jpy')
  useEffect(() => {
    const sp = Number(watchedSupplierPrice)
    if (Number.isNaN(sp)) return
    const mk = Number(watchedMarkup)
    form.setValue('selling_price', sp + (Number.isNaN(mk) ? 0 : mk), {
      shouldValidate: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSupplierPrice, watchedMarkup])

  function resetAll() {
    form.reset(defaultValues)
    setUrl('')
    setParsedHint('')
    setPhotos([])
    setKept(new Set())
    setFetching(false)
    setSaving(false)
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetAll()
    onOpenChange(next)
  }

  async function handleFetch() {
    if (!url.trim()) {
      toast.error('Paste a supplier product URL first')
      return
    }
    setFetching(true)
    try {
      const product = await fetchSupplierProduct(url.trim())
      if (!product) {
        toast.error('No product returned for that URL')
        return
      }

      // Prefill the RHF fields from NormalizedSupplierProduct. color is canonical English
      // (inventory + customer-facing); color_ja keeps the Japanese token for the Kaitori side.
      form.setValue('color', product.color ?? '')
      form.setValue('color_ja', product.colorJa ?? '')
      form.setValue('storage_gb', product.storageGb ?? undefined)
      form.setValue('ram_gb', product.ramGb ?? undefined)
      if (product.conditionGrade) {
        form.setValue('condition_grade', product.conditionGrade)
      }
      form.setValue('supplier_price', product.supplierPrice ?? undefined)
      form.setValue('supplier_stock', product.stock ?? undefined)
      form.setValue('supplier_product_code', product.supplierProductCode ?? '')
      form.setValue('supplier_url', url.trim())

      // Selling price = supplier cost + markup (staff can still edit either). Recompute on
      // fetch so a freshly pasted listing immediately shows supplier + ¥markup.
      if (product.supplierPrice != null) {
        const markup = Number(form.getValues('markup_jpy')) || 0
        form.setValue('selling_price', product.supplierPrice + markup)
      }

      // Hint for model selection (brand + model text).
      const hint = [product.brandText, product.modelText].filter(Boolean).join(' ').trim()
      setParsedHint(hint)

      // Auto-match the iosys SOURCING supplier. Prefer the reference-only listing
      // (e.g. "Iosys Tsushin Haiban-ka (Online)") since backorders are sourced from it,
      // falling back to any iosys supplier.
      const iosys = supplierList.filter((s) =>
        s.supplier_name?.toLowerCase().includes('iosys'),
      )
      const matchSupplier = iosys.find((s) => s.is_reference_only) ?? iosys[0]
      if (matchSupplier && !form.getValues('supplier_id')) {
        form.setValue('supplier_id', matchSupplier.id)
      }

      // Seed photos after dedupe; everything starts kept.
      const seeded = dedupeSupplierImages(
        Array.isArray(product.imageUrls) ? product.imageUrls : [],
      )
      setPhotos(seeded)
      setKept(new Set(seeded))

      toast.success('Fetched supplier product')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to fetch supplier product',
      )
    } finally {
      setFetching(false)
    }
  }

  // Probe image-search availability once when the dialog opens.
  useEffect(() => {
    if (!open || imageSearchConfigured !== null) return
    let cancelled = false
    void searchProductImages('probe', 1)
      .then((res) => {
        if (!cancelled) setImageSearchConfigured(res.configured)
      })
      .catch(() => {
        if (!cancelled) setImageSearchConfigured(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, imageSearchConfigured])

  function togglePhoto(photoUrl: string) {
    setKept((prev) => {
      const next = new Set(prev)
      if (next.has(photoUrl)) next.delete(photoUrl)
      else next.add(photoUrl)
      return next
    })
  }

  // Build the web-image-search query from the currently selected product model
  // (falling back to the parsed hint) plus the color field. Cheap, so computed
  // inline each render rather than memoized over RHF's watch().
  const watchedProductId = form.watch('product_id')
  const watchedColor = form.watch('color')
  const selectedModel = productList.find((p) => p.id === watchedProductId)
  const searchQuery = [
    selectedModel?.brand ?? parsedHint.split(' ')[0] ?? '',
    selectedModel?.model_name ?? parsedHint,
    watchedColor ?? '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  // Live pricing breakdown for the summary panel: Selling = Supplier + Markup. Computed each
  // render from RHF's watch(). `overridden` flags when the (editable) selling price no longer
  // equals supplier + markup, so the panel can show the auto value for reference.
  const watchedSelling = form.watch('selling_price')
  const pricingSupplier = Number(watchedSupplierPrice) || 0
  const pricingMarkup = Number(watchedMarkup) || 0
  const pricingComputed = pricingSupplier + pricingMarkup
  const pricingSelling = Number(watchedSelling) || 0
  const pricingOverridden = pricingSelling !== pricingComputed
  const yen = (n: number) => `¥${n.toLocaleString('en-US')}`

  async function handleSearchWeb() {
    if (!searchQuery) {
      toast.error('Select a product or fetch a listing first')
      return
    }
    setSearching(true)
    try {
      const res = await searchProductImages(searchQuery, 8)
      setImageSearchConfigured(res.configured)
      if (!res.configured) {
        toast.error('Web image search is not configured')
        return
      }
      if (res.images.length === 0) {
        toast.info('No additional images found')
        return
      }
      setPhotos((prev) => {
        const merged = [...prev]
        for (const u of res.images) if (!merged.includes(u)) merged.push(u)
        return merged
      })
      setKept((prev) => {
        const next = new Set(prev)
        for (const u of res.images) next.add(u)
        return next
      })
      toast.success(`Added ${res.images.length} image(s)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Image search failed')
    } finally {
      setSearching(false)
    }
  }

  async function handleSubmit(values: BackorderFormValues) {
    setSaving(true)
    try {
      const line = await createBackorderLine({
        product_id: values.product_id,
        supplier_id: values.supplier_id,
        condition_grade: values.condition_grade,
        selling_price: values.selling_price,
        color: values.color?.trim() || null,
        color_ja: values.color_ja?.trim() || null,
        storage_gb: values.storage_gb ?? null,
        ram_gb: values.ram_gb ?? null,
        cpu: values.cpu?.trim() || null,
        screen_size: values.screen_size ?? null,
        supplier_price: values.supplier_price ?? null,
        markup_jpy: values.markup_jpy,
        supplier_url: values.supplier_url?.trim() || null,
        supplier_product_code: values.supplier_product_code?.trim() || null,
        supplier_stock: values.supplier_stock ?? null,
        quantity_total: values.quantity_total,
        lead_time_min_days: values.lead_time_min_days,
        lead_time_days: values.lead_time_days,
      })

      // Persist curated photos. Partial failure here must NOT undo the line.
      const keptUrls = photos.filter((p) => kept.has(p))
      if (keptUrls.length > 0) {
        try {
          await saveBackorderPhotos(line.id, keptUrls)
        } catch (photoErr) {
          toast.warning(
            `Backorder ${line.backorder_code} created, but saving photos failed: ${
              photoErr instanceof Error ? photoErr.message : 'unknown error'
            }. You can retry photos from the line.`,
          )
          await queryClient.invalidateQueries({ queryKey: ['backorder-lines'] })
          handleOpenChange(false)
          return
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['backorder-lines'] })
      toast.success(`Backorder ${line.backorder_code} created`)
      handleOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create backorder line',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Backorder</DialogTitle>
          <DialogDescription>
            Paste a supplier listing URL to prefill specs, map it to a product
            model and supplier, curate photos, and create a backorder line.
          </DialogDescription>
        </DialogHeader>

        {/* Paste box */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Supplier URL</label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://iosys.co.jp/..."
              className="flex-1"
            />
            <Button type="button" onClick={handleFetch} disabled={fetching}>
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Fetch'
              )}
            </Button>
          </div>
          {parsedHint && (
            <p className="text-xs text-muted-foreground">
              Parsed: <span className="font-medium">{parsedHint}</span> — pick the
              matching product model below.
            </p>
          )}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Product model (required) */}
            <FormField
              control={form.control}
              name="product_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Model *</FormLabel>
                  <FormControl>
                    <ProductPicker
                      value={field.value}
                      onSelect={field.onChange}
                      products={productList}
                      initialSearch={parsedHint || undefined}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Supplier (required) */}
            <FormField
              control={form.control}
              name="supplier_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supplier *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select supplier..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {supplierList.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.supplier_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* Grade */}
              <FormField
                control={form.control}
                name="condition_grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Grade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {GRADES.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selling price */}
              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price (JPY) *</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Color (English) — shown in inventory + customer-facing surfaces */}
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color (English)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="e.g. Desert Titanium" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Color (Japanese) — kept for the Kaitori side */}
              <FormField
                control={form.control}
                name="color_ja"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Color (日本語)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} placeholder="例: デザートチタニウム" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Storage */}
              <FormField
                control={form.control}
                name="storage_gb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage (GB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* RAM */}
              <FormField
                control={form.control}
                name="ram_gb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RAM (GB)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* CPU */}
              <FormField
                control={form.control}
                name="cpu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Supplier price */}
              <FormField
                control={form.control}
                name="supplier_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Price (JPY)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Markup — added to supplier price to derive the selling price */}
              <FormField
                control={form.control}
                name="markup_jpy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Markup (JPY)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Pricing summary — visualizes Selling = Supplier + Markup with live values */}
              <div className="col-span-2 rounded-lg border bg-muted/40 p-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="flex items-end gap-3 text-sm tabular-nums">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-muted-foreground">Supplier</span>
                      <span className="font-semibold">{yen(pricingSupplier)}</span>
                    </div>
                    <span className="pb-0.5 text-muted-foreground">+</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-muted-foreground">Markup</span>
                      <span className="font-semibold">{yen(pricingMarkup)}</span>
                    </div>
                    <span className="pb-0.5 text-muted-foreground">=</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-muted-foreground">Selling Price</span>
                    <span className="text-2xl font-bold leading-none tabular-nums">
                      {yen(pricingSelling)}
                    </span>
                  </div>
                </div>
                {pricingOverridden && (
                  <p className="mt-2 text-xs text-amber-600">
                    Manually adjusted — auto = {yen(pricingComputed)} (supplier + markup).
                  </p>
                )}
              </div>

              {/* Supplier stock */}
              <FormField
                control={form.control}
                name="supplier_stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supplier Stock</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Quantity */}
              <FormField
                control={form.control}
                name="quantity_total"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Lead time — working-day range (min .. max). Shown to customers as
                  "min–max working days" on pre-order offers. */}
              <FormField
                control={form.control}
                name="lead_time_min_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Time Min (working days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lead_time_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Time Max (working days)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Photo curate grid */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Photos{' '}
                  <span className="text-muted-foreground font-normal">
                    ({photos.filter((p) => kept.has(p)).length} kept)
                  </span>
                </label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={imageSearchConfigured === false ? 0 : -1}>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSearchWeb}
                          disabled={
                            imageSearchConfigured === false || searching
                          }
                        >
                          {searching ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Search className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Search web for more
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {imageSearchConfigured === false && (
                      <TooltipContent>
                        Set IMAGE_SEARCH_API_KEY to enable
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>

              {photos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No photos yet. Fetch a listing or search the web.
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((photoUrl) => {
                    const isKept = kept.has(photoUrl)
                    return (
                      <div
                        key={photoUrl}
                        className={cn(
                          'relative aspect-square overflow-hidden rounded-md border',
                          !isKept && 'opacity-40',
                        )}
                      >
                        <img
                          src={photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => togglePhoto(photoUrl)}
                          aria-label={isKept ? 'Remove photo' : 'Restore photo'}
                          className={cn(
                            'absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-white shadow',
                            isKept ? 'bg-black/60' : 'bg-primary',
                          )}
                        >
                          {isKept ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <span className="text-[10px] leading-none">+</span>
                          )}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Backorder'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
