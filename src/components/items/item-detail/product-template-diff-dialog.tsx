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
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, PackageCheck } from 'lucide-react'
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
] as const

const NUM_FIELDS = ['ram_gb', 'storage_gb', 'year', 'screen_size'] as const

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Product Template</DialogTitle>
        </DialogHeader>

        {fetching ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading template...</div>
        ) : (
          <div className="space-y-4">
            {/* Product hero image + name */}
            <div className="flex items-start gap-4">
              {heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt={productLabel}
                  className="w-24 h-24 rounded-lg object-cover border bg-muted shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-lg border bg-muted flex items-center justify-center shrink-0">
                  <PackageCheck className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm">{productLabel}</p>
                {item.supplier_description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    Supplier: &quot;{item.supplier_description}&quot;
                  </p>
                )}
              </div>
            </div>

            <ScrollArea className="max-h-[350px]">
              <div className="space-y-4 pr-3">
                {/* Conflicts section */}
                {conflicts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-xs font-medium uppercase tracking-wide">
                        Different values — check to overwrite
                      </span>
                    </div>
                    {conflicts.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={checkedFields.has(d.key)}
                          onCheckedChange={() => toggleField(d.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <span className="font-medium">{d.label}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-muted-foreground line-through">{d.currentValue}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium">{d.templateValue}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {/* Fills section */}
                {fills.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Empty fields — will be filled
                    </span>
                    {fills.map((d) => (
                      <label
                        key={d.key}
                        className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={checkedFields.has(d.key)}
                          onCheckedChange={() => toggleField(d.key)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 text-sm">
                          <span className="font-medium">{d.label}</span>
                          <div className="mt-1">
                            <span className="font-medium">{d.templateValue}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {/* No diffs */}
                {diffs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No spec changes — the template matches current values.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={loading || fetching}>
            {loading ? 'Applying...' : 'Apply Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
