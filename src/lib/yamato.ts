import * as XLSX from 'xlsx'
import { formatCustomerName } from '@/lib/utils'
import {
  type ShippingAddress,
  type ShippingAddressJP,
  isJPAddress,
  isLegacyAddress,
} from './address-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DempyoCustomer {
  last_name: string
  first_name: string | null
  phone: string | null
}

interface DempyoOrderItem {
  item_id: string | null
  description: string | null
  items: { item_code: string } | null
}

interface DempyoOrder {
  id: string
  order_code: string
  total_price: number
  shipping_address: string | null
  payment_method: string | null
  delivery_date: string | null
  delivery_time_code: string | null
  delivery_box_count: number
  customers: DempyoCustomer | null
  order_items: DempyoOrderItem[]
}

export interface DempyoValidationResult {
  valid: DempyoOrder[]
  skipped: { order: DempyoOrder; reason: string }[]
  warnings: { order: DempyoOrder; message: string }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colToIndex(col: string): number {
  let idx = 0
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64)
  }
  return idx - 1
}

function parseAddress(raw: string | null): ShippingAddress | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShippingAddress
  } catch {
    return null
  }
}

function formatPhone(phone: string | null): string {
  if (!phone) return ''
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '')
  // Common JP patterns: 090-1234-5678, 03-1234-5678
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

function buildFullJPAddress(addr: ShippingAddressJP): string {
  const parts = [
    addr.prefecture_ja,
    addr.city_ja,
    addr.town_ja,
    addr.address_line_1,
    addr.address_line_2,
  ].filter(Boolean)
  return parts.join(' ')
}

function buildEnglishRef(addr: ShippingAddressJP): string {
  const parts = [
    addr.prefecture_en,
    addr.city_en,
    addr.town_en,
    addr.address_line_1,
  ].filter(Boolean)
  return parts.join(' ')
}

function isCODLike(method: string): boolean {
  return method === 'COD' || method === 'CREDIT_CARD'
}

function isPrepaid(method: string): boolean {
  return method === 'BANK' || method === 'KONBINI' || method === 'CASH'
}

function paymentMethodText(method: string): string {
  if (method === 'COD' || method === 'CREDIT_CARD') return 'Cash on Delivery'
  if (method === 'BANK') return 'Bank'
  if (method === 'KONBINI') return 'Konbini'
  if (method === 'CASH') return 'Cash'
  return ''
}

function timeCodeToNumber(code: string | null): number | null {
  if (!code) return null
  const map: Record<string, number> = {
    '01': 1,
    '14': 14,
    '16': 16,
    '04': 4,
  }
  return map[code] ?? null
}

function formatDeliveryDate(date: string | null): string {
  if (!date) return ''
  // Expect ISO date string like "2026-03-30" -> "20260330"
  return date.replace(/-/g, '')
}

function buildItemDescription(orderItems: DempyoOrderItem[]): string {
  const codes = orderItems
    .map((oi) => oi.items?.item_code)
    .filter((c): c is string => !!c)
  return codes.join(' / ')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateOrders(orders: DempyoOrder[]): DempyoValidationResult {
  const valid: DempyoOrder[] = []
  const skipped: { order: DempyoOrder; reason: string }[] = []
  const warnings: { order: DempyoOrder; message: string }[] = []

  for (const order of orders) {
    const addr = parseAddress(order.shipping_address)

    // Skip silently: non-JP or legacy address
    if (!addr || !isJPAddress(addr)) {
      if (addr && isLegacyAddress(addr)) {
        // Legacy — skip silently
        continue
      }
      // Non-JP or null — skip silently
      continue
    }

    // Skip with warning: missing recipient name
    if (!order.customers?.last_name) {
      skipped.push({ order, reason: 'Missing recipient name' })
      continue
    }

    // Skip with warning: missing postal code
    if (!addr.postal_code) {
      skipped.push({ order, reason: 'Missing postal code' })
      continue
    }

    // Default payment method to COD (matches Order Detail UI behavior)
    const paymentMethod = order.payment_method ?? 'COD'

    // Warn (but include) if full address > 48 chars after removing spaces
    const fullAddr = buildFullJPAddress(addr)
    if (fullAddr.replace(/\s/g, '').length > 48) {
      warnings.push({
        order,
        message: `Address exceeds 48 characters (${fullAddr.replace(/\s/g, '').length} chars)`,
      })
    }

    valid.push(order)
  }

  return { valid, skipped, warnings }
}

// ---------------------------------------------------------------------------
// XLSX Generation
// ---------------------------------------------------------------------------

function writeCell(
  ws: XLSX.WorkSheet,
  row: number,
  col: string,
  value: string | number | null | undefined,
) {
  if (value == null || value === '') return
  const cellAddr = XLSX.utils.encode_cell({ r: row, c: colToIndex(col) })
  if (typeof value === 'number') {
    ws[cellAddr] = { t: 'n', v: value }
  } else {
    ws[cellAddr] = { t: 's', v: value }
  }
}

function writeOrderRows(
  ws: XLSX.WorkSheet,
  order: DempyoOrder,
  startRow: number,
): number {
  const addr = parseAddress(order.shipping_address) as ShippingAddressJP
  const customer = order.customers
  const method = order.payment_method ?? 'COD'
  const boxCount = order.delivery_box_count || 1
  const isMultiBox = boxCount > 1
  const isCod = isCODLike(method)

  // Determine how many rows this order needs
  const rowCount = isMultiBox && isCod ? boxCount : 1

  for (let i = 0; i < rowCount; i++) {
    const r = startRow + i

    // D: Recipient name
    const name = customer ? formatCustomerName(customer) : ''
    writeCell(ws, r, 'D', name)

    // F: Phone
    writeCell(ws, r, 'F', formatPhone(customer?.phone ?? null))

    // H: English address reference
    writeCell(ws, r, 'H', buildEnglishRef(addr))

    // M: Postal code
    writeCell(ws, r, 'M', addr.postal_code)

    // P: Full JP address
    writeCell(ws, r, 'P', buildFullJPAddress(addr))

    // U: Postal code (duplicate)
    writeCell(ws, r, 'U', addr.postal_code)

    // AF: COD amount — only on first row for multi-box COD, always for single
    if (isCod && (i === 0 || !isMultiBox)) {
      writeCell(ws, r, 'AF', order.total_price)
    }

    // AN: Payment method text
    writeCell(ws, r, 'AN', paymentMethodText(method))

    // AV: Time slot
    const timeNum = timeCodeToNumber(order.delivery_time_code)
    if (timeNum !== null) {
      writeCell(ws, r, 'AV', timeNum)
    }

    // AW: Delivery date
    writeCell(ws, r, 'AW', formatDeliveryDate(order.delivery_date))

    // AZ: Item description
    writeCell(ws, r, 'AZ', buildItemDescription(order.order_items))

    // BC: Order reference
    writeCell(ws, r, 'BC', order.order_code)

    // Multi-box fields
    if (isMultiBox) {
      // AM: Multi-box flag
      writeCell(ws, r, 'AM', 3)

      // BV: Grouping key
      writeCell(ws, r, 'BV', order.order_code)

      // AL: Print count — only for prepaid (single row)
      if (isPrepaid(method)) {
        writeCell(ws, r, 'AL', boxCount)
      }
    }
  }

  return rowCount
}

export async function generateDempyoXlsx(orders: DempyoOrder[]): Promise<Blob> {
  // Fetch the template
  const response = await fetch('/templates/yamato-template.xlsx')
  const arrayBuffer = await response.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

  const sheetName = '\u30C7\u30FC\u30BF\u8CBC\u4ED8' // データ貼付
  const ws = wb.Sheets[sheetName]

  if (!ws) {
    throw new Error(`Sheet "${sheetName}" not found in template`)
  }

  // Clear existing data in Sheet 2
  // Get the range and remove all cell data
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r, c })
      delete ws[cellAddr]
    }
  }

  // Write order rows (no header, data starts at row 0)
  let currentRow = 0
  for (const order of orders) {
    const rowsWritten = writeOrderRows(ws, order, currentRow)
    currentRow += rowsWritten
  }

  // Update the sheet range
  if (currentRow > 0) {
    // BV is the last column we write to (index 73)
    const maxCol = colToIndex('BV')
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: currentRow - 1, c: maxCol },
    })
  } else {
    ws['!ref'] = 'A1'
  }

  // Generate output
  const output = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function generateDempyoFilename(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`
  return `${date}-${time}-yamato.xlsx`
}
