import { formatDate } from '@/lib/utils'
import {
  isJPAddress,
  isLegacyAddress,
  serializeAddress,
  formatPostalCode,
  type ShippingAddress,
} from '@/lib/address-types'
import { ORDER_SOURCES } from '@/lib/constants'
import { buildShortDescription } from '@/lib/utils'

interface OrderCustomer {
  customer_code: string
  last_name: string
  first_name: string | null
  email: string | null
  phone: string | null
}

interface OrderItemData {
  id: string
  item_id: string | null
  description: string | null
  quantity: number
  unit_price: number
  discount: number
  items: {
    id: string
    item_code: string
    condition_grade: string
    condition_notes: string | null
    item_status: string
    cpu: string | null
    ram_gb: number | null
    storage_gb: number | null
    screen_size: number | null
    os_family: string | null
    color: string | null
    product_models: {
      brand: string
      model_name: string
      color: string | null
      cpu: string | null
      ram_gb: number | null
      storage_gb: number | null
      screen_size: number | null
      os_family: string | null
      short_description: string | null
      categories: { description_fields: string[] } | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

interface InvoiceOrder {
  id: string
  order_code: string
  order_status: string
  order_source: string
  quantity: number
  total_price: number
  shipping_address: string | null
  shipping_cost: number | null
  notes: string | null
  created_at: string
  customers: OrderCustomer | null
  order_items: OrderItemData[]
}

export interface InvoicePdfData {
  order: InvoiceOrder
  salesAgent: string
}

function formatYen(amount: number): string {
  return `&yen;${amount.toLocaleString('ja-JP')}`
}

function parseAddress(raw: string | null): ShippingAddress | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ShippingAddress
  } catch {
    return null
  }
}

function buildRomajiAddress(addr: ShippingAddress): string {
  if (isLegacyAddress(addr)) return addr.freeform_legacy
  if (isJPAddress(addr)) {
    const parts: string[] = []
    if (addr.postal_code) parts.push(formatPostalCode(addr.postal_code))
    const line = [addr.prefecture_en, addr.city_en, addr.town_en].filter(Boolean).join(' ')
    if (line) parts.push(line)
    if (addr.address_line_1) parts.push(addr.address_line_1)
    if (addr.address_line_2) parts.push(addr.address_line_2)
    return parts.join(' ')
  }
  return serializeAddress(addr)
}

function buildItemDescription(oi: OrderItemData): string {
  const item = oi.items
  if (!item) return oi.description ?? 'Custom item'

  const pm = item.product_models
  if (!pm) return oi.description ?? item.item_code

  const parts: string[] = []

  parts.push(`RANK ${item.condition_grade}`)
  parts.push(`${pm.brand} ${pm.model_name}`)

  const descFields = pm.categories?.description_fields
  if (descFields && descFields.length > 0) {
    const resolved: Record<string, unknown> = {}
    for (const key of descFields) {
      resolved[key] = (item as Record<string, unknown>)[key] ?? (pm as Record<string, unknown>)[key]
    }
    const desc = buildShortDescription(resolved, descFields)
    if (desc) parts.push(desc)
  } else {
    const specs: string[] = []
    const ram = item.ram_gb ?? pm.ram_gb
    if (ram) specs.push(`${ram}GB`)
    const storage = item.storage_gb ?? pm.storage_gb
    if (storage) specs.push(`${storage}GB`)
    const screen = item.screen_size ?? pm.screen_size
    if (screen) specs.push(`${screen}"`)
    const os = item.os_family ?? pm.os_family
    if (os) specs.push(os)
    const color = item.color ?? pm.color
    if (color) specs.push(color)
    if (specs.length > 0) parts.push(specs.join(' | '))
  }

  return parts.join(' | ')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildInvoiceHtml(order: InvoiceOrder, salesAgent: string): string {
  const customer = order.customers
  const customerName = customer
    ? [customer.last_name, customer.first_name].filter(Boolean).join(' ')
    : '—'

  const orderItems = order.order_items ?? []

  // Build address HTML — show both English and Japanese with labels
  let addressHtml = ''
  const addr = parseAddress(order.shipping_address)
  if (addr) {
    const romajiLine = escapeHtml(buildRomajiAddress(addr))
    const jaLine = escapeHtml(serializeAddress(addr))
    addressHtml = `
      <div class="address-line"><span class="address-lang">EN</span> ${romajiLine}</div>
      <div class="address-line"><span class="address-lang">JP</span> ${jaLine}</div>`
  } else if (order.shipping_address) {
    addressHtml = `<div>${escapeHtml(order.shipping_address)}</div>`
  }

  // Build table rows
  const tableRows = orderItems
    .map((oi) => {
      const itemCode = escapeHtml(oi.items?.item_code ?? 'CUSTOM')
      const description = escapeHtml(buildItemDescription(oi))
      const lineTotal = oi.unit_price * oi.quantity - oi.discount
      return `<tr>
        <td>${itemCode}</td>
        <td>${description}</td>
        <td style="text-align:center">${oi.quantity}</td>
        <td style="text-align:right">${formatYen(oi.unit_price)}</td>
        <td style="text-align:right">${formatYen(oi.discount)}</td>
        <td style="text-align:right">${formatYen(lineTotal)}</td>
      </tr>`
    })
    .join('')

  // Calculate totals
  const subtotal = orderItems.reduce((sum, oi) => sum + oi.unit_price * oi.quantity, 0)
  const totalDiscount = orderItems.reduce((sum, oi) => sum + oi.discount, 0)
  const shippingCost = order.shipping_cost ?? 0
  const afterDiscount = subtotal - totalDiscount
  const charges = Math.round((afterDiscount) * 10 / 110)
  const total = afterDiscount + shippingCost

  const sourceCfg = ORDER_SOURCES.find((s) => s.value === order.order_source)
  const sourceLabel = escapeHtml(sourceCfg?.label ?? order.order_source)

  const itemCount = orderItems.reduce((sum, oi) => sum + oi.quantity, 0)

  const remarksHtml = order.notes
    ? `<tr>
        <td class="label">REMARKS</td>
        <td>${escapeHtml(order.notes)}</td>
      </tr>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(order.order_code)} Invoice</title>
<style>
  @page {
    size: A4;
    margin: 12mm 14mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    color: #000;
    line-height: 1.4;
  }
  .page {
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 8px;
    border-bottom: 1.5px solid #000;
  }
  .logo {
    font-size: 28pt;
    font-weight: bold;
    line-height: 1;
  }
  .logo-kk {
    font-size: 8pt;
    font-weight: bold;
    vertical-align: super;
    margin-left: 2px;
  }
  .company-info {
    text-align: right;
    font-size: 7.5pt;
    color: #555;
    line-height: 1.6;
  }

  /* Customer + Invoice title row */
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-top: 14px;
  }
  .customer-section { max-width: 55%; }
  .invoice-section { text-align: right; }
  .invoice-title {
    font-size: 28pt;
    font-weight: bold;
    letter-spacing: 6px;
  }
  .customer-name {
    font-size: 16pt;
    font-weight: bold;
    margin: 4px 0 8px;
  }
  .customer-detail {
    display: flex;
    gap: 8px;
    margin-bottom: 3px;
  }
  .label {
    font-weight: bold;
    color: #666;
    white-space: nowrap;
    min-width: 100px;
  }
  .order-label {
    font-size: 7.5pt;
    color: #666;
    margin-top: 4px;
  }
  .order-code {
    font-size: 16pt;
    font-weight: bold;
    margin: 4px 0 2px;
  }
  .order-date {
    font-size: 10pt;
  }
  .address-block {
    margin-top: 6px;
  }
  .address-block .label {
    margin-bottom: 4px;
  }
  .address-line {
    margin-bottom: 2px;
    line-height: 1.5;
  }
  .address-lang {
    display: inline-block;
    width: 20px;
    font-size: 6.5pt;
    font-weight: bold;
    color: #999;
    letter-spacing: 0.5px;
  }

  /* Line items table */
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
    font-size: 8pt;
  }
  .items-table th {
    background: #f0f0f0;
    font-weight: bold;
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid #ccc;
  }
  .items-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }
  .items-table th:nth-child(3),
  .items-table th:nth-child(4),
  .items-table th:nth-child(5),
  .items-table th:nth-child(6) { text-align: right; }
  .items-table th:nth-child(3) { text-align: center; }
  .col-item { width: 60px; }
  .col-qty { width: 40px; }
  .col-unit, .col-disc, .col-price { width: 70px; }

  /* Footer section */
  .footer-section {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;
    gap: 20px;
  }
  .footer-left { flex: 1; }
  .footer-right { min-width: 220px; }
  .detail-table {
    font-size: 8pt;
    border-collapse: collapse;
  }
  .detail-table td {
    padding: 3px 0;
    vertical-align: top;
  }
  .detail-table .label {
    padding-right: 12px;
  }

  /* Totals */
  .totals-table {
    font-size: 8pt;
    border-collapse: collapse;
    width: 100%;
  }
  .totals-table td {
    padding: 3px 0;
  }
  .totals-table .value {
    text-align: right;
  }
  .totals-table .total-row td {
    padding-top: 8px;
    border-top: 1px solid #000;
    font-weight: bold;
  }
  .totals-table .total-row .value {
    font-size: 16pt;
  }
  .payment-method {
    text-align: right;
    font-size: 8pt;
    color: #666;
    margin-top: 4px;
  }

  /* Bottom section */
  .bottom-section {
    margin-top: 18px;
    font-size: 8pt;
  }
  .bottom-section .row {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }
  .warranty-text {
    font-size: 7pt;
    margin-top: 4px;
  }
  .thank-you {
    text-align: right;
    font-size: 10pt;
    font-weight: bold;
    margin-top: 14px;
  }

  /* Page footer */
  .page-footer {
    margin-top: 24px;
    font-size: 7.5pt;
    color: #999;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <span class="logo">dealz</span><span class="logo-kk">K.K.</span>
    </div>
    <div class="company-info">
      Yehey Japan Co. Ltd. is now Dealz K.K. (株式会社ディールズ)<br>
      121-0011 Tokyo-to Adachi-ku Chuohoncho 3-5-3 TF Biru B1F<br>
      @dealzjp / 03-4550-1409 / hi@dealz.jp / dealz.jp
    </div>
  </div>

  <!-- Customer + Invoice -->
  <div class="info-row">
    <div class="customer-section">
      <div class="label" style="font-size:7.5pt">CUSTOMER</div>
      <div class="customer-name">${escapeHtml(customerName)}</div>
      <div class="customer-detail">
        <span class="label">EMAIL</span>
        <span>${escapeHtml(customer?.email ?? '—')}</span>
      </div>
      <div class="customer-detail">
        <span class="label">PHONE</span>
        <span>${escapeHtml(customer?.phone ?? '—')}</span>
      </div>
      <div class="address-block">
        <div class="label">SHIPPING ADDRESS</div>
        ${addressHtml}
      </div>
    </div>
    <div class="invoice-section">
      <div class="invoice-title">INVOICE</div>
      <div class="order-label">ORDER NUMBER AND ORDER DATE</div>
      <div class="order-code">${escapeHtml(order.order_code)}</div>
      <div class="order-date">${escapeHtml(formatDate(order.created_at))}</div>
    </div>
  </div>

  <!-- Line items -->
  <table class="items-table">
    <thead>
      <tr>
        <th class="col-item">ITEM</th>
        <th>DESCRIPTION</th>
        <th class="col-qty">QTY</th>
        <th class="col-unit">UNIT</th>
        <th class="col-disc">DISCOUNT</th>
        <th class="col-price">PRICE</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <!-- Footer: details + totals -->
  <div class="footer-section">
    <div class="footer-left">
      <table class="detail-table">
        <tr>
          <td class="label">DETAILS</td>
          <td>Items: ${itemCount}</td>
        </tr>
        <tr>
          <td class="label">TERMS</td>
          <td>${sourceLabel}</td>
        </tr>
        ${remarksHtml}
      </table>
    </div>
    <div class="footer-right">
      <table class="totals-table">
        <tr>
          <td class="label">DISCOUNTS</td>
          <td class="value">${formatYen(totalDiscount)}</td>
        </tr>
        <tr>
          <td class="label">SUB-TOTAL</td>
          <td class="value">${formatYen(subtotal - totalDiscount)}</td>
        </tr>
        <tr>
          <td class="label">SHIPPING</td>
          <td class="value">${formatYen(shippingCost)}</td>
        </tr>
        <tr>
          <td class="label">CHARGES</td>
          <td class="value">${formatYen(charges)}</td>
        </tr>
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="value">${formatYen(total)}</td>
        </tr>
      </table>
      <div class="payment-method">${sourceLabel}</div>
    </div>
  </div>

  <!-- Sales agent + warranty -->
  <div class="bottom-section">
    <div class="row">
      <span class="label">SALES AGENT</span>
      <span>${escapeHtml(salesAgent || '—')}</span>
    </div>
    <div class="row">
      <span class="label">WARRANTY INFORMATION</span>
    </div>
    <div class="warranty-text">
      7 days replacement for defective items / Brand New – 3 months / Refurbished – 1 month
    </div>
    <div class="thank-you">Thank you for choosing Dealz!</div>
  </div>

  <!-- Page footer -->
  <div class="page-footer">
    Dealz K.K. — ${escapeHtml(order.order_code)}
  </div>

</div>
</body>
</html>`
}

export function printInvoice({ order, salesAgent }: InvoicePdfData): void {
  const html = buildInvoiceHtml(order, salesAgent)
  const win = window.open('', '_blank', 'width=800,height=1100')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.addEventListener('afterprint', () => win.close())
  setTimeout(() => win.print(), 250)
}
