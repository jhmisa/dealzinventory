import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
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

interface ItemOption {
  id: string
  item_code: string
  product_id: string | null
  brand: string | null
  model_name: string | null
  condition_grade: string | null
}

interface ItemSearchInputProps {
  value: string | undefined
  onSelect: (item: ItemOption) => void
}

function useItemSearch(search: string) {
  return useQuery({
    queryKey: ['item-search', search],
    queryFn: async () => {
      let query = supabase
        .from('items')
        .select('id, item_code, product_id, condition_grade, product_models(brand, model_name)')
        .in('status', ['AVAILABLE', 'INTAKE'])
        .order('item_code', { ascending: false })
        .limit(20)

      if (search) {
        query = query.ilike('item_code', `%${search}%`)
      }

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((item) => {
        const pm = item.product_models as unknown as { brand: string; model_name: string } | null
        return {
          id: item.id,
          item_code: item.item_code,
          product_id: item.product_id,
          brand: pm?.brand ?? null,
          model_name: pm?.model_name ?? null,
          condition_grade: item.condition_grade,
        } satisfies ItemOption
      })
    },
    staleTime: 10_000,
  })
}

export function ItemSearchInput({ value, onSelect }: ItemSearchInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: items = [] } = useItemSearch(search)

  const selected = items.find((i) => i.id === value)
  const displayLabel = selected
    ? `${selected.item_code} — ${selected.brand ?? ''} ${selected.model_name ?? ''}`
    : 'Select item...'

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
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search P-code..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onSelect(item)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === item.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="font-mono text-sm">{item.item_code}</span>
                  <span className="ml-2 text-muted-foreground text-sm truncate">
                    {item.brand} {item.model_name}
                  </span>
                  {item.condition_grade && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      Grade {item.condition_grade}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
