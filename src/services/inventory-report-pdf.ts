import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '@/lib/supabase'
import type { InventorySnapshot, InventorySnapshotItem } from './inventory-snapshots'

const COLORS = {
  brand: [15, 23, 42] as [number, number, number],       // slate-900
  accent: [59, 130, 246] as [number, number, number],     // blue-500
  accentLight: [239, 246, 255] as [number, number, number], // blue-50
  muted: [100, 116, 139] as [number, number, number],     // slate-500
  border: [226, 232, 240] as [number, number, number],    // slate-200
  headerBg: [241, 245, 249] as [number, number, number],  // slate-100
  white: [255, 255, 255] as [number, number, number],
  totalRowBg: [248, 250, 252] as [number, number, number], // slate-50
}

const MAX_BREAKDOWN_ROWS = 10

function fmtPrice(yen: number | null | undefined): string {
  if (yen == null) return '—'
  return `¥${yen.toLocaleString('ja-JP')}`
}

async function fetchDescriptions(itemCodes: string[]): Promise<Record<string, string>> {
  if (itemCodes.length === 0) return {}

  const { data } = await supabase
    .from('items')
    .select('item_code, product_models(short_description)')
    .in('item_code', itemCodes)

  const map: Record<string, string> = {}
  if (data) {
    for (const row of data) {
      const pm = row.product_models as unknown as { short_description: string | null } | null
      if (pm?.short_description) {
        map[row.item_code] = pm.short_description
      }
    }
  }
  return map
}

function capBreakdown(
  data: Record<string, { count: number; value: number }>,
  max: number,
): Record<string, { count: number; value: number }> {
  const entries = Object.entries(data).sort((a, b) => b[1].value - a[1].value)
  if (entries.length <= max) return data

  const top = entries.slice(0, max)
  const rest = entries.slice(max)
  const othersCount = rest.reduce((s, [, d]) => s + d.count, 0)
  const othersValue = rest.reduce((s, [, d]) => s + d.value, 0)

  const result: Record<string, { count: number; value: number }> = {}
  for (const [key, val] of top) result[key] = val
  result[`Others (${rest.length})`] = { count: othersCount, value: othersValue }
  return result
}

function addHeader(doc: jsPDF, snapshot: InventorySnapshot) {
  const pageW = doc.internal.pageSize.getWidth()

  // Top accent bar
  doc.setFillColor(...COLORS.brand)
  doc.rect(0, 0, pageW, 3, 'F')

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.brand)
  doc.text('DEALZ K.K.', 20, 20)

  // Report title
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.muted)
  doc.text('Monthly Inventory Report', 20, 27)

  // Period badge on right
  doc.setFillColor(...COLORS.accentLight)
  doc.setDrawColor(...COLORS.accent)
  const periodText = snapshot.period_label
  doc.setFontSize(13)
  const periodW = doc.getTextWidth(periodText) + 16
  doc.roundedRect(pageW - 20 - periodW, 11, periodW, 12, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.accent)
  doc.text(periodText, pageW - 20 - periodW + 8, 19.5)

  // Generated date
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pageW - 20, 30, { align: 'right' })

  // Divider
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(20, 34, pageW - 20, 34)
}

function addKpiRow(doc: jsPDF, snapshot: InventorySnapshot, startY: number): number {
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const usable = pageW - margin * 2
  const boxW = (usable - 16) / 5
  const boxH = 28
  const gap = 4

  const kpis = [
    { label: 'Total Items', value: snapshot.total_items.toLocaleString(), sub: 'units' },
    { label: 'Purchase Cost', value: fmtPrice(snapshot.total_purchase_cost), sub: null },
    { label: 'Additional Costs', value: fmtPrice(snapshot.total_additional_costs), sub: null },
    { label: 'Inventory Value', value: fmtPrice(snapshot.total_inventory_value), sub: null },
    { label: 'Grand Total', value: fmtPrice(snapshot.grand_total), sub: null, highlight: true },
  ]

  kpis.forEach((kpi, i) => {
    const x = margin + i * (boxW + gap)

    if (kpi.highlight) {
      doc.setFillColor(...COLORS.brand)
      doc.roundedRect(x, startY, boxW, boxH, 2, 2, 'F')
      doc.setTextColor(...COLORS.white)
    } else {
      doc.setFillColor(...COLORS.headerBg)
      doc.roundedRect(x, startY, boxW, boxH, 2, 2, 'F')
      doc.setTextColor(...COLORS.muted)
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(kpi.label.toUpperCase(), x + boxW / 2, startY + 8, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(kpi.highlight ? 12 : 11)
    if (!kpi.highlight) doc.setTextColor(...COLORS.brand)
    doc.text(kpi.value, x + boxW / 2, startY + 18, { align: 'center' })

    if (kpi.sub) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...COLORS.muted)
      doc.text(kpi.sub, x + boxW / 2, startY + 23, { align: 'center' })
    }
  })

  return startY + boxH + 6
}

function addAccessorySummary(doc: jsPDF, snapshot: InventorySnapshot, startY: number): number {
  const margin = 20
  const boxW = 50
  const boxH = 18
  const gap = 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.brand)
  doc.text('Accessories', margin, startY + 4)

  const y = startY + 8
  const items = [
    { label: 'SKUs', value: snapshot.total_accessory_skus.toLocaleString() },
    { label: 'Units', value: snapshot.total_accessory_units.toLocaleString() },
    { label: 'Value', value: fmtPrice(snapshot.total_accessory_value) },
  ]

  items.forEach((item, i) => {
    const x = margin + i * (boxW + gap)
    doc.setFillColor(...COLORS.accentLight)
    doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.brand)
    doc.text(item.value, x + boxW / 2, y + 8, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.muted)
    doc.text(item.label, x + boxW / 2, y + 14, { align: 'center' })
  })

  return y + boxH + 6
}

function addBreakdownTable(
  doc: jsPDF,
  title: string,
  data: Record<string, { count: number; value: number }>,
  x: number,
  startY: number,
  tableWidth: number,
): number {
  const pageW = doc.internal.pageSize.getWidth()
  const entries = Object.entries(data).sort((a, b) => b[1].value - a[1].value)
  const totalCount = entries.reduce((s, [, d]) => s + d.count, 0)
  const totalValue = entries.reduce((s, [, d]) => s + d.value, 0)

  const body = entries.map(([key, { count, value }]) => [key, count.toLocaleString(), fmtPrice(value)])
  body.push(['Total', totalCount.toLocaleString(), fmtPrice(totalValue)])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.brand)
  doc.text(title, x, startY + 3)

  autoTable(doc, {
    startY: startY + 6,
    margin: { left: x, right: pageW - x - tableWidth },
    tableWidth,
    head: [['Category', 'Count', 'Value']],
    body,
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 },
      textColor: COLORS.brand,
      lineColor: COLORS.border,
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: COLORS.headerBg,
      textColor: COLORS.muted,
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 30 },
      2: { halign: 'right', cellWidth: 45 },
    },
    didParseCell(data) {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = COLORS.totalRowBg
      }
    },
  })

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

function addBreakdownGrid(doc: jsPDF, snapshot: InventorySnapshot, startY: number): number {
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const halfW = (pageW - margin * 2 - 10) / 2

  // Cap brand at top 10 + Others
  const cappedBrand = capBreakdown(snapshot.summary_by_brand, MAX_BREAKDOWN_ROWS)

  // Row 1: Status (left) + Brand (right)
  const statusY = addBreakdownTable(doc, 'By Status', snapshot.summary_by_status, margin, startY, halfW)
  const brandY = addBreakdownTable(doc, 'By Brand', cappedBrand, margin + halfW + 10, startY, halfW)
  const row1Bottom = Math.max(statusY, brandY)

  // Row 2: Source (left) + Grade (right)
  const row2Start = row1Bottom + 8
  const sourceY = addBreakdownTable(doc, 'By Source', snapshot.summary_by_source, margin, row2Start, halfW)
  const gradeY = addBreakdownTable(doc, 'By Grade', snapshot.summary_by_grade, margin + halfW + 10, row2Start, halfW)

  return Math.max(sourceY, gradeY) + 6
}

function addItemsTable(
  doc: jsPDF,
  items: InventorySnapshotItem[],
  descriptions: Record<string, string>,
  startY: number,
): number {
  const itemRows = items.filter((i) => i.item_type === 'item')
  if (itemRows.length === 0) return startY

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.brand)
  doc.text(`Items (${itemRows.length})`, 20, startY + 4)

  const body = itemRows.map((item) => [
    item.item_code,
    item.brand ?? '—',
    descriptions[item.item_code] || item.model_name || '—',
    item.condition_grade ?? '—',
    item.item_status,
    fmtPrice(item.purchase_price),
    fmtPrice(item.additional_costs),
    fmtPrice(item.total_cost),
  ])

  autoTable(doc, {
    startY: startY + 8,
    margin: { left: 20, right: 20 },
    head: [['Code', 'Brand', 'Description', 'Grade', 'Status', 'Purchase', 'Add\'l', 'Total']],
    body,
    theme: 'striped',
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: COLORS.brand,
      lineColor: COLORS.border,
      lineWidth: 0.2,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: COLORS.brand,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 55, font: 'courier' },  // Code — full P000xxx
      1: { cellWidth: 50 },                     // Brand
      2: { cellWidth: 'auto' },                 // Description — takes remaining space
      3: { cellWidth: 30, halign: 'center' },   // Grade
      4: { cellWidth: 55 },                     // Status
      5: { cellWidth: 55, halign: 'right' },    // Purchase
      6: { cellWidth: 45, halign: 'right' },    // Add'l
      7: { cellWidth: 55, halign: 'right', fontStyle: 'bold' }, // Total
    },
    didDrawPage(data) {
      const pageH = doc.internal.pageSize.getHeight()
      const pageW = doc.internal.pageSize.getWidth()

      // Top accent bar on continuation pages
      if (data.pageNumber > 1) {
        doc.setFillColor(...COLORS.brand)
        doc.rect(0, 0, pageW, 2, 'F')
      }

      // Bottom accent bar
      doc.setFillColor(...COLORS.brand)
      doc.rect(0, pageH - 3, pageW, 3, 'F')

      // Footer text
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.muted)
      doc.text('Dealz K.K. — Confidential', 20, pageH - 6)
      const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
      const currentPage = doc.getCurrentPageInfo().pageNumber
      doc.text(`Page ${currentPage} of ${pageCount}`, pageW - 20, pageH - 6, { align: 'right' })
    },
  })

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
}

function addAccessoriesTable(doc: jsPDF, items: InventorySnapshotItem[], startY: number): number {
  const accRows = items.filter((i) => i.item_type === 'accessory')
  if (accRows.length === 0) return startY

  const pageH = doc.internal.pageSize.getHeight()
  if (startY > pageH - 50) {
    doc.addPage()
    startY = 15
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.brand)
  doc.text(`Accessories (${accRows.length})`, 20, startY + 4)

  const body = accRows.map((item) => [
    item.item_code,
    item.brand ?? '—',
    item.model_name ?? '—',
    (item.stock_quantity ?? 0).toLocaleString(),
    fmtPrice(item.unit_cost),
    fmtPrice(item.total_cost),
  ])

  autoTable(doc, {
    startY: startY + 8,
    margin: { left: 20, right: 20 },
    head: [['Code', 'Brand', 'Name', 'Qty', 'Unit Cost', 'Total']],
    body,
    theme: 'striped',
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      textColor: COLORS.brand,
      lineColor: COLORS.border,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: COLORS.brand,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 55, font: 'courier' },
      1: { cellWidth: 60 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 40, halign: 'right' },
      4: { cellWidth: 55, halign: 'right' },
      5: { cellWidth: 55, halign: 'right', fontStyle: 'bold' },
    },
  })

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

function addFooter(doc: jsPDF) {
  const pageCount = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Bottom accent bar
    doc.setFillColor(...COLORS.brand)
    doc.rect(0, pageH - 3, pageW, 3, 'F')

    // Footer text
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.muted)
    doc.text('Dealz K.K. — Confidential', 20, pageH - 6)
    doc.text(`Page ${i} of ${pageCount}`, pageW - 20, pageH - 6, { align: 'right' })
  }
}

export async function downloadInventoryPdf(snapshot: InventorySnapshot, items: InventorySnapshotItem[]) {
  // Fetch short_descriptions from product_models for all item codes
  const itemCodes = items
    .filter((i) => i.item_type === 'item')
    .map((i) => i.item_code)
  const descriptions = await fetchDescriptions(itemCodes)

  // Page 1: Summary (portrait)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  addHeader(doc, snapshot)
  let y = 42
  y = addKpiRow(doc, snapshot, y)
  y = addAccessorySummary(doc, snapshot, y)
  addBreakdownGrid(doc, snapshot, y)

  // Page 2+: Items table (landscape for full-width columns)
  doc.addPage('a4', 'landscape')
  let itemY = 12
  itemY = addItemsTable(doc, items, descriptions, itemY)
  addAccessoriesTable(doc, items, itemY)

  addFooter(doc)

  const filename = `dealz-inventory-${snapshot.period_label.replace(/\s+/g, '-').toLowerCase()}.pdf`
  doc.save(filename)
}
