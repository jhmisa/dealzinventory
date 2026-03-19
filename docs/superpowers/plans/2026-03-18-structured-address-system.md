# Structured Address System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain-text `shipping_address` with structured JSONB supporting dual-language JP addresses and WooCommerce-style international addresses, with postal code auto-fill from Japan Post data.

**Architecture:** JSONB column on `customers` table stores typed address objects (JP with dual-language fields, or international WooCommerce-style). A shared `AddressForm` component handles input across all pages. A `postal_codes` lookup table enables auto-fill from postal code. Orders keep text snapshots via `serializeAddress()`.

**Tech Stack:** React 18, TypeScript, Zod, React Hook Form, TanStack Query, Supabase (PostgreSQL + Edge Functions), Tailwind CSS, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-18-structured-address-system-design.md`

---

## Chunk 1: Foundation (Types, Constants, Validators, Migration)

### Task 1: Create address types and serialize utility

**Files:**
- Create: `src/lib/address-types.ts`

- [ ] **Step 1: Create `src/lib/address-types.ts`**

```typescript
// Structured address types for JSONB storage

export interface ShippingAddressJP {
  country: 'JP'
  postal_code: string
  prefecture_ja: string
  prefecture_en: string
  city_ja: string
  city_en: string
  town_ja?: string
  town_en?: string
  address_line_1: string
  address_line_2?: string
}

export interface ShippingAddressIntl {
  country: string // ISO 3166-1 alpha-2, never 'JP'
  address_line_1: string
  address_line_2?: string
  city: string
  state?: string
  postal_code: string
}

export interface ShippingAddressLegacy {
  country: string
  freeform_legacy: string
}

export type ShippingAddress = ShippingAddressJP | ShippingAddressIntl | ShippingAddressLegacy

// Type guards
export function isJPAddress(addr: ShippingAddress): addr is ShippingAddressJP {
  return addr.country === 'JP' && !('freeform_legacy' in addr)
}

export function isIntlAddress(addr: ShippingAddress): addr is ShippingAddressIntl {
  return addr.country !== 'JP' && !('freeform_legacy' in addr)
}

export function isLegacyAddress(addr: ShippingAddress): addr is ShippingAddressLegacy {
  return 'freeform_legacy' in addr
}

// Serialize JSONB address to text for order snapshots
export function serializeAddress(addr: ShippingAddress): string {
  if (isLegacyAddress(addr)) {
    return addr.freeform_legacy
  }

  if (isJPAddress(addr)) {
    const parts: string[] = []
    if (addr.postal_code) parts.push(`〒${formatPostalCode(addr.postal_code)}`)
    const prefCityTown = [addr.prefecture_ja, addr.city_ja, addr.town_ja].filter(Boolean).join(' ')
    if (prefCityTown) parts.push(prefCityTown)
    if (addr.address_line_1) parts.push(addr.address_line_1)
    if (addr.address_line_2) parts.push(addr.address_line_2)
    return parts.join('\n')
  }

  // International
  const intl = addr as ShippingAddressIntl
  const parts: string[] = []
  if (intl.address_line_1) parts.push(intl.address_line_1)
  if (intl.address_line_2) parts.push(intl.address_line_2)
  const cityState = [intl.city, intl.state].filter(Boolean).join(', ')
  const cityLine = [cityState, intl.postal_code].filter(Boolean).join(' ')
  if (cityLine) parts.push(cityLine)
  parts.push(intl.country)
  return parts.join('\n')
}

// Format postal code: 1500041 → 150-0041
export function formatPostalCode(code: string): string {
  const digits = code.replace(/-/g, '')
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return code
}

// Auto-uppercase English fields on save
export function uppercaseAddress(addr: ShippingAddress): ShippingAddress {
  if (isJPAddress(addr)) {
    return {
      ...addr,
      prefecture_en: addr.prefecture_en.toUpperCase(),
      city_en: addr.city_en.toUpperCase(),
      town_en: addr.town_en ? addr.town_en.toUpperCase() : undefined,
      // address_line_1/2 NOT uppercased (may contain kanji)
    }
  }

  if (isIntlAddress(addr)) {
    return {
      ...addr,
      address_line_1: addr.address_line_1.toUpperCase(),
      address_line_2: addr.address_line_2?.toUpperCase(),
      city: addr.city.toUpperCase(),
      state: addr.state?.toUpperCase(),
      postal_code: addr.postal_code.toUpperCase(),
    }
  }

  return addr
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/lib/address-types.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/address-types.ts
git commit -m "feat: add ShippingAddress types and serialize utility"
```

---

### Task 2: Create Japan prefectures constant

**Files:**
- Create: `src/lib/prefectures.ts`

- [ ] **Step 1: Create `src/lib/prefectures.ts`**

```typescript
export const JAPAN_PREFECTURES = [
  { ja: '北海道', en: 'HOKKAIDO' },
  { ja: '青森県', en: 'AOMORI' },
  { ja: '岩手県', en: 'IWATE' },
  { ja: '宮城県', en: 'MIYAGI' },
  { ja: '秋田県', en: 'AKITA' },
  { ja: '山形県', en: 'YAMAGATA' },
  { ja: '福島県', en: 'FUKUSHIMA' },
  { ja: '茨城県', en: 'IBARAKI' },
  { ja: '栃木県', en: 'TOCHIGI' },
  { ja: '群馬県', en: 'GUNMA' },
  { ja: '埼玉県', en: 'SAITAMA' },
  { ja: '千葉県', en: 'CHIBA' },
  { ja: '東京都', en: 'TOKYO' },
  { ja: '神奈川県', en: 'KANAGAWA' },
  { ja: '新潟県', en: 'NIIGATA' },
  { ja: '富山県', en: 'TOYAMA' },
  { ja: '石川県', en: 'ISHIKAWA' },
  { ja: '福井県', en: 'FUKUI' },
  { ja: '山梨県', en: 'YAMANASHI' },
  { ja: '長野県', en: 'NAGANO' },
  { ja: '岐阜県', en: 'GIFU' },
  { ja: '静岡県', en: 'SHIZUOKA' },
  { ja: '愛知県', en: 'AICHI' },
  { ja: '三重県', en: 'MIE' },
  { ja: '滋賀県', en: 'SHIGA' },
  { ja: '京都府', en: 'KYOTO' },
  { ja: '大阪府', en: 'OSAKA' },
  { ja: '兵庫県', en: 'HYOGO' },
  { ja: '奈良県', en: 'NARA' },
  { ja: '和歌山県', en: 'WAKAYAMA' },
  { ja: '鳥取県', en: 'TOTTORI' },
  { ja: '島根県', en: 'SHIMANE' },
  { ja: '岡山県', en: 'OKAYAMA' },
  { ja: '広島県', en: 'HIROSHIMA' },
  { ja: '山口県', en: 'YAMAGUCHI' },
  { ja: '徳島県', en: 'TOKUSHIMA' },
  { ja: '香川県', en: 'KAGAWA' },
  { ja: '愛媛県', en: 'EHIME' },
  { ja: '高知県', en: 'KOCHI' },
  { ja: '福岡県', en: 'FUKUOKA' },
  { ja: '佐賀県', en: 'SAGA' },
  { ja: '長崎県', en: 'NAGASAKI' },
  { ja: '熊本県', en: 'KUMAMOTO' },
  { ja: '大分県', en: 'OITA' },
  { ja: '宮崎県', en: 'MIYAZAKI' },
  { ja: '鹿児島県', en: 'KAGOSHIMA' },
  { ja: '沖縄県', en: 'OKINAWA' },
] as const

export type Prefecture = (typeof JAPAN_PREFECTURES)[number]

// Lookup helpers
export function getPrefectureEn(ja: string): string {
  return JAPAN_PREFECTURES.find(p => p.ja === ja)?.en ?? ja.toUpperCase()
}

export function getPrefectureJa(en: string): string {
  return JAPAN_PREFECTURES.find(p => p.en === en.toUpperCase())?.ja ?? en
}

// Common international shipping countries (JP first, then alphabetical common destinations)
export const SHIPPING_COUNTRIES = [
  { code: 'JP', name: 'Japan' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'CN', name: 'China' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'KR', name: 'South Korea' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
] as const
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/prefectures.ts
git commit -m "feat: add Japan prefectures map and shipping countries"
```

---

### Task 3: Create address Zod validators

**Files:**
- Create: `src/validators/address.ts`

- [ ] **Step 1: Create `src/validators/address.ts`**

```typescript
import { z } from 'zod'

export const shippingAddressJPSchema = z.object({
  country: z.literal('JP'),
  postal_code: z.string().min(1, 'Postal code is required'),
  prefecture_ja: z.string().min(1, 'Prefecture is required'),
  prefecture_en: z.string().min(1),
  city_ja: z.string().min(1, 'City is required'),
  city_en: z.string().min(1, 'City (English) is required'),
  town_ja: z.string().optional().or(z.literal('')),
  town_en: z.string().optional().or(z.literal('')),
  address_line_1: z.string().min(1, 'Address is required'),
  address_line_2: z.string().optional().or(z.literal('')),
})

export const shippingAddressIntlSchema = z.object({
  country: z.string().length(2, 'Country is required').refine(c => c !== 'JP', 'Use JP address form for Japan'),
  address_line_1: z.string().min(1, 'Address is required'),
  address_line_2: z.string().optional().or(z.literal('')),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional().or(z.literal('')),
  postal_code: z.string().min(1, 'Postal code is required'),
})

export const shippingAddressLegacySchema = z.object({
  country: z.string(),
  freeform_legacy: z.string(),
})

// Union schema — validates based on country field
export const shippingAddressSchema = z.union([
  shippingAddressJPSchema,
  shippingAddressIntlSchema,
  shippingAddressLegacySchema,
])

export type ShippingAddressJPFormValues = z.infer<typeof shippingAddressJPSchema>
export type ShippingAddressIntlFormValues = z.infer<typeof shippingAddressIntlSchema>
export type ShippingAddressFormValues = z.infer<typeof shippingAddressSchema>
```

- [ ] **Step 2: Update `src/validators/customer.ts`** — change `shipping_address` from string to optional address object

In `adminCreateCustomerSchema`, replace:
```typescript
shipping_address: z.string().optional().or(z.literal('')),
```
with:
```typescript
shipping_address: shippingAddressSchema.nullable().optional(),
```

Add import at top:
```typescript
import { shippingAddressSchema } from './address'
```

Do the same for `customerProfileSchema` and `customerRegisterSchema`.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 4: Commit**

```bash
git add src/validators/address.ts src/validators/customer.ts
git commit -m "feat: add address Zod schemas and update customer validators"
```

---

### Task 4: Database migration — postal_codes table + shipping_address JSONB

**Files:**
- Create: `supabase/migrations/20260318000001_postal_codes_table.sql`
- Create: `supabase/migrations/20260318000002_shipping_address_jsonb.sql`

- [ ] **Step 1: Create `supabase/migrations/20260318000001_postal_codes_table.sql`**

```sql
-- Postal codes lookup table (seeded from Japan Post CSV data)
CREATE TABLE postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postal_code text NOT NULL,
  prefecture_ja text NOT NULL,
  prefecture_en text NOT NULL,
  city_ja text NOT NULL,
  city_en text NOT NULL,
  town_ja text NOT NULL DEFAULT '',
  town_en text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_postal_codes_code ON postal_codes(postal_code);

-- RLS: anyone can read, only service_role can write
ALTER TABLE postal_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read postal codes"
  ON postal_codes FOR SELECT
  USING (true);
```

- [ ] **Step 2: Create `supabase/migrations/20260318000002_shipping_address_jsonb.sql`**

```sql
-- Convert customers.shipping_address from text to jsonb
-- Existing data preserved in freeform_legacy wrapper
ALTER TABLE customers
  ALTER COLUMN shipping_address TYPE jsonb USING
    CASE
      WHEN shipping_address IS NOT NULL AND shipping_address != ''
      THEN jsonb_build_object('country', 'JP', 'freeform_legacy', shipping_address)
      ELSE NULL
    END;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add postal_codes table and convert shipping_address to jsonb"
```

---

### Task 5: Postal code service and hook

**Files:**
- Create: `src/services/postal-codes.ts`
- Create: `src/hooks/use-postal-codes.ts`
- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add postal codes query key to `src/lib/query-keys.ts`**

Add after the `aiPrompts` block:
```typescript
postalCodes: {
  all: ['postal-codes'] as const,
  lookup: (code: string) => ['postal-codes', 'lookup', code] as const,
},
```

- [ ] **Step 2: Create `src/services/postal-codes.ts`**

```typescript
import { supabase } from '@/lib/supabase'

export interface PostalCodeEntry {
  id: string
  postal_code: string
  prefecture_ja: string
  prefecture_en: string
  city_ja: string
  city_en: string
  town_ja: string
  town_en: string
}

export async function lookupPostalCode(code: string): Promise<PostalCodeEntry[]> {
  const normalized = code.replace(/-/g, '')
  if (normalized.length !== 7) return []

  const { data, error } = await supabase
    .from('postal_codes')
    .select('*')
    .eq('postal_code', normalized)

  if (error) throw error
  return (data ?? []) as PostalCodeEntry[]
}

export async function getPostalCodeStats() {
  const { count, error } = await supabase
    .from('postal_codes')
    .select('*', { count: 'exact', head: true })

  if (error) throw error
  return { totalRows: count ?? 0 }
}
```

- [ ] **Step 3: Create `src/hooks/use-postal-codes.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import * as postalCodesService from '@/services/postal-codes'

export function usePostalCodeLookup(code: string) {
  const normalized = code.replace(/-/g, '')
  return useQuery({
    queryKey: queryKeys.postalCodes.lookup(normalized),
    queryFn: () => postalCodesService.lookupPostalCode(normalized),
    enabled: normalized.length === 7,
    staleTime: Infinity, // Postal codes rarely change
  })
}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 5: Commit**

```bash
git add src/services/postal-codes.ts src/hooks/use-postal-codes.ts src/lib/query-keys.ts
git commit -m "feat: add postal code lookup service and hook"
```

---

## Chunk 2: Shared UI Components

### Task 6: Create AddressForm component

**Files:**
- Create: `src/components/shared/address-form.tsx`
- Modify: `src/components/shared/index.ts`

- [ ] **Step 1: Create `src/components/shared/address-form.tsx`**

This is a controlled component. It takes `value` and `onChange` props, managing its own internal state for the country toggle and structured fields. When JP is selected, postal code auto-fill queries the `postal_codes` table.

```typescript
import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { JAPAN_PREFECTURES, SHIPPING_COUNTRIES } from '@/lib/prefectures'
import { usePostalCodeLookup } from '@/hooks/use-postal-codes'
import type { ShippingAddress, ShippingAddressJP, ShippingAddressIntl } from '@/lib/address-types'
import { isJPAddress, isIntlAddress, isLegacyAddress } from '@/lib/address-types'

interface AddressFormProps {
  value: ShippingAddress | null
  onChange: (address: ShippingAddress | null) => void
  required?: boolean
}

export function AddressForm({ value, onChange, required = false }: AddressFormProps) {
  // Determine initial country from value
  const initialCountry = value?.country === 'JP' || !value ? 'JP' : value.country
  const [country, setCountry] = useState(initialCountry)

  // JP address fields
  const [postalCode, setPostalCode] = useState('')
  const [prefectureJa, setPrefectureJa] = useState('')
  const [prefectureEn, setPrefectureEn] = useState('')
  const [cityJa, setCityJa] = useState('')
  const [cityEn, setCityEn] = useState('')
  const [townJa, setTownJa] = useState('')
  const [townEn, setTownEn] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')

  // Intl address fields
  const [intlLine1, setIntlLine1] = useState('')
  const [intlLine2, setIntlLine2] = useState('')
  const [intlCity, setIntlCity] = useState('')
  const [intlState, setIntlState] = useState('')
  const [intlPostalCode, setIntlPostalCode] = useState('')

  // Postal code lookup
  const { data: postalResults } = usePostalCodeLookup(postalCode)
  const [hasAutoFilled, setHasAutoFilled] = useState(false)

  // Initialize from value prop
  useEffect(() => {
    if (!value) return
    if (isJPAddress(value)) {
      setCountry('JP')
      setPostalCode(value.postal_code)
      setPrefectureJa(value.prefecture_ja)
      setPrefectureEn(value.prefecture_en)
      setCityJa(value.city_ja)
      setCityEn(value.city_en)
      setTownJa(value.town_ja)
      setTownEn(value.town_en)
      setAddressLine1(value.address_line_1)
      setAddressLine2(value.address_line_2 ?? '')
    } else if (isIntlAddress(value)) {
      setCountry(value.country)
      setIntlLine1(value.address_line_1)
      setIntlLine2(value.address_line_2 ?? '')
      setIntlCity(value.city)
      setIntlState(value.state ?? '')
      setIntlPostalCode(value.postal_code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  // Auto-fill from postal code lookup
  useEffect(() => {
    if (!postalResults?.length || hasAutoFilled) return
    const match = postalResults[0]
    setPrefectureJa(match.prefecture_ja)
    setPrefectureEn(match.prefecture_en)
    setCityJa(match.city_ja)
    setCityEn(match.city_en)
    if (postalResults.length === 1) {
      setTownJa(match.town_ja)
      setTownEn(match.town_en)
    }
    setHasAutoFilled(true)
  }, [postalResults, hasAutoFilled])

  // Reset auto-fill flag when postal code changes
  const handlePostalCodeChange = useCallback((val: string) => {
    setPostalCode(val)
    setHasAutoFilled(false)
  }, [])

  // Emit address on any field change
  const emitJP = useCallback(() => {
    if (!postalCode && !prefectureJa && !addressLine1 && !required) {
      onChange(null)
      return
    }
    const addr: ShippingAddressJP = {
      country: 'JP',
      postal_code: postalCode.replace(/-/g, ''),
      prefecture_ja: prefectureJa,
      prefecture_en: prefectureEn,
      city_ja: cityJa,
      city_en: cityEn.toUpperCase(),
      town_ja: townJa,
      town_en: townEn.toUpperCase(),
      address_line_1: addressLine1,
      address_line_2: addressLine2 || undefined,
    }
    onChange(addr)
  }, [postalCode, prefectureJa, prefectureEn, cityJa, cityEn, townJa, townEn, addressLine1, addressLine2, required, onChange])

  const emitIntl = useCallback(() => {
    if (!intlLine1 && !intlCity && !required) {
      onChange(null)
      return
    }
    const addr: ShippingAddressIntl = {
      country,
      address_line_1: intlLine1.toUpperCase(),
      address_line_2: intlLine2 ? intlLine2.toUpperCase() : undefined,
      city: intlCity.toUpperCase(),
      state: intlState ? intlState.toUpperCase() : undefined,
      postal_code: intlPostalCode.toUpperCase(),
    }
    onChange(addr)
  }, [country, intlLine1, intlLine2, intlCity, intlState, intlPostalCode, required, onChange])

  // Emit on blur (not on every keystroke)
  const handleBlurJP = () => emitJP()
  const handleBlurIntl = () => emitIntl()

  // Handle prefecture selection
  function handlePrefectureChange(ja: string) {
    setPrefectureJa(ja)
    const match = JAPAN_PREFECTURES.find(p => p.ja === ja)
    if (match) setPrefectureEn(match.en)
  }

  // Handle country change
  function handleCountryChange(newCountry: string) {
    setCountry(newCountry)
    onChange(null) // Reset address when switching countries
  }

  // Legacy address display with re-entry option
  if (value && isLegacyAddress(value)) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Shipping Address (Legacy)</Label>
        <div className="rounded-lg border p-3 bg-muted/50">
          <p className="text-sm whitespace-pre-wrap">{value.freeform_legacy}</p>
          <p className="text-xs text-muted-foreground mt-2">
            This address was saved in the old format.
          </p>
          <button
            type="button"
            className="mt-2 text-xs text-primary hover:underline"
            onClick={() => onChange(null)}
          >
            Re-enter as structured address
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Country selector */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Shipping Address{required ? ' *' : ''}</Label>
        <Select value={country} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHIPPING_COUNTRIES.map(c => (
              <SelectItem key={c.code} value={c.code}>
                {c.code === 'JP' ? '🇯🇵' : '🌐'} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {country === 'JP' ? (
        <div className="space-y-3 rounded-lg border p-3">
          {/* Postal Code */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Postal Code (郵便番号)</Label>
            <Input
              placeholder="123-4567"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              onBlur={handleBlurJP}
              maxLength={8}
              className="w-36"
            />
          </div>

          {/* Prefecture */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prefecture (都道府県)</Label>
            <Select value={prefectureJa} onValueChange={(v) => { handlePrefectureChange(v); setTimeout(emitJP, 0) }}>
              <SelectTrigger>
                <SelectValue placeholder="Select prefecture..." />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {JAPAN_PREFECTURES.map((pref) => (
                  <SelectItem key={pref.ja} value={pref.ja}>
                    {pref.ja} ({pref.en})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* City JP + EN */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">City (市区町村)</Label>
              <Input
                placeholder="渋谷区"
                value={cityJa}
                onChange={(e) => setCityJa(e.target.value)}
                onBlur={handleBlurJP}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">City (English)</Label>
              <Input
                placeholder="SHIBUYA-KU"
                value={cityEn}
                onChange={(e) => setCityEn(e.target.value)}
                onBlur={handleBlurJP}
              />
            </div>
          </div>

          {/* Town JP + EN */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Town (町域)</Label>
              <Input
                placeholder="神南"
                value={townJa}
                onChange={(e) => setTownJa(e.target.value)}
                onBlur={handleBlurJP}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Town (English)</Label>
              <Input
                placeholder="JINNAN"
                value={townEn}
                onChange={(e) => setTownEn(e.target.value)}
                onBlur={handleBlurJP}
              />
            </div>
          </div>

          {/* Town selector (when multiple results from postal code lookup) */}
          {postalResults && postalResults.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Select Town (複数の町域)</Label>
              <Select
                value={townJa}
                onValueChange={(v) => {
                  const match = postalResults.find(r => r.town_ja === v)
                  if (match) {
                    setTownJa(match.town_ja)
                    setTownEn(match.town_en)
                    setTimeout(emitJP, 0)
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select town..." />
                </SelectTrigger>
                <SelectContent>
                  {postalResults.map((r) => (
                    <SelectItem key={r.id} value={r.town_ja}>
                      {r.town_ja} ({r.town_en})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Address Lines */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 1 (番地)</Label>
            <Input
              placeholder="1-2-3"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              onBlur={handleBlurJP}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 2 (建物名・部屋番号)</Label>
            <Input
              placeholder="○○ビル 301号室"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              onBlur={handleBlurJP}
            />
          </div>
        </div>
      ) : (
        /* International address (WooCommerce/PayPal style) */
        <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 1</Label>
            <Input
              placeholder="123 Main Street"
              value={intlLine1}
              onChange={(e) => setIntlLine1(e.target.value)}
              onBlur={handleBlurIntl}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 2</Label>
            <Input
              placeholder="Apt, suite, unit, etc."
              value={intlLine2}
              onChange={(e) => setIntlLine2(e.target.value)}
              onBlur={handleBlurIntl}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">City</Label>
              <Input
                placeholder="New York"
                value={intlCity}
                onChange={(e) => setIntlCity(e.target.value)}
                onBlur={handleBlurIntl}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">State / Province</Label>
              <Input
                placeholder="NY"
                value={intlState}
                onChange={(e) => setIntlState(e.target.value)}
                onBlur={handleBlurIntl}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Postal / ZIP Code</Label>
            <Input
              placeholder="10001"
              value={intlPostalCode}
              onChange={(e) => setIntlPostalCode(e.target.value)}
              onBlur={handleBlurIntl}
              className="w-36"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/shared/address-display.tsx`**

```typescript
import type { ShippingAddress } from '@/lib/address-types'
import { isJPAddress, isIntlAddress, isLegacyAddress, formatPostalCode } from '@/lib/address-types'

interface AddressDisplayProps {
  address: ShippingAddress | null
  format?: 'jp' | 'en' | 'auto'
  className?: string
}

export function AddressDisplay({ address, format = 'auto', className }: AddressDisplayProps) {
  if (!address) return <span className="text-muted-foreground">-</span>

  if (isLegacyAddress(address)) {
    return (
      <div className={className}>
        <p className="whitespace-pre-wrap text-sm">{address.freeform_legacy}</p>
        <p className="text-xs text-muted-foreground mt-1">(legacy format)</p>
      </div>
    )
  }

  if (isJPAddress(address)) {
    const useJP = format === 'jp' || format === 'auto'
    if (useJP) {
      return (
        <div className={className}>
          <p className="text-sm">〒{formatPostalCode(address.postal_code)}</p>
          <p className="text-sm">
            {address.prefecture_ja} {address.city_ja} {address.town_ja}
          </p>
          <p className="text-sm">{address.address_line_1}</p>
          {address.address_line_2 && <p className="text-sm">{address.address_line_2}</p>}
        </div>
      )
    }
    // English format
    return (
      <div className={className}>
        <p className="text-sm">{address.address_line_1}</p>
        {address.address_line_2 && <p className="text-sm">{address.address_line_2}</p>}
        <p className="text-sm">
          {address.town_en} {address.city_en}
        </p>
        <p className="text-sm">{address.prefecture_en} {formatPostalCode(address.postal_code)}</p>
        <p className="text-sm">JAPAN</p>
      </div>
    )
  }

  if (isIntlAddress(address)) {
    return (
      <div className={className}>
        <p className="text-sm">{address.address_line_1}</p>
        {address.address_line_2 && <p className="text-sm">{address.address_line_2}</p>}
        <p className="text-sm">
          {address.city}{address.state ? `, ${address.state}` : ''} {address.postal_code}
        </p>
        <p className="text-sm">{address.country}</p>
      </div>
    )
  }

  return <span className="text-muted-foreground">-</span>
}
```

- [ ] **Step 3: Update `src/components/shared/index.ts`** — add exports

Add at the end:
```typescript
export { AddressForm } from './address-form'
export { AddressDisplay } from './address-display'
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/address-form.tsx src/components/shared/address-display.tsx src/components/shared/index.ts
git commit -m "feat: add AddressForm and AddressDisplay shared components"
```

---

## Chunk 3: Integrate into Pages

### Task 7: Update admin customer form dialog

**Files:**
- Modify: `src/components/customers/customer-form-dialog.tsx`
- Modify: `src/services/customers.ts`

- [ ] **Step 1: Rewrite `src/components/customers/customer-form-dialog.tsx`**

Replace the entire shipping address section (country selector + JP structured fields + OTHER textarea) with the new `AddressForm` component. Remove all the local address state (`addressCountry`, `postalCode`, `prefecture`, `city`, `addressLine`, `building`, `JAPAN_PREFECTURES`).

Key changes:
- Add `const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)` state
- Replace the shipping address section with: `<AddressForm value={shippingAddress} onChange={setShippingAddress} />`
- Remove the `buildJapanAddress()` function, `resetAddressFields()`, and all local address state (`addressCountry`, `postalCode`, `prefecture`, `city`, `addressLine`, `building`)
- Remove the old `JAPAN_PREFECTURES` constant (now in `src/lib/prefectures.ts`)
- Update `onSubmit` props interface to include the address:
  ```typescript
  interface CustomerFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    loading?: boolean
    onSubmit: (values: AdminCreateCustomerFormValues, address: ShippingAddress | null) => void
  }
  ```
- In `handleSubmit`, call `onSubmit(values, shippingAddress)` to pass both form values and address to parent
- Import `AddressForm` from `@/components/shared`
- Import `ShippingAddress` from `@/lib/address-types`

- [ ] **Step 2: Update `src/services/customers.ts`** — accept JSONB shipping_address

In `createCustomer`, change `shipping_address` param type from `string` to `ShippingAddress | null`:
```typescript
import type { ShippingAddress } from '@/lib/address-types'
import { uppercaseAddress } from '@/lib/address-types'

// In createCustomer params:
shipping_address?: ShippingAddress | null

// In the function body, uppercase address and names before sending:
const processedAddress = params.shipping_address
  ? uppercaseAddress(params.shipping_address)
  : undefined

// Pass as JSONB to Edge Function:
shipping_address: processedAddress ?? undefined,

// Uppercase names:
last_name: params.last_name.toUpperCase(),
first_name: params.first_name?.toUpperCase() || undefined,
```

- [ ] **Step 3: Update `src/pages/admin/customers.tsx`** — update `handleCreate` to pass address object

In `handleCreate`, change:
```typescript
shipping_address: values.shipping_address || undefined,
```
to:
```typescript
shipping_address: shippingAddress, // ShippingAddress | null from dialog
```

In the parent `handleCreate`, update the callback signature to receive both values and address:
```typescript
function handleCreate(values: AdminCreateCustomerFormValues, address: ShippingAddress | null) {
  createMutation.mutate({
    last_name: values.last_name,
    // ... other fields ...
    shipping_address: address,
  }, { onSuccess: ... })
}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 5: Commit**

```bash
git add src/components/customers/customer-form-dialog.tsx src/services/customers.ts src/pages/admin/customers.tsx
git commit -m "feat: integrate AddressForm into admin customer creation"
```

---

### Task 8: Update customer detail page

**Files:**
- Modify: `src/pages/admin/customer-detail.tsx`

- [ ] **Step 1: Update `src/pages/admin/customer-detail.tsx`**

Replace line 71:
```typescript
<InfoRow label="Shipping Address" value={customer.shipping_address ?? '-'} />
```
with:
```typescript
<div className="space-y-1">
  <span className="text-sm text-muted-foreground">Shipping Address</span>
  <AddressDisplay
    address={customer.shipping_address as ShippingAddress | null}
    format="auto"
  />
</div>
```

Add imports:
```typescript
import { AddressDisplay } from '@/components/shared'
import type { ShippingAddress } from '@/lib/address-types'
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/customer-detail.tsx
git commit -m "feat: use AddressDisplay on customer detail page"
```

---

### Task 9: Update customer registration page

**Files:**
- Modify: `src/pages/customer/register.tsx`
- Modify: `src/hooks/use-customer-auth.ts`

- [ ] **Step 1: Update `src/pages/customer/register.tsx`**

Replace the shipping address `<Textarea>` (lines 129-145) with:

```typescript
// Add state
const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)

// Replace textarea FormField with:
<AddressForm value={shippingAddress} onChange={setShippingAddress} />
```

In `onSubmit`, replace:
```typescript
shipping_address: values.shipping_address || undefined,
```
with:
```typescript
shipping_address: shippingAddress ?? undefined,
```

Add imports for `AddressForm` and `ShippingAddress`.

- [ ] **Step 2: Update `src/hooks/use-customer-auth.ts`** — change `shipping_address` type

On lines 12 and 60, change:
```typescript
shipping_address?: string
```
to:
```typescript
shipping_address?: ShippingAddress | null
```

Add import:
```typescript
import type { ShippingAddress } from '@/lib/address-types'
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/customer/register.tsx src/hooks/use-customer-auth.ts
git commit -m "feat: integrate AddressForm into customer registration"
```

---

### Task 10: Update customer settings page

**Files:**
- Modify: `src/pages/customer/settings.tsx`

- [ ] **Step 1: Update `src/pages/customer/settings.tsx`**

In `ProfileSection`, replace the shipping address textarea (lines 149-161) with:

```typescript
// Add state (initialize from customer's current address)
const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(
  (customer?.shipping_address as ShippingAddress | null) ?? null
)

// Replace textarea FormField with:
<AddressForm value={shippingAddress} onChange={setShippingAddress} />
```

In `onSubmit`, replace:
```typescript
shipping_address: values.shipping_address || null,
```
with:
```typescript
shipping_address: shippingAddress as unknown as string, // JSONB stored as-is by Supabase
```

Add imports for `AddressForm` and `ShippingAddress`.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/customer/settings.tsx
git commit -m "feat: integrate AddressForm into customer settings"
```

---

### Task 11: Update checkout page

**Files:**
- Modify: `src/pages/shop/checkout.tsx`

- [ ] **Step 1: Update `src/pages/shop/checkout.tsx`**

Replace the shipping address textarea (lines 238-254) with `AddressForm`:

```typescript
// Add state
const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)

// Replace textarea FormField with:
<AddressForm value={shippingAddress} onChange={setShippingAddress} required />
```

In `handleSubmit` (line 122), change the `shipping_address` concatenation to use `serializeAddress`:

```typescript
import { serializeAddress } from '@/lib/address-types'

// Replace:
shipping_address: `${values.last_name} ${values.first_name ?? ''}\n${values.email}${values.phone ? `\n${values.phone}` : ''}\n${values.shipping_address}`,
// With:
shipping_address: `${values.last_name.toUpperCase()} ${(values.first_name ?? '').toUpperCase()}\n${values.email}${values.phone ? `\n${values.phone}` : ''}\n${shippingAddress ? serializeAddress(shippingAddress) : ''}`,
```

Also remove `Textarea` import if no longer used.

- [ ] **Step 2: Update checkout schema** — remove `shipping_address` string field

In the inline `checkoutSchema`, remove:
```typescript
shipping_address: z.string().min(1, 'Shipping address is required'),
```

The address is now managed by `AddressForm` state, not the form schema. Add validation in `handleSubmit` instead:
```typescript
if (!shippingAddress) {
  toast.error('Shipping address is required')
  return
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/shop/checkout.tsx
git commit -m "feat: integrate AddressForm into checkout with serializeAddress"
```

---

### Task 12: Update customer name uppercase in services

**Files:**
- Modify: `src/services/customers.ts`

- [ ] **Step 1: Update `updateCustomer` to uppercase names**

In `updateCustomer` function, add uppercase transformation:
```typescript
export async function updateCustomer(id: string, updates: CustomerUpdate) {
  // Uppercase customer names on save
  if (updates.last_name) updates.last_name = updates.last_name.toUpperCase()
  if (updates.first_name) updates.first_name = updates.first_name.toUpperCase()

  const { data, error } = await supabase
    // ... rest stays the same
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Zero errors

- [ ] **Step 3: Commit**

```bash
git add src/services/customers.ts
git commit -m "feat: auto-uppercase customer names on save"
```

---

## Chunk 4: Edge Functions and Database Types

### Task 13: Update customer-auth Edge Function

**Files:**
- Modify: `supabase/functions/customer-auth/index.ts`

- [ ] **Step 1: Update `supabase/functions/customer-auth/index.ts`**

The Edge Function currently receives `shipping_address` as a plain string and inserts it into the `customers` table. After the migration, the column is JSONB. Update the function to accept and store JSONB:

- In the `register` action handler, change the `shipping_address` column insert to pass the object directly (Supabase client handles JSONB serialization automatically)
- If `shipping_address` is received as a string (for backwards compatibility), wrap it: `{ country: 'JP', freeform_legacy: shipping_address }`
- If received as an object, pass it through as-is

```typescript
// In the register action:
const shippingAddress = typeof body.shipping_address === 'string'
  ? { country: 'JP', freeform_legacy: body.shipping_address }
  : body.shipping_address ?? null
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/customer-auth/
git commit -m "feat: update customer-auth edge function for JSONB shipping_address"
```

---

### Task 14: Regenerate database types

**Files:**
- Modify: `src/lib/database.types.ts`

- [ ] **Step 1: Regenerate TypeScript types from Supabase schema**

After the migration changes `shipping_address` from `text` to `jsonb`, the auto-generated types must be updated.

Run: `npx supabase gen types typescript --local > src/lib/database.types.ts`

Or if using remote: `npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/lib/database.types.ts`

Verify that `shipping_address` is now typed as `Json | null` in the generated output.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Zero errors. If there are type errors, they indicate places that still treat `shipping_address` as `string` and need casting to `ShippingAddress`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore: regenerate database types after shipping_address jsonb migration"
```

---

### Task 15: Verify order validator is unaffected

**Files:**
- Check: `src/validators/order.ts`

- [ ] **Step 1: Verify `src/validators/order.ts` still works**

The order validator has `shipping_address: z.string().min(1, 'Shipping address is required')` — this must stay as `string` since `orders.shipping_address` remains a text column (order snapshots). Confirm no imports or references to the new address types were accidentally introduced.

Run: `npm run build`
Expected: Zero errors

---

## Chunk 5: Final build verification

### Task 16: Full build and cleanup

**Note:** The admin CSV upload page and `update-postal-codes` Edge Function for seeding/refreshing the postal_codes table are deferred to a separate task. The postal_codes table will be empty until the user provides the Japan Post CSV files. The auto-fill feature degrades gracefully — when no results are found, users type manually.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Zero errors, zero warnings

- [ ] **Step 2: Remove old JAPAN_PREFECTURES from customer-form-dialog.tsx**

Verify the old `JAPAN_PREFECTURES` constant (the one with just Japanese names, no English) has been removed from the customer form dialog since it's now in `src/lib/prefectures.ts`.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: cleanup and final build verification for structured address system"
```
