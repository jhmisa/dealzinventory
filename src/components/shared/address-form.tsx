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
      setTownJa(value.town_ja ?? '')
      setTownEn(value.town_en ?? '')
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
      town_ja: townJa || undefined,
      town_en: townEn ? townEn.toUpperCase() : undefined,
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
