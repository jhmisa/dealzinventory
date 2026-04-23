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

      // Step 1: If searching by description, find matching product_model IDs first
      // (PostgREST can't .or() across joins)
      let matchingProductIds: string[] = []
      if (term && !/^[PGC]/.test(term.toUpperCase())) {
        const { data: matchingProducts } = await supabase
          .from('product_models')
          .select('id')
          .or(`brand.ilike.%${term}%,model_name.ilike.%${term}%`)
          .limit(50)

        matchingProductIds = (matchingProducts ?? []).map((p) => p.id)
      }

      // Step 2: Search items — by item_code OR matching product IDs
      {
        let query = supabase
          .from('items')
          .select('id, item_code, product_id, condition_grade, product_models(brand, model_name)')
          .order('item_code', { ascending: false })
          .limit(10)

        if (term) {
          if (matchingProductIds.length > 0) {
            query = query.or(`item_code.ilike.%${term}%,product_id.in.(${matchingProductIds.join(',')})`)
          } else {
            query = query.ilike('item_code', `%${term}%`)
          }
        }

        const { data: items } = await query
        if (items) {
          for (const item of items) {
            const pm = item.product_models as unknown as { brand: string; model_name: string } | null
            results.push({
              id: item.id,
              code: item.item_code,
              type: 'item',
              label: pm ? `${pm.brand} ${pm.model_name}` : 'Unknown product',
              sublabel: null,
              grade: item.condition_grade,
              product_id: item.product_id,
              accessory_id: null,
            })
          }
        }
      }

      // Step 3: Search accessories — by accessory_code OR name/brand (same table, no join issue)
      {
        let query = supabase
          .from('accessories')
          .select('id, accessory_code, name, brand')
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
            results.push({
              id: acc.id,
              code: acc.accessory_code,
              type: 'accessory',
              label: acc.name,
              sublabel: acc.brand,
              grade: null,
              product_id: null,
              accessory_id: acc.id,
            })
          }
        }
      }

      // Step 4: Search sell groups — by sell_group_code OR matching product IDs
      {
        let query = supabase
          .from('sell_groups')
          .select('id, sell_group_code, product_id, selling_price, condition_grade, product_models(brand, model_name)')
          .eq('active', true)
          .order('sell_group_code', { ascending: false })
          .limit(10)

        if (term) {
          if (matchingProductIds.length > 0) {
            query = query.or(`sell_group_code.ilike.%${term}%,product_id.in.(${matchingProductIds.join(',')})`)
          } else {
            query = query.ilike('sell_group_code', `%${term}%`)
          }
        }

        const { data: sellGroups } = await query
        if (sellGroups) {
          for (const sg of sellGroups) {
            const pm = sg.product_models as unknown as { brand: string; model_name: string } | null
            results.push({
              id: sg.id,
              code: sg.sell_group_code,
              type: 'sell_group',
              label: pm ? `${pm.brand} ${pm.model_name}` : 'Unknown product',
              sublabel: sg.selling_price ? `¥${sg.selling_price.toLocaleString()}` : null,
              grade: sg.condition_grade,
              product_id: sg.product_id,
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

const typeIcons: Record<SearchResultType, typeof Package> = {
  item: Package,
  accessory: Puzzle,
  sell_group: ShoppingBag,
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
      <PopoverContent className="w-[460px] p-0" align="start">
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
              const Icon = typeIcons[type]
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
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === result.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-sm shrink-0">{result.code}</span>
                      <span className="ml-2 text-muted-foreground text-sm truncate">
                        {result.label}
                      </span>
                      {result.sublabel && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {result.sublabel}
                        </span>
                      )}
                      {result.grade && (
                        <Badge variant="outline" className="ml-auto text-[10px] shrink-0">
                          {result.grade}
                        </Badge>
                      )}
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
