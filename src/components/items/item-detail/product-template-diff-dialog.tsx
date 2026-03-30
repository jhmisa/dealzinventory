import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AlertTriangle, ArrowRight, PackageCheck, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getSpecFieldLabel } from '@/lib/constants'
import type { Item, ProductModel } from '@/lib/types'

interface ProductTemplateDiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: Item
  pendingProductId: string | null
  loading: boolean
  onConfirm: (fieldsToApply: string[]) => void
}

// Fields the template can populate on the item
const TEXT_FIELDS = [
  'brand', 'model_name', 'color', 'cpu', 'gpu', 'os_family',
  'carrier', 'keyboard_layout', 'form_factor', 'other_features',
  'ram_gb', 'storage_gb',
] as const

const NUM_FIELDS = ['year', 'screen_size'] as const

const BOOL_FIELDS = ['has_touchscreen', 'is_unlocked'] as const

const ALL_FIELDS = [...TEXT_FIELDS, ...NUM_FIELDS, ...BOOL_FIELDS] as const

interface FieldDiff {
  key: string
  label: string
  currentValue: string
  templateValue: string
  type: 'conflict' | 'fill'
}

function formatValue(val: unknown): string {
  if (val == null || val === '') return ''
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

export function ProductTemplateDiffDialog({
  open,
  onOpenChange,
  item,
  pendingProductId,
  loading,
  onConfirm,
}: ProductTemplateDiffDialogProps) {
  const [product, setProduct] = useState<ProductModel | null>(null)
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set())

  // Fetch product model + hero image when dialog opens
  useEffect(() => {
    if (!open || !pendingProductId) return

    let cancelled = false
    setFetching(true)

    async function fetchProduct() {
      const { data } = await supabase
        .from('product_models')
        .select('*, product_media(file_url, role, sort_order)')
        .eq('id', pendingProductId!)
        .single()

      if (cancelled) return

      if (data) {
        const media = (data.product_media as Array<{
          file_url: string
          role: string
          sort_order: number
        }>) ?? []
        const hero = media.find((m) => m.role === 'hero') ?? media[0] ?? null
        setHeroImageUrl(hero?.file_url ?? null)

        // Strip product_media from the product model object
        const { product_media: _, ...pm } = data
        setProduct(pm as unknown as ProductModel)
      }

      setFetching(false)
    }

    fetchProduct()
    return () => { cancelled = true }
  }, [open, pendingProductId])

  // Compute diffs whenever product changes
  const diffs: FieldDiff[] = []
  if (product) {
    for (const key of ALL_FIELDS) {
      const templateRaw = product[key as keyof ProductModel]
      const templateStr = formatValue(templateRaw)
      if (!templateStr) continue // Template has no value for this field — skip

      const currentRaw = item[key as keyof Item]
      const currentStr = formatValue(currentRaw)

      if (!currentStr) {
        // Item is empty, template has value → fill
        diffs.push({
          key,
          label: getSpecFieldLabel(key),
          currentValue: '—',
          templateValue: templateStr,
          type: 'fill',
        })
      } else if (currentStr !== templateStr) {
        // Both have values but they differ → conflict
        diffs.push({
          key,
          label: getSpecFieldLabel(key),
          currentValue: currentStr,
          templateValue: templateStr,
          type: 'conflict',
        })
      }
      // If equal → no diff, not shown
    }
  }

  const conflicts = diffs.filter((d) => d.type === 'conflict')
  const fills = diffs.filter((d) => d.type === 'fill')

  // Reset checked state when diffs change
  useEffect(() => {
    // Pre-check all fills, uncheck all conflicts
    const initialChecked = new Set<string>()
    for (const d of diffs) {
      if (d.type === 'fill') initialChecked.add(d.key)
    }
    setCheckedFields(initialChecked)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  function toggleField(key: string) {
    setCheckedFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function handleApply() {
    onConfirm(Array.from(checkedFields))
  }

  const productLabel = product
    ? `${product.brand ?? ''} ${product.model_name ?? ''} ${product.color ? `(${product.color})` : ''}`.trim()
    : 'Loading...'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden !grid-rows-none p-0">
        {/* Header with product info */}
        <div className="px-6 pt-6 pb-4 border-b bg-muted/30 shrink-0">
          <DialogHeader className="mb-0">
            <DialogTitle className="text-base">Apply Product Template</DialogTitle>
          </DialogHeader>
          {!fetching && product && (
            <div className="flex items-center gap-3 mt-3">
              {heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt={productLabel}
                  className="w-12 h-12 rounded-md object-cover border bg-muted shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
                  <PackageCheck className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm leading-tight">{productLabel}</p>
                {item.supplier_description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    Supplier: &quot;{item.supplier_description}&quot;
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content */}
        {fetching ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading template...</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            {/* Conflicts section */}
            {conflicts.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center gap-1.5 text-amber-600 mb-2.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Conflicts — check to overwrite
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {conflicts.map((d) => (
                    <label
                      key={d.key}
                      className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-2.5 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                    >
                      <Checkbox
                        checked={checkedFields.has(d.key)}
                        onCheckedChange={() => toggleField(d.key)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 text-sm leading-snug">
                        <span className="font-medium text-xs text-muted-foreground">{d.label}</span>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-muted-foreground line-through text-xs">{d.currentValue}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                          <span className="font-medium text-xs">{d.templateValue}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Fills section */}
            {fills.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    New values
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {fills.map((d) => (
                    <label
                      key={d.key}
                      className="flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={checkedFields.has(d.key)}
                        onCheckedChange={() => toggleField(d.key)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 text-sm leading-snug">
                        <span className="font-medium text-xs text-muted-foreground">{d.label}</span>
                        <div className="mt-0.5">
                          <span className="font-medium text-xs">{d.templateValue}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* No diffs */}
            {diffs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No spec changes — the template matches current values.
              </p>
            )}
          </div>
        )}

        {/* Footer — always visible */}
        <DialogFooter className="px-6 py-4 border-t bg-muted/30 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading || fetching}>
            {loading ? 'Applying...' : `Apply Template${checkedFields.size > 0 ? ` (${checkedFields.size})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
