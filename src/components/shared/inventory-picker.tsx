import { memo, useState, useEffect } from 'react'
import { Search, Plus, Check, Loader2, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GradeBadge } from '@/components/shared/grade-badge'
import { formatPrice } from '@/lib/utils'
import { useAvailableInventorySearch, useAvailableBrands } from '@/hooks/use-items'
import { useCategories } from '@/hooks/use-categories'
import { formatLeadTime } from '@/lib/format-lead-time'
import type { AvailableInventoryResult, InventorySearchFilters } from '@/services/items'
import type { ConditionGrade } from '@/lib/types'

export interface InventoryPickerProps {
  /** Called when a row's action button is pressed. */
  onAdd: (item: AvailableInventoryResult) => void
  /** Codes already selected — their row shows a checked "Added" state instead of the action. */
  addedCodes?: string[]
  /** Id of a row whose action is in-flight (shows a spinner). */
  addingId?: string | null
  /** Action button label (default "Add"). */
  addLabel?: string
  /** Autofocus the search box on mount. */
  autoFocus?: boolean
  /** Extra classes for the scrollable results container. */
  resultsClassName?: string
}

/**
 * Canonical inventory picker: Category / Brand / ¥Min / ¥Max filters + search over
 * items · sell groups · accessories · backorders (P/G/A/B codes), rendered as a
 * Code · Grade · Description · Price · action table.
 *
 * Presentation + search only — the parent owns what "Add" does via onAdd(). This is
 * the ONE reusable product selector; new product-selection features should embed it
 * instead of reinventing a dropdown. Wrap it in a Dialog for a modal picker, or drop
 * it inline (e.g. the video recorder's item-selection step).
 */
export const InventoryPicker = memo(function InventoryPicker({
  onAdd,
  addedCodes = [],
  addingId = null,
  addLabel = 'Add',
  autoFocus = false,
  resultsClassName,
}: InventoryPickerProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  // Filters
  const [brand, setBrand] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [priceMin, setPriceMin] = useState<string>('')
  const [priceMax, setPriceMax] = useState<string>('')
  const [debouncedPriceMin, setDebouncedPriceMin] = useState<string>('')
  const [debouncedPriceMax, setDebouncedPriceMax] = useState<string>('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  // Debounce price inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPriceMin(priceMin)
      setDebouncedPriceMax(priceMax)
    }, 500)
    return () => clearTimeout(timer)
  }, [priceMin, priceMax])

  const filters: InventorySearchFilters = {
    ...(brand ? { brand } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(debouncedPriceMin ? { priceMin: Number(debouncedPriceMin) } : {}),
    ...(debouncedPriceMax ? { priceMax: Number(debouncedPriceMax) } : {}),
  }

  const { data: results = [], isLoading } = useAvailableInventorySearch(debouncedQuery, filters)
  const { data: brands = [] } = useAvailableBrands()
  const { data: categories = [] } = useCategories()

  const hasQuery = debouncedQuery.trim().length >= 2
  const hasFilters = !!(brand || categoryId || debouncedPriceMin || debouncedPriceMax)
  const hasInput = hasQuery || hasFilters
  const added = new Set(addedCodes)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 pb-2">
        <div className="flex gap-2">
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={brand} onValueChange={(v) => setBrand(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="number"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="¥ Min"
            className="h-8 w-24 text-xs"
          />
          <Input
            type="number"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="¥ Max"
            className="h-8 w-24 text-xs"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code or description..."
            className="h-9 pl-9"
            autoFocus={autoFocus}
          />
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${resultsClassName ?? ''}`}>
        {isLoading && hasInput ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 && hasInput ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No available items found</p>
        ) : !hasInput ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Type at least 2 characters or select a filter
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-12 pb-2"></th>
                <th className="w-[88px] pb-2 pr-3">Code</th>
                <th className="w-14 pb-2">Grade</th>
                <th className="pb-2 pr-3">Description</th>
                <th className="w-20 pb-2 pr-3 text-right">Price</th>
                <th className="w-16 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((item) => {
                const isAdded = added.has(item.code)
                return (
                  <tr key={`${item.type}-${item.id}`} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      {item.thumbnail_url ? (
                        <img src={item.thumbnail_url} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs">{item.code}</span>
                      {item.type === 'backorder' && (
                        <span className="mt-0.5 block w-fit rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-700">
                          ⏳ Pre-order
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {item.grade ? (
                        <GradeBadge grade={item.grade as ConditionGrade} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="line-clamp-2 text-xs">{item.description}</span>
                      {item.condition_notes && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.condition_notes}</p>
                      )}
                      {item.type === 'backorder' && (() => {
                        const lead = formatLeadTime(item.lead_time_min_days, item.lead_time_days)
                        return lead ? <p className="mt-0.5 text-[11px] text-amber-700">~{lead}</p> : null
                      })()}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="text-xs font-medium">{formatPrice(item.price)}</span>
                    </td>
                    <td className="py-2 text-right">
                      {isAdded ? (
                        <span className="inline-flex h-7 items-center gap-1 text-xs font-medium text-emerald-600">
                          <Check className="h-3.5 w-3.5" />
                          Added
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={addingId === item.id}
                          onClick={() => onAdd(item)}
                        >
                          {addingId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          {addLabel}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
})
