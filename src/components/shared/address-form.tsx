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
import { JAPAN_PREFECTURES, PHILIPPINES_PROVINCES, SHIPPING_COUNTRIES } from '@/lib/prefectures'
import { usePostalCodeLookup, useReverseLookup, useCitiesInPrefecture, useTownsInCity } from '@/hooks/use-postal-codes'
import { reverseLookupPostalCode } from '@/services/postal-codes'
import type {
  ShippingAddress,
  ShippingAddressJP,
  ShippingAddressPH,
  ShippingAddressIntl,
} from '@/lib/address-types'
import { isJPAddress, isPHAddress, isIntlAddress, isLegacyAddress } from '@/lib/address-types'
import { BilingualCombobox } from '@/components/shared/bilingual-combobox'
import { SimpleCombobox } from '@/components/shared/simple-combobox'

/** Format postal code with dash: 1234567 → 123-4567 */
function formatPostalCodeInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '')
  if (digits.length <= 3) return digits
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}`
}

interface AddressFormProps {
  value: ShippingAddress | null
  onChange: (address: ShippingAddress | null) => void
  required?: boolean
}

export function AddressForm({ value, onChange, required = false }: AddressFormProps) {
  // Determine initial country from value
  const initialCountry = value?.country ?? 'JP'
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

  // PH address fields
  const [phHouse, setPhHouse] = useState('')
  const [phStreet, setPhStreet] = useState('')
  const [phBarangay, setPhBarangay] = useState('')
  const [phCity, setPhCity] = useState('')
  const [phProvince, setPhProvince] = useState('')
  const [phPostal, setPhPostal] = useState('')

  // Generic intl fields
  const [intlLine1, setIntlLine1] = useState('')
  const [intlLine2, setIntlLine2] = useState('')
  const [intlCity, setIntlCity] = useState('')
  const [intlState, setIntlState] = useState('')
  const [intlPostalCode, setIntlPostalCode] = useState('')

  // Postal code → address lookup (forward)
  const { data: postalResults } = usePostalCodeLookup(postalCode)
  const [hasAutoFilled, setHasAutoFilled] = useState(false)

  // Address → postal code lookup (reverse)
  const { data: reverseResults } = useReverseLookup(prefectureJa, cityJa, townJa)
  const [hasReverseAutoFilled, setHasReverseAutoFilled] = useState(false)

  // Searchable City / Town options scoped to current selection.
  const { data: cityOptions, isLoading: citiesLoading } = useCitiesInPrefecture(prefectureJa)
  const { data: townOptions, isLoading: townsLoading } = useTownsInCity(prefectureJa, cityJa)

  // Initialize from value prop
  useEffect(() => {
    if (!value) return
    if (isJPAddress(value)) {
      setCountry('JP')
      setPostalCode(formatPostalCodeInput(value.postal_code))
      setPrefectureJa(value.prefecture_ja)
      setPrefectureEn(value.prefecture_en)
      setCityJa(value.city_ja)
      setCityEn(value.city_en)
      setTownJa(value.town_ja ?? '')
      setTownEn(value.town_en ?? '')
      setAddressLine1(value.address_line_1)
      setAddressLine2(value.address_line_2 ?? '')
    } else if (isPHAddress(value)) {
      setCountry('PH')
      setPhHouse(value.house_number)
      setPhStreet(value.street ?? '')
      setPhBarangay(value.barangay)
      setPhCity(value.city)
      setPhProvince(value.province)
      setPhPostal(value.postal_code)
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

  // Reverse auto-fill: when prefecture + city + town are set but postal code is empty
  useEffect(() => {
    if (hasReverseAutoFilled || hasAutoFilled) return
    if (!reverseResults?.length) return
    const normalizedPostal = postalCode.replace(/-/g, '')
    if (normalizedPostal.length === 7) return

    if (reverseResults.length === 1) {
      setPostalCode(formatPostalCodeInput(reverseResults[0].postal_code))
      if (!cityEn) setCityEn(reverseResults[0].city_en)
      if (!townEn) setTownEn(reverseResults[0].town_en)
      setHasReverseAutoFilled(true)
    }
  }, [reverseResults, hasReverseAutoFilled, hasAutoFilled, postalCode, cityEn, townEn])

  // Reset auto-fill flag when postal code changes
  const handlePostalCodeChange = useCallback((val: string) => {
    setPostalCode(formatPostalCodeInput(val))
    setHasAutoFilled(false)
    setHasReverseAutoFilled(true) // Don't reverse-fill when user is typing postal code
  }, [])

  // --- emitters ---
  const emitJP = useCallback(() => {
    if (!postalCode && !prefectureJa && !addressLine1 && !required) {
      onChange(null)
      return
    }
    if (!addressLine1.trim()) {
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

  const emitPH = useCallback(() => {
    if (!phHouse && !phCity && !phProvince && !required) {
      onChange(null)
      return
    }
    if (!phHouse.trim() || !phBarangay.trim() || !phCity.trim() || !phProvince.trim()) {
      onChange(null)
      return
    }
    const addr: ShippingAddressPH = {
      country: 'PH',
      house_number: phHouse.toUpperCase(),
      street: phStreet ? phStreet.toUpperCase() : undefined,
      barangay: phBarangay.toUpperCase(),
      city: phCity.toUpperCase(),
      province: phProvince,
      postal_code: phPostal,
    }
    onChange(addr)
  }, [phHouse, phStreet, phBarangay, phCity, phProvince, phPostal, required, onChange])

  const emitIntl = useCallback(() => {
    if (!intlLine1 && !intlCity && !required) {
      onChange(null)
      return
    }
    if (!intlLine1.trim()) {
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

  // Emit on blur (free-text inputs) — comboboxes emit synchronously via setTimeout.
  const handleBlurJP = () => emitJP()
  const handleBlurPH = () => emitPH()
  const handleBlurIntl = () => emitIntl()

  // --- combobox handlers ---
  function handlePrefectureSelect(option: { ja: string; en: string }) {
    setPrefectureJa(option.ja)
    setPrefectureEn(option.en)
    // Picking a new prefecture invalidates city / town / postal code.
    setCityJa('')
    setCityEn('')
    setTownJa('')
    setTownEn('')
    setPostalCode('')
    setHasAutoFilled(false)
    setHasReverseAutoFilled(false)
    setTimeout(emitJP, 0)
  }

  function handleCitySelect(option: { ja: string; en: string }) {
    setCityJa(option.ja)
    setCityEn(option.en)
    // Picking a new city invalidates town and stale postal code.
    setTownJa('')
    setTownEn('')
    setPostalCode('')
    setHasAutoFilled(false)
    setHasReverseAutoFilled(false)
    setTimeout(emitJP, 0)
  }

  async function handleTownSelect(option: { ja: string; en: string }) {
    setTownJa(option.ja)
    setTownEn(option.en)
    // Picking a new town should refresh the postal code to match — the previously
    // auto-filled code (from typing or earlier town) is now stale.
    setHasReverseAutoFilled(true) // suppress the gated effect; we look up directly below.
    try {
      const matches = await reverseLookupPostalCode(prefectureJa, cityJa, option.ja)
      if (matches.length > 0) {
        setPostalCode(formatPostalCodeInput(matches[0].postal_code))
        // Sync English fields from the canonical postal row too.
        if (matches[0].city_en) setCityEn(matches[0].city_en)
        if (matches[0].town_en) setTownEn(matches[0].town_en)
      }
    } catch {
      // Network/RLS failure — leave the postal code as-is; user can correct it manually.
    }
    setTimeout(emitJP, 0)
  }

  // Handle country change
  function handleCountryChange(newCountry: string) {
    setCountry(newCountry)
    onChange(null)
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

  const prefectureOptions = JAPAN_PREFECTURES.map((p) => ({ ja: p.ja, en: p.en }))

  return (
    <div className="space-y-3">
      {/* Country selector — stacked like every other field below it. */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Country{required ? ' *' : ''}</Label>
        <Select value={country} onValueChange={handleCountryChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SHIPPING_COUNTRIES.map(c => (
              <SelectItem key={c.code} value={c.code}>
                {c.code === 'JP' ? '🇯🇵' : c.code === 'PH' ? '🇵🇭' : '🌐'} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {country === 'JP' ? (
        <div className="space-y-3">
          {/* Postal Code */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Postal Code (郵便番号)</Label>
            <Input
              placeholder="123-4567"
              value={postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              onBlur={handleBlurJP}
              maxLength={8}
              inputMode="numeric"
              className="w-36"
            />
          </div>

          {/* Prefecture (searchable) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Prefecture (都道府県)</Label>
            <BilingualCombobox
              options={prefectureOptions}
              value={prefectureJa}
              onChange={handlePrefectureSelect}
              placeholder="Select prefecture…"
              searchPlaceholder="Type to filter (TO, 東京, ...)"
              emptyText="No prefecture matches that search."
            />
          </div>

          {/* City (searchable) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">City (市区町村)</Label>
            <BilingualCombobox
              options={cityOptions ?? []}
              value={cityJa}
              onChange={handleCitySelect}
              placeholder={prefectureJa ? 'Select city…' : 'Pick a prefecture first'}
              searchPlaceholder="Type to filter (SHIBUYA, 渋谷, ...)"
              emptyText="No city matches that search."
              disabled={!prefectureJa}
              loading={citiesLoading}
            />
          </div>

          {/* Town (searchable) */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Town (町域)</Label>
            <BilingualCombobox
              options={townOptions ?? []}
              value={townJa}
              onChange={handleTownSelect}
              placeholder={cityJa ? 'Select town…' : 'Pick a city first'}
              searchPlaceholder="Type to filter (JINNAN, 神南, ...)"
              emptyText="No town matches that search."
              disabled={!cityJa}
              loading={townsLoading}
            />
          </div>

          {/* Address Lines */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 1 (番地) *</Label>
            <Input
              placeholder="1-2-3"
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              onBlur={handleBlurJP}
              required
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
      ) : country === 'PH' ? (
        /* Philippines-specific format (matches LBC / J&T / PHLPost label conventions) */
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">House #, Unit, Bldg *</Label>
            <Input
              placeholder="123 Mango St., Unit 4B"
              value={phHouse}
              onChange={(e) => setPhHouse(e.target.value)}
              onBlur={handleBlurPH}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Street / Subdivision</Label>
            <Input
              placeholder="Sunset Village"
              value={phStreet}
              onChange={(e) => setPhStreet(e.target.value)}
              onBlur={handleBlurPH}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Barangay *</Label>
            <Input
              placeholder="Barangay San Antonio"
              value={phBarangay}
              onChange={(e) => setPhBarangay(e.target.value)}
              onBlur={handleBlurPH}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">City / Municipality *</Label>
            <Input
              placeholder="Makati City"
              value={phCity}
              onChange={(e) => setPhCity(e.target.value)}
              onBlur={handleBlurPH}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Province *</Label>
            <SimpleCombobox
              options={PHILIPPINES_PROVINCES}
              value={phProvince}
              onChange={(v) => {
                setPhProvince(v)
                setTimeout(emitPH, 0)
              }}
              placeholder="Select province…"
              searchPlaceholder="Type to filter (Metro, Cebu, ...)"
              emptyText="No province matches that search."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">ZIP Code</Label>
            <Input
              placeholder="1203"
              value={phPostal}
              onChange={(e) => setPhPostal(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onBlur={handleBlurPH}
              inputMode="numeric"
              maxLength={4}
              className="w-28"
            />
          </div>
        </div>
      ) : (
        /* Generic international address (WooCommerce/PayPal style) */
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Address Line 1 *</Label>
            <Input
              placeholder="123 Main Street"
              value={intlLine1}
              onChange={(e) => setIntlLine1(e.target.value)}
              onBlur={handleBlurIntl}
              required
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
