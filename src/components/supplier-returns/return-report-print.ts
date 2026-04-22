export interface ReturnReportData {
  return_code: string
  requested_at: string
  reason: string
  item: {
    item_code: string
    brand: string | null
    model_name: string | null
    color: string | null
    serial_number: string | null
    purchase_price: number | null
    specs: {
      cpu: string | null
      ram_gb: string | null
      storage_gb: string | null
    } | null
  } | null
  supplier_name: string | null
  receipt_image_url: string | null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatJPY(amount: number): string {
  return `¥${amount.toLocaleString()}`
}

export function printReturnReport(data: ReturnReportData): void {
  const item = data.item
  const specs = item?.specs

  const specsRows = [
    item?.brand && `<tr><td>Brand</td><td>${escapeHtml(item.brand)}</td></tr>`,
    item?.model_name && `<tr><td>Model</td><td>${escapeHtml(item.model_name)}</td></tr>`,
    item?.color && `<tr><td>Color</td><td>${escapeHtml(item.color)}</td></tr>`,
    specs?.cpu && `<tr><td>CPU</td><td>${escapeHtml(specs.cpu)}</td></tr>`,
    specs?.ram_gb && `<tr><td>RAM</td><td>${escapeHtml(specs.ram_gb)}</td></tr>`,
    specs?.storage_gb && `<tr><td>Storage</td><td>${escapeHtml(specs.storage_gb)}</td></tr>`,
    item?.serial_number && `<tr><td>Serial Number</td><td>${escapeHtml(item.serial_number)}</td></tr>`,
    item?.purchase_price != null && `<tr><td>Purchase Price</td><td>${formatJPY(item.purchase_price)}</td></tr>`,
  ].filter(Boolean).join('\n')

  const receiptSection = data.receipt_image_url
    ? `<div class="section">
        <h2>Receipt</h2>
        <img src="${data.receipt_image_url}" class="receipt-img" />
      </div>`
    : ''

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Supplier Return Report — ${escapeHtml(data.return_code)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px;
    line-height: 1.5;
    color: #111;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .company {
    font-size: 18px;
    font-weight: bold;
  }
  .company-sub {
    font-size: 10px;
    color: #666;
  }
  .return-code {
    font-size: 22px;
    font-weight: bold;
    font-family: monospace;
    text-align: right;
  }
  .date {
    font-size: 11px;
    color: #666;
    text-align: right;
  }
  .section {
    margin-bottom: 20px;
  }
  h2 {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  table td {
    padding: 4px 8px;
    font-size: 12px;
    vertical-align: top;
  }
  table td:first-child {
    width: 140px;
    color: #666;
    font-weight: 500;
  }
  .reason-text {
    white-space: pre-wrap;
    font-size: 12px;
    line-height: 1.6;
  }
  .receipt-img {
    max-width: 100%;
    max-height: 300px;
    border: 1px solid #ddd;
    margin-top: 8px;
  }
  .p-code {
    font-family: monospace;
    font-weight: bold;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">Dealz K.K.</div>
      <div class="company-sub">Supplier Return Report</div>
    </div>
    <div>
      <div class="return-code">${escapeHtml(data.return_code)}</div>
      <div class="date">${formatDate(data.requested_at)}</div>
    </div>
  </div>

  ${data.supplier_name ? `<div class="section">
    <h2>Supplier</h2>
    <p style="font-size: 14px; font-weight: 500;">${escapeHtml(data.supplier_name)}</p>
  </div>` : ''}

  ${item ? `<div class="section">
    <h2>Item Details</h2>
    <p class="p-code" style="margin-bottom: 8px;">${escapeHtml(item.item_code)}</p>
    <table>${specsRows}</table>
  </div>` : ''}

  <div class="section">
    <h2>Return Reason</h2>
    <p class="reason-text">${escapeHtml(data.reason)}</p>
  </div>

  ${receiptSection}
</body>
</html>`

  const existing = document.getElementById('return-report-print-frame')
  if (existing) existing.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'return-report-print-frame'
  iframe.style.position = 'fixed'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  iframe.style.left = '-9999px'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document
  if (!iframeDoc) return
  iframeDoc.open()
  iframeDoc.write(html)
  iframeDoc.close()

  setTimeout(() => {
    iframe.contentWindow?.print()
    setTimeout(() => {
      iframe.remove()
    }, 1000)
  }, 250)
}
