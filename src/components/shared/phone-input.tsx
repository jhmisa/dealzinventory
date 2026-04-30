// src/components/shared/phone-input.tsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  COUNTRIES,
  getCountry,
  parseE164,
  toE164,
  formatNationalDigits,
  type CountryPhone,
} from '@/lib/phone'

interface PhoneInputProps {
  value: string
  onChange: (e164: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const parsed = value ? parseE164(value) : null
  const [selectedCountry, setSelectedCountry] = useState<string>(
    parsed?.countryCode ?? 'JP'
  )
  const [nationalDigits, setNationalDigits] = useState<string>(
    parsed?.nationalDigits ?? ''
  )

  useEffect(() => {
    if (!value) {
      setNationalDigits('')
      return
    }
    const p = parseE164(value)
    if (p) {
      setSelectedCountry(p.countryCode)
      setNationalDigits(p.nationalDigits)
    } else {
      setNationalDigits(value.replace(/[^\d]/g, ''))
    }
  }, [value])

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0)
    } else {
      setSearch('')
    }
  }, [open])

  const country = getCountry(selectedCountry)

  function handleCountrySelect(c: CountryPhone) {
    setSelectedCountry(c.code)
    setOpen(false)
    if (nationalDigits) {
      onChange(toE164(c.code, nationalDigits))
    }
  }

  function handleDigitsChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, '')
    setNationalDigits(digits)
    if (digits) {
      onChange(toE164(selectedCountry, digits))
    } else {
      onChange('')
    }
  }

  const filtered = search
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.dial.includes(search) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES

  const displayDigits = formatNationalDigits(selectedCountry, nationalDigits)

  return (
    <div className={cn('flex gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'flex items-center gap-1 rounded-md border border-input bg-background px-2 py-2 text-sm',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'shrink-0'
            )}
          >
            <span>{country?.flag}</span>
            <span className="text-muted-foreground text-xs">{country?.dial}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground mr-2" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleCountrySelect(c)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent',
                  c.code === selectedCountry && 'bg-accent'
                )}
              >
                <span>{c.flag}</span>
                <span className="flex-1 text-left">{c.name}</span>
                <span className="text-muted-foreground text-xs">{c.dial}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No countries found
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Input
        type="tel"
        value={displayDigits}
        onChange={(e) => handleDigitsChange(e.target.value)}
        placeholder={placeholder ?? (country?.code === 'JP' ? '90-1234-5678' : '')}
        disabled={disabled}
        className="flex-1"
      />
    </div>
  )
}
