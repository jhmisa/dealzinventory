import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Package, ShoppingBag, Puzzle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
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

function useUnifiedSearch(search: string) {
  return useQuery({
    queryKey: ['social-media-search', search],
    queryFn: async () => {
      const term = search.trim()
      const results: SearchResult[] = []

      // Search items — items have brand/model_name directly on the row
      {
        let query = supabase
          .from('items')
          .select(`
            id, item_code, product_id, condition_grade, brand, model_name,
            product_models(short_description, product_media(file_url, sort_order)),
            item_media(file_url, thumbnail_url, sort_order)
          `)
          .order('item_code', { ascending: false })
          .limit(10)

        if (term) {
          query = query.or(
            `item_code.ilike.%${term}%,brand.ilike.%${term}%,model_name.ilike.%${term}%`
          )
        }

        const { data: items } = await query
        if (items) {
          for (const item of items) {
            const pm = item.product_models as unknown as {
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

            const label = [item.brand, item.model_name].filter(Boolean).join(' ') || 'Unknown'

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
            })
          }
        }
      }

      // Search accessories — accessory_code, name, or brand
      {
        let query = supabase
          .from('accessories')
          .select('id, accessory_code, name, brand, accessory_media(file_url, sort_order)')
          .eq('active', true)
          .order('accessory_code', { ascending: false })
          .limit(10)

        if (term) {
          query = query.or(
            `accessory_code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`
          )
        }

        const { data: accessories } = await query
        if (accessories) {
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
            })
          }
        }
      }

      // Search sell groups — by code or product description
      {
        // Find matching photo_group IDs for description search (via product_models)
        let matchingPhotoGroupIds: string[] = []
        if (term && !/^[PGA]/i.test(term)) {
          const { data: matchingProducts } = await supabase
            .from('product_models')
            .select('id')
            .or(`brand.ilike.%${term}%,model_name.ilike.%${term}%`)
            .limit(50)
          const productIds = (matchingProducts ?? []).map((p) => p.id)
          if (productIds.length > 0) {
            const { data: matchingPGs } = await supabase
              .from('photo_groups')
              .select('id')
              .in('product_model_id', productIds)
              .limit(50)
            matchingPhotoGroupIds = (matchingPGs ?? []).map((pg) => pg.id)
          }
        }

        let query = supabase
          .from('sell_groups')
          .select(`
            id, sell_group_code, condition_grade, base_price,
            photo_groups(product_model_id, product_models(brand, model_name, short_description, product_media(file_url, sort_order)))
          `)
          .eq('active', true)
          .order('sell_group_code', { ascending: false })
          .limit(10)

        if (term) {
          if (matchingPhotoGroupIds.length > 0) {
            query = query.or(`sell_group_code.ilike.%${term}%,photo_group_id.in.(${matchingPhotoGroupIds.join(',')})`)
          } else {
            query = query.ilike('sell_group_code', `%${term}%`)
          }
        }

        const { data: sellGroups } = await query
        if (sellGroups) {
          for (const sg of sellGroups) {
            const pg = sg.photo_groups as unknown as {
              product_model_id: string | null
              product_models: {
                brand: string; model_name: string; short_description: string | null
                product_media: { file_url: string; sort_order: number }[]
              } | null
            } | null
            const pm = pg?.product_models ?? null

            results.push({
              id: sg.id,
              code: sg.sell_group_code,
              type: 'sell_group',
              label: pm ? `${pm.brand} ${pm.model_name}` : 'Unknown',
              sublabel: sg.base_price ? `¥${sg.base_price.toLocaleString()}` : pm?.short_description ?? null,
              thumbnail_url: pm?.product_media?.[0]?.file_url ?? null,
              grade: sg.condition_grade,
              product_id: pg?.product_model_id ?? null,
              accessory_id: null,
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
  const { data: results = [] } = useUnifiedSearch(search)

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
