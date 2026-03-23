import { useEffect, useMemo } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfidenceBadge } from './confidence-badge'
import { ProductPicker } from './product-picker'
import { IntakeSummaryFooter } from './intake-summary-footer'
import { formatPrice } from '@/lib/utils'
import { getMatchingTokens, tokenize } from '@/lib/product-matcher'
import { useCreateProductModel } from '@/hooks/use-product-models'
import type { ProductModelWithHeroImage, ParsedSpecs } from '@/lib/types'
import type { ProductModelFormValues } from '@/validators/product-model'

export type { ParsedSpecs }

export interface ResolvedSpecs extends ParsedSpecs {
  // Same fields as ParsedSpecs — staff-approved final values
}

export interface LineItemRow {
  id: string
  product_description: string
  quantity: number
  unit_price: number
  product_id: string
  ai_confidence: number | null
  notes: string
  csv_specs?: ParsedSpecs
  resolved_specs?: ResolvedSpecs
}

type SpecField = 'brand' | 'model_name' | 'cpu' | 'ram_gb' | 'storage_gb' | 'screen_size'

const CONFLICT_FIELDS: SpecField[] = ['ram_gb', 'storage_gb', 'screen_size', 'cpu', 'brand']

function hasSpecConflict(
  field: SpecField,
  csvVal: string | number | undefined,
  pmVal: string | number | null | undefined,
): boolean {
  if (!CONFLICT_FIELDS.includes(field)) return false
  const csvStr = csvVal != null && csvVal !== '' ? String(csvVal).toLowerCase() : undefined
  const pmStr = pmVal != null && pmVal !== '' ? String(pmVal).toLowerCase() : undefined
  if (!csvStr || !pmStr) return false
  return csvStr !== pmStr
}

interface SpecConflict {
  field: SpecField
  csvVal: string | number
  pmVal: string | number
}

function getConflicts(
  csvSpecs: ParsedSpecs | undefined,
  pm: ProductModelWithHeroImage | null,
): SpecConflict[] {
  if (!csvSpecs || !pm) return []
  const conflicts: SpecConflict[] = []
  for (const field of CONFLICT_FIELDS) {
    const csvVal = csvSpecs[field]
    const pmVal = pm[field as keyof typeof pm] as string | number | null | undefined
    if (hasSpecConflict(field, csvVal, pmVal) && csvVal != null && csvVal !== '' && pmVal != null && pmVal !== '') {
      conflicts.push({ field, csvVal, pmVal: pmVal as string | number })
    }
  }
  return conflicts
}

function buildProductSummary(pm: ProductModelWithHeroImage): string {
  const parts: string[] = []
  if (pm.brand) parts.push(pm.brand)
  if (pm.model_name) parts.push(pm.model_name)
  const specBits: string[] = []
  if (pm.cpu) specBits.push(pm.cpu)
  if (pm.ram_gb) specBits.push(`${pm.ram_gb}GB`)
  if (pm.storage_gb) specBits.push(`${pm.storage_gb}GB`)
  if (pm.screen_size) specBits.push(`${pm.screen_size}″`)
  if (specBits.length > 0) parts.push(specBits.join(' / '))
  return parts.join(' ') || '—'
}

const FIELD_LABELS: Record<SpecField, string> = {
  brand: 'Brand',
  model_name: 'Model',
  cpu: 'CPU',
  ram_gb: 'Memory',
  storage_gb: 'Storage',
  screen_size: 'Screen',
}

function formatSpecVal(field: SpecField, val: string | number): string {
  if (field === 'ram_gb' || field === 'storage_gb') return `${val}GB`
  if (field === 'screen_size') return `${val}″`
  return String(val)
}

const NOISE_WORDS = new Set([
  'used', 'lot', 'set', 'pcs', 'unit', 'units', 'pc', 'item', 'items',
  'the', 'and', 'for', 'with', 'from', 'inc', 'co', 'ltd',
])

function buildInitialSearch(item: LineItemRow): string {
  const parts: string[] = []
  if (item.csv_specs?.brand) parts.push(item.csv_specs.brand)
  if (item.csv_specs?.model_name) parts.push(item.csv_specs.model_name)
  if (parts.length > 0) return parts.join(' ')

  // Fallback: extract first 4 meaningful tokens from description
  const tokens = tokenize(item.product_description)
  const meaningful = tokens.filter(
    (t) => !NOISE_WORDS.has(t) && !/^\d{1,2}$/.test(t),
  )
  return meaningful.slice(0, 4).join(' ')
}

function HighlightedText({ text, matchedTokens }: { text: string; matchedTokens: Set<string> }) {
  if (matchedTokens.size === 0) return <>{text}</>

  const words = text.split(/(\s+)/)
  return (
    <>
      {words.map((word, i) => {
        // Whitespace segments pass through unchanged
        if (/^\s+$/.test(word)) return <span key={i}>{word}</span>

        const normalized = word.toLowerCase().replace(/[^\w]/g, '')
        if (normalized.length <= 2) return <span key={i}>{word}</span>

        const isMatch = matchedTokens.has(normalized) ||
          Array.from(matchedTokens).some(
            (t) => t.length > 2 && (normalized.includes(t) || t.includes(normalized)),
          )

        if (isMatch) {
          return (
            <mark
              key={i}
              className="bg-yellow-200/70 dark:bg-yellow-500/30 text-inherit rounded-sm px-0.5"
            >
              {word}
            </mark>
          )
        }
        return <span key={i}>{word}</span>
      })}
    </>
  )
}

interface IntakeLineItemTableProps {
  lineItems: LineItemRow[]
  onUpdateItem: (id: string, field: keyof LineItemRow, value: string | number | null) => void
  onDeleteItem: (id: string) => void
  onAddItem: () => void
  products: ProductModelWithHeroImage[]
  onConflictsChange?: (count: number) => void
}

export function IntakeLineItemTable({
  lineItems,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
  products,
  onConflictsChange,
}: IntakeLineItemTableProps) {
  const createProductMutation = useCreateProductModel()

  async function handleCreateProduct(values: ProductModelFormValues): Promise<string> {
    const newProduct = await createProductMutation.mutateAsync(values)
    toast.success(`Created "${newProduct.brand} ${newProduct.model_name}"`)
    return newProduct.id
  }

  // Compute conflicts for all items
  const conflictMap = useMemo(() => {
    const map = new Map<string, SpecConflict[]>()
    for (const item of lineItems) {
      if (!item.product_id) continue
      const pm = products.find((p) => p.id === item.product_id) ?? null
      const conflicts = getConflicts(item.csv_specs, pm)
      if (conflicts.length > 0) {
        map.set(item.id, conflicts)
      }
    }
    return map
  }, [lineItems, products])

  const totalConflictCount = useMemo(() => {
    let count = 0
    for (const conflicts of conflictMap.values()) {
      count += conflicts.length
    }
    return count
  }, [conflictMap])

  useEffect(() => {
    onConflictsChange?.(totalConflictCount)
  }, [totalConflictCount, onConflictsChange])

  const colCount = 8

  return (
    <div className="space-y-3">
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-10">#</th>
              <th className="px-3 py-2 text-left font-medium min-w-[200px]">Description</th>
              <th className="px-3 py-2 text-right font-medium w-20">Qty</th>
              <th className="px-3 py-2 text-right font-medium w-28">Unit Price</th>
              <th className="px-3 py-2 text-right font-medium w-28">Total</th>
              <th className="px-3 py-2 text-left font-medium w-56">Product</th>
              <th className="px-3 py-2 text-center font-medium w-16">Conf.</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, idx) => {
              const pm = item.product_id
                ? products.find((p) => p.id === item.product_id) ?? null
                : null
              const showSubRow = !!item.product_id || !!item.csv_specs
              const conflicts = conflictMap.get(item.id) ?? []
              const hasConflicts = conflicts.length > 0

              return (
                <ComparisonRow
                  key={item.id}
                  item={item}
                  idx={idx}
                  pm={pm}
                  showSubRow={showSubRow}
                  conflicts={conflicts}
                  hasConflicts={hasConflicts}
                  colCount={colCount}
                  products={products}
                  onUpdateItem={onUpdateItem}
                  onDeleteItem={onDeleteItem}
                  onCreateProduct={handleCreateProduct}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={onAddItem}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Item
        </Button>
      </div>

      <IntakeSummaryFooter lineItems={lineItems} />
    </div>
  )
}

function ComparisonRow({
  item,
  idx,
  pm,
  showSubRow,
  conflicts,
  hasConflicts,
  colCount,
  products,
  onUpdateItem,
  onDeleteItem,
  onCreateProduct,
}: {
  item: LineItemRow
  idx: number
  pm: ProductModelWithHeroImage | null
  showSubRow: boolean
  conflicts: SpecConflict[]
  hasConflicts: boolean
  colCount: number
  products: ProductModelWithHeroImage[]
  onUpdateItem: (id: string, field: keyof LineItemRow, value: string | number | null) => void
  onDeleteItem: (id: string) => void
  onCreateProduct: (values: ProductModelFormValues) => Promise<string>
}) {
  const matchedTokens = useMemo(() => {
    if (!pm) return new Set<string>()
    return getMatchingTokens(item.product_description, pm, item.csv_specs)
  }, [item.product_description, item.csv_specs, pm])

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-1.5 text-muted-foreground">{idx + 1}</td>
        <td className="px-3 py-1.5">
          <Input
            value={item.product_description}
            onChange={(e) => onUpdateItem(item.id, 'product_description', e.target.value)}
            className="h-8 text-sm"
            placeholder="Product description"
          />
        </td>
        <td className="px-3 py-1.5">
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => onUpdateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
            className="h-8 text-sm text-right w-16"
            min={1}
          />
        </td>
        <td className="px-3 py-1.5">
          <Input
            type="number"
            value={item.unit_price}
            onChange={(e) => onUpdateItem(item.id, 'unit_price', parseInt(e.target.value) || 0)}
            className="h-8 text-sm text-right w-24"
            min={0}
          />
        </td>
        <td className="px-3 py-1.5 text-right font-mono text-xs">
          {formatPrice(item.quantity * item.unit_price)}
        </td>
        <td className="px-3 py-1.5">
          <ProductPicker
            value={item.product_id}
            onSelect={(productId) => onUpdateItem(item.id, 'product_id', productId)}
            products={products}
            initialSearch={buildInitialSearch(item)}
            onCreate={onCreateProduct}
            invoiceDescription={item.product_description}
          />
        </td>
        <td className="px-3 py-1.5 text-center">
          <ConfidenceBadge confidence={item.ai_confidence} />
        </td>
        <td className="px-3 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDeleteItem(item.id)}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </td>
      </tr>
      {showSubRow && (
        <tr className={hasConflicts ? 'bg-red-50/60 dark:bg-red-950/15' : 'bg-muted/20'}>
          <td colSpan={colCount} className="px-3 py-2">
            <div className="flex gap-4">
              {/* Left panel: Invoice Description */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Invoice Description
                </div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {item.product_description ? (
                    <HighlightedText text={item.product_description} matchedTokens={matchedTokens} />
                  ) : '—'}
                </div>
              </div>

              {/* Right panel: Matched Product */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Matched Product
                </div>
                {pm ? (
                  <div className="text-xs text-foreground leading-relaxed">
                    <HighlightedText text={buildProductSummary(pm)} matchedTokens={matchedTokens} />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">
                    — no product selected
                  </div>
                )}

                {/* Conflict badges */}
                {conflicts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {conflicts.map((c) => (
                      <span
                        key={c.field}
                        className="inline-flex items-center gap-1 text-[11px] text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/40 px-1.5 py-0.5 rounded"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {FIELD_LABELS[c.field]}: CSV {formatSpecVal(c.field, c.csvVal)} ≠ Product {formatSpecVal(c.field, c.pmVal)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
