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
