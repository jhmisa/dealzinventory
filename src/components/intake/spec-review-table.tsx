import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { LineItemRow, ResolvedSpecs } from './intake-line-item-table'
import type { ProductModelWithHeroImage } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SpecReviewTableProps {
  items: LineItemRow[]
  products: ProductModelWithHeroImage[]
  onUpdateSpecs: (id: string, specs: ResolvedSpecs) => void
}

type SpecField = 'brand' | 'model_name' | 'cpu' | 'ram_gb' | 'storage_gb' | 'screen_size' | 'serial_number'

// Fields where a mismatch between CSV and Product indicates a wrong product assignment
const CONFLICT_FIELDS: SpecField[] = ['ram_gb', 'storage_gb', 'screen_size', 'cpu', 'brand']

const SPEC_COLUMNS: { key: SpecField; label: string; type: 'text' | 'number'; width: string }[] = [
  { key: 'brand', label: 'Brand', type: 'text', width: 'w-28' },
  { key: 'model_name', label: 'Model', type: 'text', width: 'w-32' },
  { key: 'cpu', label: 'CPU', type: 'text', width: 'w-28' },
  { key: 'ram_gb', label: 'Memory', type: 'text', width: 'w-20' },
  { key: 'storage_gb', label: 'Storage', type: 'text', width: 'w-24' },
  { key: 'screen_size', label: 'Screen (\u2033)', type: 'number', width: 'w-20' },
  { key: 'serial_number', label: 'Serial', type: 'text', width: 'w-32' },
]

function getProductModel(item: LineItemRow, products: ProductModelWithHeroImage[]) {
  if (!item.product_id) return null
  return products.find((p) => p.id === item.product_id) ?? null
}

function buildProductSummary(pm: ProductModelWithHeroImage | null): string {
  if (!pm) return '\u2014'
  const parts: string[] = []
  if (pm.brand) parts.push(pm.brand)
  if (pm.model_name) parts.push(pm.model_name)
  const specBits: string[] = []
  if (pm.cpu) specBits.push(pm.cpu)
  if (pm.ram_gb) specBits.push(String(pm.ram_gb))
  if (pm.storage_gb) specBits.push(String(pm.storage_gb))
  if (pm.screen_size) specBits.push(`${pm.screen_size}\u2033`)
  if (specBits.length > 0) parts.push(specBits.join(' / '))
  return parts.join(' ') || '\u2014'
}

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

function SourceIndicator({ csvVal, pmVal, conflict }: { csvVal?: string | number; pmVal?: string | number | null; conflict?: boolean }) {
  const csvStr = csvVal != null && csvVal !== '' ? String(csvVal) : undefined
  const pmStr = pmVal != null && pmVal !== '' ? String(pmVal) : undefined

  if (!csvStr && !pmStr) return null
  if (csvStr && pmStr && csvStr === pmStr) return null

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full ml-1 shrink-0',
              conflict ? 'bg-red-500' : 'bg-blue-400',
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          {csvStr && <div>CSV: {csvStr}</div>}
          {pmStr && <div>Product: {pmStr}</div>}
          {conflict && <div className="text-red-400 font-medium mt-1">Mismatch — check product assignment</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function SpecReviewTable({ items, products, onUpdateSpecs }: SpecReviewTableProps) {
  function handleChange(item: LineItemRow, field: SpecField, raw: string) {
    const specs = { ...item.resolved_specs }
    if (raw === '') {
      delete specs[field]
    } else if (field === 'ram_gb' || field === 'storage_gb') {
      const n = parseInt(raw, 10)
      if (!isNaN(n)) specs[field] = n
    } else if (field === 'screen_size') {
      const n = parseFloat(raw)
      if (!isNaN(n)) specs[field] = n
    } else {
      specs[field] = raw
    }
    onUpdateSpecs(item.id, specs)
  }

  // Count total conflicts across all items
  let totalConflicts = 0
  const itemConflicts = new Map<string, SpecField[]>()
  for (const item of items) {
    const pm = getProductModel(item, products)
    if (!pm) continue
    const conflicts: SpecField[] = []
    for (const col of SPEC_COLUMNS) {
      const csvVal = item.csv_specs?.[col.key]
      const pmVal = pm[col.key as keyof typeof pm] as string | number | null | undefined
      if (hasSpecConflict(col.key, csvVal, pmVal)) {
        conflicts.push(col.key)
      }
    }
    if (conflicts.length > 0) {
      itemConflicts.set(item.id, conflicts)
      totalConflicts += conflicts.length
    }
  }

  return (
    <div className="space-y-3">
      {totalConflicts > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{totalConflicts} spec conflict{totalConflicts !== 1 ? 's' : ''}</strong> found
            {' '}&mdash; CSV data disagrees with the matched Product. Fix the product assignment or verify the specs before continuing.
          </span>
        </div>
      )}

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-10">#</th>
              <th className="px-3 py-2 text-left font-medium min-w-[250px]">Description (Invoice)</th>
              <th className="px-3 py-2 text-left font-medium min-w-[200px]">Product (Matched)</th>
              {SPEC_COLUMNS.map((col) => (
                <th key={col.key} className={cn('px-2 py-2 text-left font-medium', col.width)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const pm = getProductModel(item, products)
              const rowConflicts = itemConflicts.get(item.id)
              const hasRowConflict = !!rowConflicts && rowConflicts.length > 0

              return (
                <tr
                  key={item.id}
                  className={cn(
                    'border-t',
                    hasRowConflict && 'bg-red-50/50 dark:bg-red-950/10',
                  )}
                >
                  <td className="px-3 py-1.5 text-muted-foreground align-top">{idx + 1}</td>
                  <td className="px-3 py-1.5 align-top max-w-[300px]">
                    <div className="text-xs whitespace-pre-wrap break-words text-muted-foreground leading-relaxed">
                      {item.product_description}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 align-top max-w-[250px]">
                    <div className={cn(
                      'text-xs leading-relaxed',
                      pm ? 'text-foreground' : 'text-muted-foreground italic',
                    )}>
                      {buildProductSummary(pm)}
                    </div>
                  </td>
                  {SPEC_COLUMNS.map((col) => {
                    const resolved = item.resolved_specs?.[col.key]
                    const csvVal = item.csv_specs?.[col.key]
                    const pmVal = pm?.[col.key as keyof typeof pm] as string | number | null | undefined
                    const conflict = hasSpecConflict(col.key, csvVal, pmVal)
                    const isEmpty = resolved == null || resolved === ''

                    return (
                      <td key={col.key} className="px-2 py-1.5 align-top">
                        <div className="flex items-center">
                          <Input
                            type={col.type}
                            value={resolved ?? ''}
                            onChange={(e) => handleChange(item, col.key, e.target.value)}
                            className={cn(
                              'h-7 text-xs',
                              conflict
                                ? 'border-red-400 bg-red-50 dark:bg-red-950/20'
                                : isEmpty
                                  ? 'border-dashed border-amber-300'
                                  : undefined,
                            )}
                            placeholder="\u2014"
                            step={col.key === 'screen_size' ? '0.1' : undefined}
                          />
                          <SourceIndicator csvVal={csvVal} pmVal={pmVal} conflict={conflict} />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
