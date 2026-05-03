# Customer Address Management & International Phone Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD for customer addresses on the detail page and replace all phone inputs with an international country-code-aware PhoneInput component.

**Architecture:** New `PhoneInput` component with country code dropdown (flags, searchable). Phone numbers stored in E.164 format. Customer detail page replaces legacy `shipping_address` display with `customer_addresses` table CRUD. SQL migration converts existing phones to E.164 and copies `shipping_address` rows into `customer_addresses`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod, Supabase

**Spec:** `docs/superpowers/specs/2026-04-30-customer-addresses-phone-design.md`

---

### Task 1: Create phone utility module (`src/lib/phone.ts`)

**Files:**
- Create: `src/lib/phone.ts`

This module provides country data, E.164 parsing/formatting, and display helpers used by `PhoneInput` and the migration.

- [ ] **Step 1: Create `src/lib/phone.ts` with country data and utilities**

```typescript
// src/lib/phone.ts

export interface CountryPhone {
  code: string        // ISO 3166-1 alpha-2
  name: string
  dial: string        // e.g. "+81"
  flag: string        // emoji flag
  format?: (digits: string) => string  // optional local formatter
}

// Japan mobile: 90-1234-5678, landline: 3-1234-5678
function formatJP(digits: string): string {
  if (/^[5789]0/.test(digits)) {
    if (digits.length <= 2) return digits
    if (digits.length <= 6) return `${digits.slice(0, 2)}-${digits.slice(2)}`
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`
  }
  if (digits.length <= 1) return digits
  if (digits.length <= 5) return `${digits.slice(0, 1)}-${digits.slice(1)}`
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 9)}`
}

// Philippines mobile: 917-123-4567
function formatPH(digits: string): string {
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`
}

// Pinned countries first, then alphabetical
export const COUNTRIES: CountryPhone[] = [
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵', format: formatJP },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭', format: formatPH },
  // --- alphabetical below ---
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'HK', name: 'Hong Kong', dial: '+852', flag: '🇭🇰' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { code: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'TW', name: 'Taiwan', dial: '+886', flag: '🇹🇼' },
  { code: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
]

/** Find country by ISO code */
export function getCountry(code: string): CountryPhone | undefined {
  return COUNTRIES.find((c) => c.code === code)
}

/** Find country by dial code (longest match first for +1 ambiguity) */
export function getCountryByDial(dial: string): CountryPhone | undefined {
  // Sort by dial code length descending so +886 matches before +88
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  return sorted.find((c) => dial.startsWith(c.dial))
}

/**
 * Parse an E.164 string into { countryCode, nationalDigits }.
 * E.g. "+819012345678" → { countryCode: "JP", nationalDigits: "9012345678" }
 */
export function parseE164(e164: string): { countryCode: string; nationalDigits: string } | null {
  if (!e164.startsWith('+')) return null
  const country = getCountryByDial(e164)
  if (!country) return null
  const nationalDigits = e164.slice(country.dial.length)
  return { countryCode: country.code, nationalDigits }
}

/**
 * Build E.164 from country code + national digits.
 * Strips leading 0 from national number if present (common in JP/PH local format).
 */
export function toE164(countryCode: string, nationalDigits: string): string {
  const country = getCountry(countryCode)
  if (!country) return nationalDigits
  const digits = nationalDigits.replace(/[^\d]/g, '')
  return `${country.dial}${digits}`
}

/**
 * Format an E.164 phone for display: "🇯🇵 +81 90-1234-5678"
 * Returns raw value if not parseable.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null
  const parsed = parseE164(phone)
  if (!parsed) return phone // legacy format, show as-is
  const country = getCountry(parsed.countryCode)
  if (!country) return phone
  const formatted = country.format
    ? country.format(parsed.nationalDigits)
    : parsed.nationalDigits
  return `${country.flag} ${country.dial} ${formatted}`
}

/**
 * Format national digits for display in the input field (no country code prefix).
 */
export function formatNationalDigits(countryCode: string, digits: string): string {
  const country = getCountry(countryCode)
  if (!country?.format) return digits
  return country.format(digits)
}
```

- [ ] **Step 2: Verify the module compiles**

Run: `npx tsc --noEmit src/lib/phone.ts 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files)

- [ ] **Step 3: Commit**

```bash
git add src/lib/phone.ts
git commit -m "feat: add phone utility module with country data and E.164 helpers"
```

---

### Task 2: Create `PhoneInput` component

**Files:**
- Create: `src/components/shared/phone-input.tsx`
- Modify: `src/components/shared/index.ts`

- [ ] **Step 1: Create `src/components/shared/phone-input.tsx`**

```tsx
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
  value: string          // E.164 string or legacy format
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

  // Parse current value to determine country + national digits
  const parsed = value ? parseE164(value) : null
  const [selectedCountry, setSelectedCountry] = useState<string>(
    parsed?.countryCode ?? 'JP'
  )
  const [nationalDigits, setNationalDigits] = useState<string>(
    parsed?.nationalDigits ?? ''
  )

  // Sync from external value changes
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
      // Legacy format — show raw in the input, don't change country
      setNationalDigits(value.replace(/[^\d]/g, ''))
    }
  }, [value])

  // Focus search input when popover opens
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
    // Re-emit with new country code
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
```

- [ ] **Step 2: Export from shared index**

Add to `src/components/shared/index.ts`:

```typescript
export { PhoneInput } from './phone-input'
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep phone-input || echo "No errors for phone-input"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/phone-input.tsx src/components/shared/index.ts
git commit -m "feat: add PhoneInput component with country code dropdown and flags"
```

---

### Task 3: Create `PhoneDisplay` component for read-only phone rendering

**Files:**
- Create: `src/components/shared/phone-display.tsx`
- Modify: `src/components/shared/index.ts`

- [ ] **Step 1: Create `src/components/shared/phone-display.tsx`**

```tsx
// src/components/shared/phone-display.tsx
import { formatPhoneDisplay } from '@/lib/phone'

interface PhoneDisplayProps {
  phone: string | null | undefined
  className?: string
}

export function PhoneDisplay({ phone, className }: PhoneDisplayProps) {
  if (!phone) return <span className={className}>-</span>
  const formatted = formatPhoneDisplay(phone)
  return <span className={className}>{formatted}</span>
}
```

- [ ] **Step 2: Export from shared index**

Add to `src/components/shared/index.ts`:

```typescript
export { PhoneDisplay } from './phone-display'
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/phone-display.tsx src/components/shared/index.ts
git commit -m "feat: add PhoneDisplay component for E.164 phone rendering with flags"
```

---

### Task 4: Add address management section to customer detail page

**Files:**
- Modify: `src/pages/admin/customer-detail.tsx`

This replaces the "Shipping Address" single-address display with a full list from `customer_addresses` table, with add/edit/delete functionality.

- [ ] **Step 1: Add imports for address management**

In `src/pages/admin/customer-detail.tsx`, update imports:

Add to the lucide-react import (line 2):
```typescript
import { ArrowLeft, Pencil, ShieldCheck, ShieldX, Eye, EyeOff, Ticket, Plus, Trash2, Star } from 'lucide-react'
```

Add new imports after line 44:
```typescript
import {
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  useDeleteCustomerAddress,
} from '@/hooks/use-customer-addresses'
import { PhoneInput, PhoneDisplay } from '@/components/shared'
import { formatPhoneDisplay } from '@/lib/phone'
import type { ShippingAddress } from '@/lib/address-types'
import type { CustomerAddress } from '@/lib/types'
```

Update shared imports (line 18-29) — add `PhoneInput`, `PhoneDisplay` to the existing import and remove `AddressForm`, `AddressDisplay` from it only if they're no longer used elsewhere in the file. Actually, `AddressForm` and `AddressDisplay` are still needed for the address dialogs, so keep them.

- [ ] **Step 2: Add address management state and hooks inside `CustomerDetailPage`**

After the existing state declarations (after line 89), add:

```typescript
// Address management
const { data: addresses = [], isLoading: addressesLoading } = useCustomerAddresses(id!)
const createAddress = useCreateCustomerAddress()
const updateAddress = useUpdateCustomerAddress(id!)
const deleteAddress = useDeleteCustomerAddress(id!)

const [addressDialogOpen, setAddressDialogOpen] = useState(false)
const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null)
const [deleteAddressId, setDeleteAddressId] = useState<string | null>(null)

// Address form state
const [addrFormAddress, setAddrFormAddress] = useState<ShippingAddress | null>(null)
const [addrFormReceiverFirst, setAddrFormReceiverFirst] = useState('')
const [addrFormReceiverLast, setAddrFormReceiverLast] = useState('')
const [addrFormReceiverPhone, setAddrFormReceiverPhone] = useState('')
const [addrFormIsDefault, setAddrFormIsDefault] = useState(false)

function openAddAddress() {
  setEditingAddress(null)
  setAddrFormAddress(null)
  setAddrFormReceiverFirst('')
  setAddrFormReceiverLast('')
  setAddrFormReceiverPhone('')
  setAddrFormIsDefault(addresses.length === 0) // default if first address
  setAddressDialogOpen(true)
}

function openEditAddress(addr: CustomerAddress) {
  setEditingAddress(addr)
  const parsed = typeof addr.address === 'string' ? JSON.parse(addr.address) : addr.address
  setAddrFormAddress(parsed as ShippingAddress | null)
  setAddrFormReceiverFirst(addr.receiver_first_name ?? '')
  setAddrFormReceiverLast(addr.receiver_last_name ?? '')
  setAddrFormReceiverPhone(addr.receiver_phone ?? '')
  setAddrFormIsDefault(addr.is_default ?? false)
  setAddressDialogOpen(true)
}

async function handleSaveAddress() {
  try {
    if (editingAddress) {
      await updateAddress.mutateAsync({
        id: editingAddress.id,
        updates: {
          address: addrFormAddress as unknown as Record<string, unknown>,
          receiver_first_name: addrFormReceiverFirst || null,
          receiver_last_name: addrFormReceiverLast || null,
          receiver_phone: addrFormReceiverPhone || null,
          is_default: addrFormIsDefault,
        },
      })
      toast.success('Address updated')
    } else {
      await createAddress.mutateAsync({
        customer_id: id!,
        address: addrFormAddress as unknown as Record<string, unknown>,
        receiver_first_name: addrFormReceiverFirst || null,
        receiver_last_name: addrFormReceiverLast || null,
        receiver_phone: addrFormReceiverPhone || null,
        is_default: addrFormIsDefault,
      })
      toast.success('Address added')
    }
    setAddressDialogOpen(false)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to save address')
  }
}

async function handleDeleteAddress() {
  if (!deleteAddressId) return
  try {
    await deleteAddress.mutateAsync(deleteAddressId)
    toast.success('Address deleted')
    setDeleteAddressId(null)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete address')
  }
}
```

- [ ] **Step 3: Remove old address edit state and save logic**

Remove `editAddress` state (line 84):
```typescript
// REMOVE this line:
const [editAddress, setEditAddress] = useState<ShippingAddress | null>(null)
```

In `enterEditMode()` (lines 94-111), remove lines 100-104:
```typescript
// REMOVE these lines:
    setEditAddress(
      typeof customer.shipping_address === 'string'
        ? JSON.parse(customer.shipping_address) as ShippingAddress
        : customer.shipping_address as ShippingAddress | null
    )
```

In `handleSave()` (lines 117-150), remove the address comparison block (lines 131-136):
```typescript
// REMOVE these lines:
    // Compare address by JSON serialization
    const currentAddrStr = customer.shipping_address ? JSON.stringify(customer.shipping_address) : null
    const newAddrStr = editAddress ? JSON.stringify(editAddress) : null
    if (newAddrStr !== currentAddrStr) {
      updates.shipping_address = newAddrStr
    }
```

- [ ] **Step 4: Replace phone display and address section in the read-mode view**

Replace the read-mode section of the Contact Information card (lines 258-271). The old code:

```tsx
            ) : (
              <>
                <InfoRow label="Email" value={customer.email ?? '-'} />
                <InfoRow label="Phone" value={customer.phone ?? '-'} />
                <div className="space-y-1">
                  <span className="text-sm text-muted-foreground">Shipping Address</span>
                  <AddressDisplay
                    address={customer.shipping_address as ShippingAddress | null}
                    format="auto"
                  />
                </div>
                <InfoRow label="Registered" value={formatDateTime(customer.created_at)} />
              </>
            )}
```

Replace with:

```tsx
            ) : (
              <>
                <InfoRow label="Email" value={customer.email ?? '-'} />
                <div className="flex items-start justify-between text-sm">
                  <span className="text-muted-foreground">Phone</span>
                  <PhoneDisplay phone={customer.phone} className="text-right" />
                </div>
                <InfoRow label="Registered" value={formatDateTime(customer.created_at)} />
              </>
            )}
```

- [ ] **Step 5: Replace phone input in edit mode**

Replace the phone input in edit mode (lines 247-255):

Old:
```tsx
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(formatJapanPhone(e.target.value))}
                    placeholder="090-1234-5678"
                  />
                </div>
                <AddressForm value={editAddress} onChange={setEditAddress} />
```

Replace with:
```tsx
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <PhoneInput value={editPhone} onChange={setEditPhone} />
                </div>
```

- [ ] **Step 6: Add addresses section after the Contact Information card**

After the closing `</Card>` of the Contact Information card (after line 273), and before the Verification & Status card, add the Addresses card:

```tsx
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Addresses ({addresses.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={openAddAddress}>
              <Plus className="h-4 w-4 mr-1" />
              Add Address
            </Button>
          </CardHeader>
          <CardContent>
            {addressesLoading ? (
              <TableSkeleton rows={2} cols={1} />
            ) : addresses.length === 0 ? (
              <EmptyState title="No addresses" description="No addresses added yet." />
            ) : (
              <div className="divide-y">
                {addresses.map((addr) => {
                  const parsedAddr = typeof addr.address === 'string'
                    ? JSON.parse(addr.address)
                    : addr.address
                  const hasReceiver = addr.receiver_first_name || addr.receiver_last_name
                  return (
                    <div key={addr.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{addr.label}</span>
                          {addr.is_default && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Star className="h-3 w-3" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEditAddress(addr)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteAddressId(addr.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <AddressDisplay address={parsedAddr as ShippingAddress} format="auto" />
                      {hasReceiver && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <span>Receiver: {[addr.receiver_first_name, addr.receiver_last_name].filter(Boolean).join(' ')}</span>
                          {addr.receiver_phone && (
                            <span className="ml-2">
                              <PhoneDisplay phone={addr.receiver_phone} />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
```

- [ ] **Step 7: Add address dialog and delete confirmation at the bottom of the component (before the closing `</div>`)**

Before the final `</div>` of the return statement, add:

```tsx
      {/* Address Add/Edit Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAddress ? 'Edit Address' : 'Add Address'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <AddressForm value={addrFormAddress} onChange={setAddrFormAddress} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Receiver First Name</Label>
                <Input
                  value={addrFormReceiverFirst}
                  onChange={(e) => setAddrFormReceiverFirst(e.target.value.toUpperCase())}
                  placeholder="TARO"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Receiver Last Name</Label>
                <Input
                  value={addrFormReceiverLast}
                  onChange={(e) => setAddrFormReceiverLast(e.target.value.toUpperCase())}
                  placeholder="TANAKA"
                  className="uppercase"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Receiver Phone</Label>
              <PhoneInput value={addrFormReceiverPhone} onChange={setAddrFormReceiverPhone} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={addrFormIsDefault} onCheckedChange={setAddrFormIsDefault} />
              <Label className="text-sm">Set as default address</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddressDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAddress}
              disabled={!addrFormAddress || createAddress.isPending || updateAddress.isPending}
            >
              {(createAddress.isPending || updateAddress.isPending) ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Address Confirmation */}
      <ConfirmDialog
        open={!!deleteAddressId}
        onOpenChange={(open) => { if (!open) setDeleteAddressId(null) }}
        title="Delete Address"
        description="Are you sure you want to delete this address? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteAddress}
        loading={deleteAddress.isPending}
      />
```

- [ ] **Step 8: Remove the `formatJapanPhone` function (lines 46-60)**

Delete the local `formatJapanPhone` function since we now use `PhoneInput` instead.

- [ ] **Step 9: Clean up unused imports**

Remove `ShippingAddress` import from `@/lib/address-types` if `AddressDisplay` still handles the parsing internally. Keep it if `AddressDisplay` still needs it as a type cast. Check and remove `AddressForm` from shared imports only if no longer used (it IS still used in the address dialog, so keep it).

Remove `formatJapanPhone` usage — already done by replacing the phone input.

- [ ] **Step 10: Update the grid layout**

The Contact Information card and Verification & Status card are in a 2-column grid. The Addresses card should span full width below them. Change the layout:

Current (line 210):
```tsx
      <div className="grid md:grid-cols-2 gap-6">
```

Keep this as-is for Contact Info + Verification cards. Place the Addresses card OUTSIDE this grid, between the grid and Order History.

- [ ] **Step 11: Verify the page compiles and renders**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 12: Commit**

```bash
git add src/pages/admin/customer-detail.tsx
git commit -m "feat: add address management CRUD and PhoneInput to customer detail page"
```

---

### Task 5: Update customer creation dialog with PhoneInput

**Files:**
- Modify: `src/components/customers/customer-form-dialog.tsx`

- [ ] **Step 1: Replace phone input with PhoneInput**

Remove the local `formatJapanPhone` function (lines 32-48).

Add import:
```typescript
import { PhoneInput } from '@/components/shared'
```

Replace the phone FormField (lines 162-179):

Old:
```tsx
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="090-1234-5678"
                      {...field}
                      onChange={(e) => field.onChange(formatJapanPhone(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

New:
```tsx
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <PhoneInput value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/customers/customer-form-dialog.tsx
git commit -m "feat: replace phone input with PhoneInput in customer creation dialog"
```

---

### Task 6: Update customer login page with PhoneInput

**Files:**
- Modify: `src/pages/customer/login.tsx`

The login page currently has a single `email_or_phone` text field. We need to split this into separate email and phone fields since the phone now requires a country code selector. The login flow checks email OR phone — we keep both options but make them distinct inputs.

- [ ] **Step 1: Update the login form to use PhoneInput for the phone option**

The current `email_or_phone` field is a single input. The simplest approach: keep the field as a text input but add a toggle or auto-detect. However, since the spec says "use the same PhoneInput component", the cleanest UX is:

Replace the `email_or_phone` field with two fields — an email field and a phone field — where the user fills in one or the other. Add a small tab toggle: "Email" | "Phone".

Update `src/pages/customer/login.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerLoginSchema, type CustomerLoginFormValues } from '@/validators/customer'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { ShoppingBag } from 'lucide-react'
import { PhoneInput } from '@/components/shared'

export default function CustomerLoginPage() {
  const navigate = useNavigate()
  const { login } = useCustomerAuth()
  const [error, setError] = useState<string | null>(null)
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('phone')

  const form = useForm<CustomerLoginFormValues>({
    resolver: zodResolver(customerLoginSchema),
    defaultValues: { last_name: '', email_or_phone: '', pin: '' },
  })

  async function onSubmit(values: CustomerLoginFormValues) {
    try {
      setError(null)
      await login(values.last_name, values.email_or_phone, values.pin)
      navigate('/account', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <ShoppingBag className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">My Account</CardTitle>
          <CardDescription>Sign in with your name, email/phone, and PIN</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Tanaka" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div>
                <div className="flex gap-1 mb-2">
                  <button
                    type="button"
                    onClick={() => { setLoginMethod('email'); form.setValue('email_or_phone', '') }}
                    className={`px-3 py-1 text-xs rounded-full border ${loginMethod === 'email' ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:bg-accent'}`}
                  >
                    Email
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLoginMethod('phone'); form.setValue('email_or_phone', '') }}
                    className={`px-3 py-1 text-xs rounded-full border ${loginMethod === 'phone' ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:bg-accent'}`}
                  >
                    Phone
                  </button>
                </div>
                <FormField
                  control={form.control}
                  name="email_or_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{loginMethod === 'email' ? 'Email' : 'Phone'}</FormLabel>
                      <FormControl>
                        {loginMethod === 'email' ? (
                          <Input
                            type="email"
                            placeholder="tanaka@example.com"
                            {...field}
                          />
                        ) : (
                          <PhoneInput value={field.value} onChange={field.onChange} />
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>6-Digit PIN</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="------"
                        className="text-center tracking-[0.5em] font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground text-center">
            Don't have an account?{' '}
            <Link to="/account/register" className="text-primary hover:underline font-medium">
              Register
            </Link>
          </p>
          <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground">
            Back to shop
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/pages/customer/login.tsx
git commit -m "feat: add PhoneInput with email/phone toggle to customer login page"
```

---

### Task 7: Update customer register page with PhoneInput

**Files:**
- Modify: `src/pages/customer/register.tsx`

- [ ] **Step 1: Add PhoneInput import and replace phone field**

Add import:
```typescript
import { PhoneInput } from '@/components/shared'
```

Find the phone FormField and replace the `<Input type="tel" ...>` with:
```tsx
<PhoneInput value={field.value ?? ''} onChange={field.onChange} />
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/pages/customer/register.tsx
git commit -m "feat: replace phone input with PhoneInput in customer registration"
```

---

### Task 8: Update customer settings page with PhoneInput and PhoneDisplay

**Files:**
- Modify: `src/pages/customer/settings.tsx`

- [ ] **Step 1: Add imports and replace phone field in ProfileSection**

Add import:
```typescript
import { PhoneInput } from '@/components/shared'
```

Find the phone FormField in the ProfileSection and replace the `<Input type="tel" ...>` with:
```tsx
<PhoneInput value={field.value ?? ''} onChange={field.onChange} />
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/pages/customer/settings.tsx
git commit -m "feat: replace phone input with PhoneInput in customer settings"
```

---

### Task 9: Update customer-auth Edge Function to support E.164 phone matching

**Files:**
- Modify: `supabase/functions/customer-auth/index.ts`

The login flow queries customers by `phone = $value`. Since phones are now stored in E.164 format, the Edge Function already works — the client sends E.164, the DB stores E.164, exact match. However, we should ensure backwards compatibility for legacy phones that weren't migrated.

- [ ] **Step 1: Update the login query to handle both E.164 and legacy formats**

In the login action of `supabase/functions/customer-auth/index.ts`, find the phone matching query. If it does an exact match on `phone`, update it to also try matching without the country code prefix for backwards compatibility:

Find the section where login checks `email_or_phone` against the `phone` column. If the input starts with `+`, also try matching the local format (e.g., `+819012345678` should also match `09012345678` in legacy data).

Add a fallback query: if the primary lookup by exact phone match returns no results AND the input starts with `+81`, retry with the local format (`0` + digits after `+81`).

```typescript
// After the initial customer lookup fails with E.164 phone:
if (!customer && emailOrPhone.startsWith('+81')) {
  // Fallback: try legacy Japan local format (09012345678)
  const localPhone = '0' + emailOrPhone.slice(3)
  const { data: legacyCustomer } = await supabaseClient
    .from('customers')
    .select('*')
    .eq('last_name', lastName.toUpperCase())
    .eq('phone', localPhone)
    .single()
  if (legacyCustomer) customer = legacyCustomer
}
if (!customer && emailOrPhone.startsWith('+63')) {
  // Fallback: try legacy PH local format (09171234567)
  const localPhone = '0' + emailOrPhone.slice(3)
  const { data: legacyCustomer } = await supabaseClient
    .from('customers')
    .select('*')
    .eq('last_name', lastName.toUpperCase())
    .eq('phone', localPhone)
    .single()
  if (legacyCustomer) customer = legacyCustomer
}
```

- [ ] **Step 2: Deploy the Edge Function**

Run: `supabase functions deploy customer-auth`
Expected: Function deployed successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/customer-auth/index.ts
git commit -m "feat: add E.164 phone login with legacy format fallback"
```

---

### Task 10: SQL migration — phone E.164 conversion + shipping_address to customer_addresses

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_phone_e164_and_address_migration.sql`

- [ ] **Step 1: Create the migration file**

Generate timestamp and create migration:

```bash
MIGRATION_NAME=$(date +%Y%m%d%H%M%S)_phone_e164_and_address_migration
touch supabase/migrations/${MIGRATION_NAME}.sql
```

- [ ] **Step 2: Write the migration SQL**

```sql
-- Migration: Convert phone numbers to E.164 and copy shipping_address to customer_addresses

-- 1. Convert customers.phone to E.164 format

-- Japan mobile: 090/080/070/050 + 8 digits → +81 + drop leading 0
UPDATE customers
SET phone = '+81' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^0[5789]0\d{8}$';

-- Japan landline: 0[1-9]X... (10 digits total, not matching mobile) → +81 + drop leading 0
UPDATE customers
SET phone = '+81' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^0[1-9]\d{8}$'
  AND phone !~ '^0[5789]0';

-- Philippines mobile: 09[1-9]X + 11 digits total → +63 + drop leading 0
UPDATE customers
SET phone = '+63' || substring(phone from 2)
WHERE phone IS NOT NULL
  AND phone !~ '^\+'
  AND phone ~ '^09[1-9]\d{8}$';

-- 2. Convert receiver_phone in customer_addresses to E.164

-- Japan mobile
UPDATE customer_addresses
SET receiver_phone = '+81' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^0[5789]0\d{8}$';

-- Japan landline
UPDATE customer_addresses
SET receiver_phone = '+81' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^0[1-9]\d{8}$'
  AND receiver_phone !~ '^0[5789]0';

-- Philippines mobile
UPDATE customer_addresses
SET receiver_phone = '+63' || substring(receiver_phone from 2)
WHERE receiver_phone IS NOT NULL
  AND receiver_phone !~ '^\+'
  AND receiver_phone ~ '^09[1-9]\d{8}$';

-- 3. Copy shipping_address to customer_addresses for customers who don't already have entries

INSERT INTO customer_addresses (customer_id, address, label, is_default)
SELECT
  c.id,
  c.shipping_address::jsonb,
  'Address 1',
  true
FROM customers c
WHERE c.shipping_address IS NOT NULL
  AND c.shipping_address::text != 'null'
  AND c.shipping_address::text != ''
  AND NOT EXISTS (
    SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id
  );
```

- [ ] **Step 3: Apply the migration**

Run: `supabase db push` or use the Supabase MCP `apply_migration` tool.
Expected: Migration applied successfully.

- [ ] **Step 4: Verify the migration**

Run SQL to check results:
```sql
-- Check E.164 phones
SELECT phone FROM customers WHERE phone IS NOT NULL AND phone !~ '^\+' LIMIT 10;
-- Should return only non-migrated phones (unknown formats)

-- Check addresses were copied
SELECT count(*) FROM customer_addresses;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: migrate phone numbers to E.164 and copy shipping_address to customer_addresses"
```

---

### Task 11: Handle `updateCustomerAddress` default flag toggle

**Files:**
- Modify: `src/services/customer-addresses.ts`

When updating an address to `is_default = true`, we need to unset the default on other addresses first (same logic as in `createCustomerAddress`).

- [ ] **Step 1: Update `updateCustomerAddress` to handle default toggle**

In `src/services/customer-addresses.ts`, update the `updateCustomerAddress` function:

```typescript
export async function updateCustomerAddress(id: string, updates: CustomerAddressUpdate) {
  // If setting as default, unset other defaults first
  if (updates.is_default) {
    // Get the customer_id for this address
    const { data: existing } = await supabase
      .from('customer_addresses')
      .select('customer_id')
      .eq('id', id)
      .single()

    if (existing) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', existing.customer_id)
        .neq('id', id)
    }
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as CustomerAddress
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/customer-addresses.ts
git commit -m "fix: unset other default addresses when setting a new default"
```

---

### Task 12: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 2: Run lint if configured**

Run: `npm run lint 2>&1 | tail -20`
Expected: No new lint errors

- [ ] **Step 3: Manual testing checklist**

Verify in the browser:
1. Customer detail page shows addresses from `customer_addresses` table
2. Can add a new address with receiver info and phone
3. Can edit an existing address
4. Can delete an address
5. Default badge shows correctly
6. Phone displays with flag on customer detail page
7. Customer creation dialog uses PhoneInput
8. Customer login page has email/phone toggle with PhoneInput
9. Customer register page uses PhoneInput
10. Customer settings page uses PhoneInput
11. Legacy phones without `+` prefix display as raw text

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address any build or lint issues from customer addresses and phone feature"
```
