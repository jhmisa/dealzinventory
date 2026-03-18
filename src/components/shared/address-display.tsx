import type { ShippingAddress } from '@/lib/address-types'
import { isJPAddress, isIntlAddress, isLegacyAddress, formatPostalCode } from '@/lib/address-types'

interface AddressDisplayProps {
  address: ShippingAddress | string | null
  format?: 'jp' | 'en' | 'auto'
  className?: string
  careOf?: string
}

export function AddressDisplay({ address: rawAddress, format = 'auto', className, careOf }: AddressDisplayProps) {
  if (!rawAddress) return <span className="text-muted-foreground">-</span>

  // Handle JSON string from database (shipping_address stored as text/jsonb)
  let address: ShippingAddress
  if (typeof rawAddress === 'string') {
    try {
      address = JSON.parse(rawAddress) as ShippingAddress
    } catch {
      // Treat unparseable strings as legacy freeform addresses
      return (
        <div className={className}>
          {careOf ? <p className="text-sm font-medium">C/O {careOf}</p> : null}
          <p className="whitespace-pre-wrap text-sm">{rawAddress}</p>
        </div>
      )
    }
  } else {
    address = rawAddress
  }

  const careOfLine = careOf ? <p className="text-sm font-medium">C/O {careOf}</p> : null

  if (isLegacyAddress(address)) {
    return (
      <div className={className}>
        {careOfLine}
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
          {careOfLine}
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
        {careOfLine}
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
        {careOfLine}
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
