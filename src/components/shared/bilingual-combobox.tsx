import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface BilingualOption {
  ja: string
  en: string
  /** Optional metadata threaded back through onChange — the combobox doesn't read this. */
  postal_code?: string | null
  raw_ja?: string
  raw_en?: string
}

interface BilingualComboboxProps<T extends BilingualOption = BilingualOption> {
  options: T[]
  /** Selected value, matched against `ja`. */
  value: string
  onChange: (option: T) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  loading?: boolean
}

/**
 * Searchable two-line dropdown showing English (large) over Japanese (muted).
 * Filters on BOTH languages — typing "to" surfaces TOKYO, TOTTORI, TOCHIGI;
 * typing "渋" narrows to 渋谷区.
 */
export function BilingualCombobox<T extends BilingualOption>({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  disabled,
  loading,
}: BilingualComboboxProps<T>) {
  const [open, setOpen] = useState(false)

  const selected = useMemo(
    () => options.find((o) => o.ja === value) ?? null,
    [options, value],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'w-full justify-between font-normal',
            // Tall trigger to fit the two-line label
            selected ? 'h-auto py-2' : 'h-9',
          )}
        >
          {selected ? (
            <span className="flex flex-col items-start text-left">
              <span className="text-sm">{selected.en}</span>
              <span className="text-xs text-muted-foreground">{selected.ja}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              {loading ? 'Loading…' : placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          // Substring match on both EN and JA — so "to" hits TOKYO + TOTTORI,
          // and "渋" hits 渋谷区. cmdk's default fuzzy scoring is too aggressive
          // (it skips characters and reorders), so we lock it to true substring.
          filter={(itemValue, search) => {
            if (!search) return 1
            const needle = search.toLowerCase().trim()
            // itemValue is the stringified `value` prop on CommandItem.
            return itemValue.toLowerCase().includes(needle) ? 1 : 0
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = option.ja === value
                // Join EN and JA into the value so both substring-match in the filter.
                // Use a space separator (newlines get treated oddly by cmdk's normalization).
                return (
                  <CommandItem
                    key={option.ja}
                    value={`${option.en} ${option.ja}`}
                    onSelect={() => {
                      onChange(option)
                      setOpen(false)
                    }}
                    className="flex items-start gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{option.en}</div>
                      <div className="text-xs text-muted-foreground">{option.ja}</div>
                    </div>
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
