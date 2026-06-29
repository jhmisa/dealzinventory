import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Package, ShoppingBag, Puzzle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchMatches } from '@/lib/search'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/fetch-all-pages'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export type SearchResultType = 'item' | 'accessory' | 'sell_group'

export interface SearchResult {
  id: string
  code: string
  type: SearchResultType
  label: string
  sublabel: string | null
  thumbnail_url: string | null
  grade: string | null
  product_id: string | null
  accessory_id: string | null
}

interface ItemSearchInputProps {
  value: string | undefined
  selectedLabel: string | undefined
  onSelect: (result: SearchResult) => void
}

// Fetch the FULL candidate pool ONCE (keyed without the search term) via fetchAllPages —
// so the client-side separator-insensitive filter (@/lib/search) searches the entire
// inventory (older units included), not just a recent window. Preserves prior behavior
// (all item statuses + browse when empty). The displayed result count is capped in the
// component to keep the list light; the pool itself is complete.
const DISPLAY_LIMIT = 50

// Internal pool entry carries a pre-built search haystack used for client-side matching.
type PoolResult = SearchResult & { haystack: string }

function useUnifiedSearch() {
  return useQuery({
    queryKey: ['social-media-search-pool'],
    queryFn: async () => {
      const results: PoolResult[] = []

      // Items — brand/model can live on the item row OR product_models; include both.
      {
        const buildItemsQuery = () => supabase
          .from('items')
          .select(`
            id, item_code, product_id, condition_grade, brand, model_name,
            product_models(brand, model_name, color, short_description, product_media(file_url, sort_order)),
            item_media(file_url, thumbnail_url, sort_order)
          `)
          .order('item_code', { ascending: false })
        type ItemRow = NonNullable<Awaited<ReturnType<typeof buildItemsQuery>>['data']>[number]
        const items = await fetchAllPages<ItemRow>((from, to) => buildItemsQuery().range(from, to))
        for (const item of items) {
            const pm = item.product_models as unknown as {
              brand: string | null
              model_name: string | null
              color: string | null
              short_description: string | null
              product_media: { file_url: string; sort_order: number }[]
            } | null
            const itemMedia = item.item_media as unknown as {
              file_url: string; thumbnail_url: string | null; sort_order: number
            }[] | null

            // Thumbnail: item_media thumb → product_media first image
            const thumb = itemMedia?.[0]?.thumbnail_url
              ?? itemMedia?.[0]?.file_url
              ?? pm?.product_media?.[0]?.file_url
              ?? null

            const brand = item.brand ?? pm?.brand
            const modelName = item.model_name ?? pm?.model_name
            const label = [brand, modelName].filter(Boolean).join(' ') || 'Unknown'

            results.push({
              id: item.id,
              code: item.item_code,
              type: 'item',
              label,
              sublabel: pm?.short_description ?? null,
              thumbnail_url: thumb,
              grade: item.condition_grade,
              product_id: item.product_id,
              accessory_id: null,
              haystack: [item.item_code, brand, modelName, pm?.color, pm?.short_description].filter(Boolean).join(' '),
            })
        }
      }

      // Accessories — page the full active set for client-side matching
      {
        const buildAccQuery = () => supabase
          .from('accessories')
          .select('id, accessory_code, name, brand, accessory_media(file_url, sort_order)')
          .eq('active', true)
          .order('accessory_code', { ascending: false })
        type AccRow = NonNullable<Awaited<ReturnType<typeof buildAccQuery>>['data']>[number]
        const accessories = await fetchAllPages<AccRow>((from, to) => buildAccQuery().range(from, to))
        for (const acc of accessories) {
            const media = acc.accessory_media as unknown as { file_url: string; sort_order: number }[] | null
            results.push({
              id: acc.id,
              code: acc.accessory_code,
              type: 'accessory',
              label: acc.name,
              sublabel: acc.brand,
              thumbnail_url: media?.[0]?.file_url ?? null,
              grade: null,
              product_id: null,
              accessory_id: acc.id,
              haystack: [acc.accessory_code, acc.name, acc.brand].filter(Boolean).join(' '),
            })
        }
      }

      // Sell groups — small table, pull the full active set for client-side matching
      {
        const query = supabase
          .from('sell_groups')
          .select(`
            id, sell_group_code, product_id, condition_grade, discount_amount,
            product_models(brand, model_name, short_description, product_media(file_url, sort_order)),
            sell_group_items(items(selling_price))
          `)
          .eq('active', true)
          .order('sell_group_code', { ascending: false })
          .limit(1000)

        const { data: sellGroups } = await query
        if (sellGroups) {
          for (const sg of sellGroups) {
            const pm = sg.product_models as unknown as {
              brand: string; model_name: string; short_description: string | null
              product_media: { file_url: string; sort_order: number }[]
            } | null
            const sgItems = (sg.sell_group_items ?? []) as Array<{ items: { selling_price: number | null } | null }>
            const repSp = sgItems.map(s => s.items?.selling_price).find(p => p != null)
            const effectivePrice = repSp != null ? Math.max(0, Number(repSp) - Number(sg.discount_amount ?? 0)) : null

            results.push({
              id: sg.id,
              code: sg.sell_group_code,
              type: 'sell_group',
              label: pm ? `${pm.brand} ${pm.model_name}` : 'Unknown',
              sublabel: effectivePrice != null ? `¥${effectivePrice.toLocaleString()}` : pm?.short_description ?? null,
              thumbnail_url: pm?.product_media?.[0]?.file_url ?? null,
              grade: sg.condition_grade,
              product_id: sg.product_id,
              accessory_id: null,
              haystack: [sg.sell_group_code, pm?.brand, pm?.model_name, pm?.short_description].filter(Boolean).join(' '),
            })
          }
        }
      }

      return results
    },
    staleTime: 10_000,
  })
}

const typeLabels: Record<SearchResultType, string> = {
  item: 'Item',
  accessory: 'Accessory',
  sell_group: 'Sell Group',
}

export function ItemSearchInput({ value, selectedLabel, onSelect }: ItemSearchInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: pool = [] } = useUnifiedSearch()

  // Separator-insensitive fuzzy filter over the complete cached pool; cap the displayed
  // rows PER TYPE so the list stays light and every type stays represented (empty query →
  // browse the most recent DISPLAY_LIMIT of each).
  const results = useMemo(() => {
    const term = search.trim()
    const matched = term ? pool.filter((r) => searchMatches(r.haystack, term)) : pool
    const perType: Record<SearchResultType, number> = { item: 0, accessory: 0, sell_group: 0 }
    return matched.filter((r) => (perType[r.type] < DISPLAY_LIMIT ? (perType[r.type]++, true) : false))
  }, [pool, search])

  const displayLabel = selectedLabel ?? 'Search by code or description...'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search P-code, G-code, accessory, or description..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {(['item', 'accessory', 'sell_group'] as SearchResultType[]).map((type) => {
              const grouped = results.filter((r) => r.type === type)
              if (grouped.length === 0) return null
              return (
                <CommandGroup key={type} heading={typeLabels[type] + 's'}>
                  {grouped.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => {
                        onSelect(result)
                        setOpen(false)
                      }}
                      className="flex items-center gap-2 py-2"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          value === result.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {/* Thumbnail */}
                      <div className="h-9 w-9 shrink-0 rounded bg-muted overflow-hidden">
                        {result.thumbnail_url ? (
                          <img src={result.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center">
                            {result.type === 'item' && <Package className="h-4 w-4 text-muted-foreground" />}
                            {result.type === 'accessory' && <Puzzle className="h-4 w-4 text-muted-foreground" />}
                            {result.type === 'sell_group' && <ShoppingBag className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        )}
                      </div>
                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm shrink-0">{result.code}</span>
                          <span className="text-sm truncate">{result.label}</span>
                          {result.grade && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {result.grade}
                            </Badge>
                          )}
                        </div>
                        {result.sublabel && (
                          <p className="text-xs text-muted-foreground truncate">{result.sublabel}</p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
