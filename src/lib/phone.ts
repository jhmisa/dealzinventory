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
