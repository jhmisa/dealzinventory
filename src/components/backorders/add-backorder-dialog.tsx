import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
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
import { ProductPicker } from '@/components/intake/product-picker'
import { useSuppliers } from '@/hooks/use-suppliers'
import {
  findMatchingProductModel,
  cleanModelName,
  enrichProductModelSpecs,
} from '@/services/product-models'
import {
  fetchSupplierProduct,
  createBackorderLine,
  findExistingBackorderLine,
} from '@/services/backorders'
import { backorderSchema, type BackorderFormValues } from '@/validators/backorder'
import { cn, normalizeStorageGb } from '@/lib/utils'
import type { ProductModelWithHeroImage } from '@/lib/types'

const GRADES = ['S', 'A', 'B', 'C', 'D', 'J'] as const

// Hide native number-input spinner carets. Scoped to this dialog's inputs only (we don't touch
// the base ui/input.tsx to avoid global side effects).
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

// The link-parsed specs we treat as the source of truth for THIS unit. Storage + color come
// from the supplier listing; the selected product model must match them (we warn if it doesn't).
interface ParsedSupplierSpecs {
  storageGb: number | null
  color: string | null
  colorJa: string | null
  ramGb: number | null
  brandText: string | null
  modelText: string | null
  modelNumber: string | null
  // Absolute catalog specs parsed from the iosys spec table (for NULL-field enrichment).
  cpu: string | null
  screenSize: number | null
  camera: string | null
  ports: string | null
  osFamily: string | null
  year: number | null
}

interface AddBackorderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
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
  included_accessories: '',
  screen_size: undefined,
  supplier_price: undefined,
  markup_jpy: 4000,
  discount_amount: 0,
  supplier_url: '',
  supplier_product_code: '',
  supplier_stock: undefined,
  quantity_total: 1,
  lead_time_min_days: 4,
  lead_time_days: 7,
}

export function AddBackorderDialog({ open, onOpenChange }: AddBackorderDialogProps) {
  const queryClient = useQueryClient()
  // Do NOT load the whole table (1000-row cap bug). The picker searches the server itself; here we
  // only keep the auto-matched row so it stays visible/selectable when off the default list. The
  // base list is a stable empty array so the productList memo doesn't churn each render.
  const products = useMemo<ProductModelWithHeroImage[]>(() => [], [])
  const { data: suppliers } = useSuppliers()

  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [parsedHint, setParsedHint] = useState('')
  // Clean term seeded into the ProductPicker search (decoupled from `parsedHint`, which keeps
  // the full identifier-laden string for the human-readable "Parsed: …" line).
  const [pickerSearch, setPickerSearch] = useState('')
  // Link-parsed specs (source of truth for this unit) kept for model-match validation.
  const [parsed, setParsed] = useState<ParsedSupplierSpecs | null>(null)
  // The auto-matched product model. Merged into the picker list so an off-list selection (beyond
  // the >1000-row fetch cap) still displays + drives the spec auto-fill and mismatch checks.
  const [matchedModel, setMatchedModel] = useState<ProductModelWithHeroImage | null>(null)

  // Set when a fetch finds no catalog match and nothing is manually selected → hard-block create.
  const [noCatalogMatch, setNoCatalogMatch] = useState(false)

  const form = useForm<BackorderFormValues>({
    resolver: zodResolver(backorderSchema),
    defaultValues,
  })

  const supplierList = suppliers ?? []
  // Merge the auto-matched model in so it displays even if it falls beyond the >1000-row fetch cap.
  const productList = useMemo(() => {
    const base = products ?? []
    if (matchedModel && !base.some((p) => p.id === matchedModel.id)) {
      return [matchedModel, ...base]
    }
    return base
  }, [products, matchedModel])

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
    setPickerSearch('')
    setParsed(null)
    setMatchedModel(null)
    setNoCatalogMatch(false)
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
      form.setValue('included_accessories', product.includedAccessories ?? '')

      // Selling price = supplier cost + markup (staff can still edit either). Recompute on
      // fetch so a freshly pasted listing immediately shows supplier + ¥markup.
      if (product.supplierPrice != null) {
        const markup = Number(form.getValues('markup_jpy')) || 0
        form.setValue('selling_price', product.supplierPrice + markup)
      }

      // Hint for the human-readable "Parsed: …" line (full identifier-laden string).
      const hint = [product.brandText, product.modelText].filter(Boolean).join(' ').trim()
      setParsedHint(hint)

      // Seed the picker's manual-search with a CLEAN term (brand + clean model name, no A-number
      // / part-number / storage) so the fallback search actually returns rows. e.g.
      // "Apple iPhone16 Pro Max A3295 (MYWJ3J/A) 256GB …" -> "Apple iPhone 16 Pro Max".
      const cleanName = cleanModelName(product.modelText ?? '')
      setPickerSearch([product.brandText, cleanName].filter(Boolean).join(' ').trim())

      // Remember the link specs so we can (a) keep them authoritative and (b) warn if the
      // chosen product model contradicts the listing.
      setParsed({
        storageGb: product.storageGb ?? null,
        color: product.color ?? null,
        colorJa: product.colorJa ?? null,
        ramGb: product.ramGb ?? null,
        brandText: product.brandText ?? null,
        modelText: product.modelText ?? null,
        modelNumber: product.modelNumber ?? null,
        cpu: product.specs?.cpu ?? null,
        screenSize: product.specs?.screenSize ?? null,
        camera: product.specs?.camera ?? null,
        ports: product.specs?.ports ?? null,
        osFamily: product.specs?.os ?? null,
        year: product.specs?.year ?? null,
      })

      // Auto-select the exact product model. Match on part-number (SKU-precise) first, then a
      // clean-name + storage/color fallback. Merge the full row into the picker list so it
      // displays even when it falls beyond the >1000-row fetch cap. The select-watch effect then
      // auto-fills RAM/chip/screen. Non-fatal: a miss just leaves the picker for manual selection.
      try {
        const isApplePart = /\b[A-Z0-9]{4,7}\/[A-Z]{1,2}\b/.test(product.modelText ?? '')
        const match = await findMatchingProductModel({
          brand: product.brandText,
          modelText: product.modelText,
          modelNumber: product.modelNumber,
          storageGb: product.storageGb,
          color: product.color,
          colorJa: product.colorJa,
        })
        if (match) {
          setMatchedModel(match)
          setNoCatalogMatch(false)
          form.setValue('product_id', match.id)
          // Confident match = Apple part# exact OR Android model_number exact. Enrich NULL specs
          // silently; fuzzy/manual selections defer enrichment (handled by staff confirming).
          const confident = isApplePart || Boolean(product.modelNumber && match.model_number)
          if (confident && product.specs) {
            try {
              const written = await enrichProductModelSpecs(
                match.id,
                {
                  cpu: match.cpu,
                  chipset: match.chipset,
                  ram_gb: match.ram_gb,
                  storage_gb: match.storage_gb,
                  screen_size: match.screen_size,
                  camera: match.camera,
                  ports: match.ports,
                  os_family: match.os_family,
                  year: match.year,
                },
                {
                  cpu: product.specs.cpu,
                  ramGb: product.specs.ramGb,
                  storageGb: product.specs.storageGb,
                  screenSize: product.specs.screenSize,
                  camera: product.specs.camera,
                  ports: product.specs.ports,
                  osFamily: product.specs.os,
                  year: product.specs.year,
                },
              )
              if (written > 0) {
                await queryClient.invalidateQueries({ queryKey: ['product-models'] })
                toast.success(`Filled ${written} missing spec field(s) on the model`)
              }
            } catch {
              // enrichment is best-effort; never block the flow
            }
          }
        } else {
          // No catalog match and nothing manually selected yet → hard-block create.
          setNoCatalogMatch(true)
        }
      } catch {
        // match failed → treat as no catalog match; manual picker selection can clear it
        setNoCatalogMatch(true)
      }

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

      toast.success('Fetched supplier product')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to fetch supplier product',
      )
    } finally {
      setFetching(false)
    }
  }

  const watchedProductId = form.watch('product_id')
  const selectedModel = productList.find((p) => p.id === watchedProductId)

  // Any chosen product model clears the no-catalog-match block.
  useEffect(() => {
    if (form.getValues('product_id')) setNoCatalogMatch(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedProductId])

  // When a product model is selected, fill the INTRINSIC specs the supplier listing doesn't
  // carry (RAM, chip, screen) from the model's absolute catalog values. Storage + color stay
  // as the link parsed them (the source of truth) — we only fill a field that is still empty,
  // never overwrite what the listing provided.
  useEffect(() => {
    if (!selectedModel) return
    const fillIfEmpty = (name: keyof BackorderFormValues, val: string | number | undefined) => {
      if (val == null || val === '') return
      const cur = form.getValues(name)
      if (cur == null || cur === '' || (typeof cur === 'number' && Number.isNaN(cur))) {
        form.setValue(name, val as never)
      }
    }
    const ram = selectedModel.ram_gb != null && selectedModel.ram_gb !== ''
      ? Number(selectedModel.ram_gb)
      : undefined
    // iPhones keep the chip in `chipset` (e.g. "A18 Pro"); `cpu` is for PC/Android. Use whichever exists.
    const chip = selectedModel.cpu ?? selectedModel.chipset ?? undefined
    fillIfEmpty('ram_gb', Number.isNaN(ram as number) ? undefined : ram)
    fillIfEmpty('cpu', chip ?? undefined)
    fillIfEmpty('screen_size', selectedModel.screen_size ?? undefined)
    fillIfEmpty('storage_gb', normalizeStorageGb(selectedModel.storage_gb) ?? undefined)
    fillIfEmpty('color', selectedModel.color ?? undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedProductId])

  // Warn when the chosen model contradicts the fetched listing (the link is the source of truth
  // for storage + color). Empty/unknown values are not treated as a mismatch.
  const modelMismatches: string[] = []
  if (parsed && selectedModel) {
    const linkStorage = normalizeStorageGb(parsed.storageGb)
    const modelStorage = normalizeStorageGb(selectedModel.storage_gb)
    if (linkStorage != null && modelStorage != null && linkStorage !== modelStorage) {
      modelMismatches.push(`storage — listing ${linkStorage}GB vs model ${modelStorage}GB`)
    }
    const linkColor = (parsed.color ?? '').trim().toLowerCase()
    const modelColor = (selectedModel.color ?? '').trim().toLowerCase()
    if (linkColor && modelColor && linkColor !== modelColor) {
      modelMismatches.push(`color — listing "${parsed.color}" vs model "${selectedModel.color}"`)
    }
  }

  // Live pricing breakdown for the summary panel: Selling = Supplier + Markup. Computed each
  // render from RHF's watch(). `overridden` flags when the (editable) selling price no longer
  // equals supplier + markup, so the panel can show the auto value for reference.
  const watchedSelling = form.watch('selling_price')
  const watchedDiscount = form.watch('discount_amount')
  const pricingSupplier = Number(watchedSupplierPrice) || 0
  const pricingMarkup = Number(watchedMarkup) || 0
  const pricingComputed = pricingSupplier + pricingMarkup
  const pricingSelling = Number(watchedSelling) || 0
  const pricingDiscount = Number(watchedDiscount) || 0
  const pricingEffective = Math.max(0, pricingSelling - pricingDiscount)
  const pricingProfit = pricingEffective - pricingSupplier
  const pricingOverridden = pricingSelling !== pricingComputed
  const yen = (n: number) => `¥${n.toLocaleString('en-US')}`

  async function handleSubmit(values: BackorderFormValues) {
    setSaving(true)
    try {
      // Block accidental duplicates: same supplier URL or same SKU identity.
      const existing = await findExistingBackorderLine({
        product_id: values.product_id,
        condition_grade: values.condition_grade,
        storage_gb: values.storage_gb ?? null,
        color: values.color?.trim() || null,
        supplier_url: values.supplier_url?.trim() || null,
      })
      if (existing) {
        toast.error(
          `A pre-order for this exact item already exists (${existing}). Edit that line — e.g. increase its quantity — instead of adding a duplicate.`,
        )
        setSaving(false)
        return
      }

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
        included_accessories: values.included_accessories?.trim() || null,
        screen_size: values.screen_size ?? null,
        supplier_price: values.supplier_price ?? null,
        markup_jpy: values.markup_jpy,
        discount_amount: values.discount_amount,
        supplier_url: values.supplier_url?.trim() || null,
        supplier_product_code: values.supplier_product_code?.trim() || null,
        supplier_stock: values.supplier_stock ?? null,
        quantity_total: values.quantity_total,
        lead_time_min_days: values.lead_time_min_days,
        lead_time_days: values.lead_time_days,
      })

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
      <DialogContent className="sm:max-w-[960px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Backorder</DialogTitle>
          <DialogDescription>
            Paste a supplier listing URL to prefill specs, map it to a product
            model and supplier, and create a backorder line. Photos are inherited
            from the product model gallery.
          </DialogDescription>
        </DialogHeader>

        {/* SOURCE — paste box (not a form field; lives above the Form) */}
        <section className="rounded-lg border bg-muted/40 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source
          </h3>
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
        </section>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* LEFT — Product & Specs */}
              <section className="space-y-4 rounded-lg border bg-card p-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Product &amp; Specs
                </h3>

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
                          initialSearch={pickerSearch || parsedHint || undefined}
                          categoryId={matchedModel?.category_id ?? undefined}
                        />
                      </FormControl>
                      <FormMessage />
                      {noCatalogMatch && (
                        <p className="mt-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                          <strong>No matching product model.</strong> This item isn&apos;t in the catalog
                          yet. Add the model first — harvest it so its photos come with it — then create
                          the backorder.
                        </p>
                      )}
                      {modelMismatches.length > 0 && (
                        <p className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          ⚠ This model doesn&apos;t match the fetched listing: {modelMismatches.join('; ')}.
                          Pick the product model that matches the supplier link.
                        </p>
                      )}
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
                            className={NO_SPINNER}
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
                            className={NO_SPINNER}
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
                </div>

                {/* Included accessories — prefilled from the iosys 付属品 list, editable; carried
                    onto the item when the backorder is received. */}
                <FormField
                  control={form.control}
                  name="included_accessories"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Included Accessories</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} placeholder="e.g. 箱 / マニュアル" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>

              {/* RIGHT — Pricing + Stock & Fulfillment */}
              <div className="space-y-4">
                {/* Pricing */}
                <section className="space-y-4 rounded-lg border bg-card p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pricing
                  </h3>

                  <div className="grid grid-cols-3 gap-4">
                    {/* Supplier price */}
                    <FormField
                      control={form.control}
                      name="supplier_price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="whitespace-nowrap">Supplier (¥)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              value={field.value ?? ''}
                              className={NO_SPINNER}
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
                          <FormLabel className="whitespace-nowrap">Markup (¥)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              value={field.value ?? ''}
                              className={NO_SPINNER}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Discount — optional customer discount off the selling price (pre-orders can be discounted) */}
                    <FormField
                      control={form.control}
                      name="discount_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="whitespace-nowrap">Discount (¥)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
                              {...field}
                              value={field.value ?? ''}
                              className={NO_SPINNER}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Selling price */}
                  <FormField
                    control={form.control}
                    name="selling_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling Price (¥) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} {...field} className={NO_SPINNER} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Pricing summary — visualizes Selling = Supplier + Markup, then the effective price
                      after any discount and the resulting profit (Sell − Disc − Cost). */}
                  <div className="rounded-lg border bg-muted/40 p-4">
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
                      <div className="flex flex-col text-right">
                        <span className="text-xs font-medium text-muted-foreground">
                          {pricingDiscount > 0 ? 'Customer Pays' : 'Selling Price'}
                        </span>
                        <span className="text-2xl font-bold leading-none tabular-nums">
                          {pricingDiscount > 0 && (
                            <span className="mr-1 align-middle text-base font-normal text-muted-foreground line-through">
                              {yen(pricingSelling)}
                            </span>
                          )}
                          {yen(pricingEffective)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs tabular-nums">
                      {pricingDiscount > 0 ? (
                        <span className="text-muted-foreground">Discount −{yen(pricingDiscount)}</span>
                      ) : (
                        <span />
                      )}
                      <span className={cn('font-medium', pricingProfit >= 0 ? 'text-green-600' : 'text-red-500')}>
                        Profit {yen(pricingProfit)}
                      </span>
                    </div>
                    {pricingOverridden && (
                      <p className="mt-2 text-xs text-amber-600">
                        Manually adjusted — auto = {yen(pricingComputed)} (supplier + markup).
                      </p>
                    )}
                  </div>
                </section>

                {/* Stock & Fulfillment */}
                <section className="space-y-4 rounded-lg border bg-card p-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Stock &amp; Fulfillment
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
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
                              className={NO_SPINNER}
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
                            <Input type="number" min={1} {...field} className={NO_SPINNER} />
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
                            <Input type="number" min={0} {...field} className={NO_SPINNER} />
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
                            <Input type="number" min={0} {...field} className={NO_SPINNER} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 z-10 -mx-6 -mb-6 border-t bg-background px-6 pb-6 pt-3 mt-2">
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
