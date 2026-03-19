# Structured Address System Design

**Date:** 2026-03-18
**Status:** Draft

## Overview

Replace the plain-text `shipping_address` field on the `customers` table with a structured JSONB column that supports dual-language Japanese addresses (for Yamato/Sagawa CSV export) and WooCommerce/PayPal-style international addresses. Add a `postal_codes` lookup table seeded from Japan Post CSVs with an admin upload feature for updates.

## Problem

1. Yamato shipping CSV requires Japanese-language addresses (kanji prefecture, city, town)
2. Customers often only know their English/romaji address
3. No structured fields for address — just a text blob — makes CSV export unreliable
4. Japan Post updates postal code data monthly; need a way to refresh it

## Address Shapes

### Japan Address (JSONB)

```json
{
  "country": "JP",
  "postal_code": "1500041",
  "prefecture_ja": "東京都",
  "prefecture_en": "TOKYO",
  "city_ja": "渋谷区",
  "city_en": "SHIBUYA-KU",
  "town_ja": "神南",
  "town_en": "JINNAN",
  "address_line_1": "1-2-3",
  "address_line_2": "○○ビル 301号室"
}
```

- `prefecture_ja` / `prefecture_en` — auto-mapped from dropdown (select one, get both)
- `city_ja` / `city_en` — city/ward (市区町村), auto-filled from postal code lookup
- `town_ja` / `town_en` — town/area (町域), auto-filled from postal code lookup
- `address_line_1` / `address_line_2` — street + building, can contain Japanese or romaji (not uppercased for JP addresses)
- Customer names (`last_name`, `first_name`) auto-uppercased on save

### International Address (WooCommerce/PayPal style, JSONB)

```json
{
  "country": "US",
  "address_line_1": "123 MAIN STREET",
  "address_line_2": "APT 4B",
  "city": "NEW YORK",
  "state": "NY",
  "postal_code": "10001"
}
```

Standard fields matching PayPal/WooCommerce/Stripe: `country`, `address_line_1`, `address_line_2`, `city`, `state`, `postal_code`. All fields auto-uppercased.

## Database Changes

### 1. Alter `customers.shipping_address` from `text` to `jsonb`

```sql
ALTER TABLE customers
  ALTER COLUMN shipping_address TYPE jsonb USING
    CASE
      WHEN shipping_address IS NOT NULL AND shipping_address != ''
      THEN jsonb_build_object('country', 'JP', 'freeform_legacy', shipping_address)
      ELSE NULL
    END;
```

Existing text data is preserved in a `freeform_legacy` wrapper so nothing is lost.

### 2. `orders.shipping_address` stays as `text`

Orders capture a flattened snapshot at checkout time. No change needed — the checkout flow serializes JSONB → text when creating the order.

### Order snapshot serialization format

A utility function `serializeAddress(address: ShippingAddress): string` produces a canonical text format:

**JP format:**
```
〒150-0041
東京都 渋谷区 神南
1-2-3
○○ビル 301号室
```

**International format:**
```
123 MAIN STREET
APT 4B
NEW YORK, NY 10001
US
```

**Legacy format:** Outputs `freeform_legacy` value as-is.

### 3. New `postal_codes` table

```sql
CREATE TABLE postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  postal_code text NOT NULL,
  prefecture_ja text NOT NULL,
  prefecture_en text NOT NULL,
  city_ja text NOT NULL,
  city_en text NOT NULL,
  town_ja text NOT NULL,
  town_en text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_postal_codes_code ON postal_codes(postal_code);

-- RLS: public read, service_role only for writes
ALTER TABLE postal_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read postal codes"
  ON postal_codes FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE restricted to service_role (Edge Function uses service_role key)
```

~120K rows. Indexed on `postal_code` for fast lookup. Multiple rows per postal code possible (different towns).

## TypeScript Types

```typescript
interface ShippingAddressJP {
  country: 'JP'
  postal_code: string
  prefecture_ja: string
  prefecture_en: string
  city_ja: string
  city_en: string
  town_ja: string
  town_en: string
  address_line_1: string
  address_line_2?: string
}

interface ShippingAddressIntl {
  country: Exclude<string, 'JP'> // ISO 3166-1 alpha-2, never 'JP'
  address_line_1: string
  address_line_2?: string
  city: string
  state?: string
  postal_code: string
}

interface ShippingAddressLegacy {
  country: string
  freeform_legacy: string
}

type ShippingAddress = ShippingAddressJP | ShippingAddressIntl | ShippingAddressLegacy
```

### Zod Schemas (discriminated union)

```typescript
const shippingAddressJPSchema = z.object({
  country: z.literal('JP'),
  postal_code: z.string().min(1),
  prefecture_ja: z.string().min(1),
  prefecture_en: z.string().min(1),
  city_ja: z.string().min(1),
  city_en: z.string().min(1),
  town_ja: z.string().optional().or(z.literal('')),
  town_en: z.string().optional().or(z.literal('')),
  address_line_1: z.string().min(1),
  address_line_2: z.string().optional().or(z.literal('')),
})

const shippingAddressIntlSchema = z.object({
  country: z.string().length(2).refine(c => c !== 'JP'),
  address_line_1: z.string().min(1),
  address_line_2: z.string().optional().or(z.literal('')),
  city: z.string().min(1),
  state: z.string().optional().or(z.literal('')),
  postal_code: z.string().min(1),
})

const shippingAddressLegacySchema = z.object({
  country: z.string(),
  freeform_legacy: z.string(),
})

const shippingAddressSchema = z.discriminatedUnion('country', [
  shippingAddressJPSchema,
  // Note: discriminatedUnion requires literal discriminators.
  // For intl, use a superRefine approach or z.union with custom logic.
])
// Practical approach: use z.union([jpSchema, intlSchema, legacySchema])
// with a custom check: if country === 'JP' → validate as JP, else → intl/legacy
```

## Constants

### Prefecture JP↔EN Map

```typescript
const JAPAN_PREFECTURES = [
  { ja: '北海道', en: 'HOKKAIDO' },
  { ja: '青森県', en: 'AOMORI' },
  // ... all 47
  { ja: '沖縄県', en: 'OKINAWA' },
] as const
```

Selecting a prefecture in the dropdown auto-fills both `prefecture_ja` and `prefecture_en`.

### Country List

Standard ISO 3166-1 list for the country dropdown. Common shipping destinations at the top (JP, US, UK, AU, CA, etc.).

## Components

### `AddressForm` (shared component)

Reusable across admin customer form, customer registration, customer settings, and checkout.

**Props:**
- `value: ShippingAddress | null` — current address
- `onChange: (address: ShippingAddress | null) => void` — callback
- `required?: boolean` — whether address is mandatory

**Behavior:**
- Country selector at top (defaults to Japan)
- **When JP selected:**
  - Postal code field (7 digits, formatted as `xxx-xxxx`)
  - On postal code entry (7 digits), auto-lookup from `postal_codes` table
  - If match found: auto-fill prefecture + city + town (both JP and EN)
  - If multiple matches (different towns under same postal code): show dropdown to pick town
  - Prefecture dropdown (47 prefectures, auto-fills both JP and EN)
  - City: JP label + EN label (side by side, auto-filled from lookup)
  - Town: JP label + EN label (side by side, auto-filled from lookup)
  - Address line 1 + Address line 2 (can contain JP or EN text)
- **When other country selected:**
  - Address line 1 + Address line 2
  - City + State/Province
  - Postal/ZIP code
- English text fields auto-uppercased on blur (except for JP address_line_1/2 which may contain kanji)
- **Legacy address handling:** When value has `freeform_legacy`, show read-only display of old address with a prompt to re-enter as structured data

### `AddressDisplay` (shared component)

Renders a `ShippingAddress` JSONB into formatted text. Three modes:
- `format: 'jp'` — Japanese format (for labels, Yamato CSV)
- `format: 'en'` — English format (for customer-facing display)
- `format: 'auto'` — JP format if country is JP, EN otherwise
- **Legacy addresses:** Renders the `freeform_legacy` text as-is with a "(legacy)" label

## Postal Code Auto-fill

### City/Town Mapping from Lookup

The `postal_codes` table stores `city` and `town` as separate columns. When auto-filling from a lookup:
- `city_ja` in the address ← `city_ja` from postal_codes (e.g., `渋谷区`)
- `city_en` in the address ← `city_en` from postal_codes (e.g., `SHIBUYA-KU`)
- `town_ja` in the address ← `town_ja` from postal_codes (e.g., `神南`)
- `town_en` in the address ← `town_en` from postal_codes (e.g., `JINNAN`)

This is a 1:1 mapping — no concatenation needed.

### Lookup Service

```typescript
// src/services/postal-codes.ts
export async function lookupPostalCode(code: string) {
  const normalized = code.replace(/-/g, '')
  const { data, error } = await supabase
    .from('postal_codes')
    .select('*')
    .eq('postal_code', normalized)

  if (error) throw error
  return data ?? []
}
```

### Auto-fill UX

1. User types postal code
2. After 7 digits entered (ignoring hyphens), trigger lookup
3. If single result: auto-fill prefecture + city + town (all JP and EN fields)
4. If multiple results (same postal code, different towns): show a select dropdown for town
5. If no result: leave fields empty, user types manually

## Admin CSV Upload

### Upload Page

Located at `/admin/settings/postal-codes` (or within an existing settings page).

**UI:**
- "Current data" — shows row count and last updated date
- "Upload new data" — two file inputs:
  - `utf_ken_all.zip` (Japanese)
  - `KEN_ALL_ROME.zip` (Romaji/English)
- Upload button → calls Edge Function → shows progress → success/failure toast

### Edge Function: `update-postal-codes`

1. Receives two zip files
2. Unzips both
3. Parses Japanese CSV → map of `postal_code → { prefecture_ja, city_ja, town_ja }`
4. Parses Romaji CSV → map of `postal_code → { prefecture_en, city_en, town_en }`
5. Merges on postal code
6. Within a transaction: truncates `postal_codes` table, then bulk inserts merged data (if insert fails, truncate is rolled back)
7. Returns row count + status

### CSV Format Reference

**UTF-8 Japanese (`utf_ken_all.csv`):**
Columns: JIS code, old postal code (5-digit), postal code (7-digit), prefecture kana, city kana, town kana, prefecture kanji, city kanji, town kanji, + flags

**Romaji (`KEN_ALL_ROME.csv`):**
Columns: postal code, prefecture (romaji), city (romaji), town (romaji), + flags

## Auto-uppercase Rules

On save (not on display), the following fields are uppercased:

**Customer names (always):**
- `last_name`
- `first_name`

**International addresses only:**
- `address_line_1`
- `address_line_2`
- `city`
- `state`
- `postal_code` (some countries have letters, e.g., UK)

**JP addresses:**
- `prefecture_en` — already uppercase from constant, but enforce
- `city_en` — uppercased
- `town_en` — uppercased
- `address_line_1` / `address_line_2` — **NOT uppercased** (may contain Japanese characters like `○○ビル`)

Japanese fields (`prefecture_ja`, `city_ja`, `town_ja`) are never modified.

## Files to Create/Modify

### New Files
- `src/lib/address-types.ts` — ShippingAddress types + serializeAddress utility
- `src/lib/prefectures.ts` — JAPAN_PREFECTURES constant with JP↔EN map
- `src/validators/address.ts` — Zod schemas for ShippingAddressJP, ShippingAddressIntl, ShippingAddressLegacy
- `src/components/shared/address-form.tsx` — AddressForm component
- `src/components/shared/address-display.tsx` — AddressDisplay component
- `src/services/postal-codes.ts` — postal code lookup service
- `src/hooks/use-postal-codes.ts` — postal code lookup hook
- `supabase/migrations/XXXX_add_postal_codes_table.sql` — postal_codes table + RLS
- `supabase/migrations/XXXX_alter_shipping_address_jsonb.sql` — customers column change
- `supabase/functions/update-postal-codes/` — Edge Function for CSV upload

### Modified Files
- `src/components/customers/customer-form-dialog.tsx` — use AddressForm
- `src/pages/admin/customer-detail.tsx` — use AddressDisplay
- `src/pages/customer/register.tsx` — use AddressForm
- `src/pages/customer/settings.tsx` — use AddressForm
- `src/pages/shop/checkout.tsx` — use AddressForm, serialize to text for order
- `src/validators/customer.ts` — shipping_address from string to address schema
- `src/validators/order.ts` — keep as string (order snapshot)
- `src/services/customers.ts` — pass JSONB instead of string, uppercase names on save
- `src/hooks/use-customer-auth.ts` — update shipping_address type from string to ShippingAddress
- `src/lib/database.types.ts` — regenerate (shipping_address becomes Json type)
- `supabase/functions/customer-auth/` — accept and store JSONB shipping_address

## Out of Scope

- Modifying `orders.shipping_address` (stays as text snapshot)
- Address validation against postal code data (auto-fill only, no enforcement)
- Google Maps / geocoding integration
- Multiple shipping addresses per customer (future feature)
- Yamato/Sagawa CSV export feature (separate spec — this spec provides the structured data it will consume)
- Recipient phone number in address (pulled from `customers.phone` during CSV export)
