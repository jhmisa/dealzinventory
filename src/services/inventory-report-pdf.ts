import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
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

function fmtPrice(yen: number | null | undefined): string {
  if (yen == null) return '—'
  return `¥${yen.toLocaleString('ja-JP')}`
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
  const boxW = (usable - 16) / 5  // 5 boxes, 4 gaps of 4pt each
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

    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(kpi.label.toUpperCase(), x + boxW / 2, startY + 8, { align: 'center' })

    // Value
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

function addBreakdownGrid(doc: jsPDF, snapshot: InventorySnapshot, startY: number): number {
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const halfW = (pageW - margin * 2 - 10) / 2

  const breakdowns: { title: string; data: Record<string, { count: number; value: number }> }[] = [
    { title: 'By Status', data: snapshot.summary_by_status },
    { title: 'By Brand', data: snapshot.summary_by_brand },
    { title: 'By Source', data: snapshot.summary_by_source },
    { title: 'By Grade', data: snapshot.summary_by_grade },
  ]

  let maxY = startY

  breakdowns.forEach((bd, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = margin + col * (halfW + 10)

    const entries = Object.entries(bd.data)
      .sort((a, b) => b[1].value - a[1].value)
    const totalCount = entries.reduce((s, [, d]) => s + d.count, 0)
    const totalValue = entries.reduce((s, [, d]) => s + d.value, 0)

    const body = entries.map(([key, { count, value }]) => [key, count.toLocaleString(), fmtPrice(value)])
    body.push(['Total', totalCount.toLocaleString(), fmtPrice(totalValue)])

    const tableStartY = row === 0 ? startY : maxY + 4

    // Section title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.brand)
    doc.text(bd.title, x, tableStartY + 3)

    autoTable(doc, {
      startY: tableStartY + 6,
      margin: { left: x, right: pageW - x - halfW },
      tableWidth: halfW,
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
        1: { halign: 'right', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 30 },
      },
      didParseCell(data) {
        // Bold the total row
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = COLORS.totalRowBg
        }
      },
    })

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    if (finalY > maxY) maxY = finalY
  })

  return maxY + 6
}

function addItemsTable(doc: jsPDF, items: InventorySnapshotItem[], startY: number): number {
  const itemRows = items.filter((i) => i.item_type === 'item')
  if (itemRows.length === 0) return startY

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.brand)
  doc.text(`Items (${itemRows.length})`, 20, startY + 4)

  const body = itemRows.map((item) => [
    item.item_code,
    item.brand ?? '—',
    item.model_name ?? '—',
    item.condition_grade ?? '—',
    item.item_status,
    item.source_type ?? '—',
    fmtPrice(item.purchase_price),
    fmtPrice(item.additional_costs),
    fmtPrice(item.total_cost),
  ])

  autoTable(doc, {
    startY: startY + 8,
    margin: { left: 20, right: 20 },
    head: [['Code', 'Brand', 'Model', 'Grade', 'Status', 'Source', 'Purchase', 'Add\'l', 'Total']],
    body,
    theme: 'striped',
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: COLORS.brand,
      lineColor: COLORS.border,
      lineWidth: 0.2,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: COLORS.brand,
      textColor: COLORS.white,
      fontStyle: 'bold',
      fontSize: 6.5,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 18, font: 'courier' },
      1: { cellWidth: 18 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 20 },
      5: { cellWidth: 18 },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 18, halign: 'right' },
      8: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
    },
    didDrawPage(data) {
      // Footer on every page
      const pageH = doc.internal.pageSize.getHeight()
      const pageW = doc.internal.pageSize.getWidth()
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COLORS.muted)
      doc.text('Dealz K.K. — Confidential', 20, pageH - 8)
      const pageNum = (doc as unknown as { getNumberOfPages: () => number }).getNumberOfPages()
      const currentPage = doc.getCurrentPageInfo().pageNumber
      doc.text(`Page ${currentPage} of ${pageNum}`, pageW - 20, pageH - 8, { align: 'right' })

      // Top accent bar on continuation pages
      if (data.pageNumber > 1) {
        doc.setFillColor(...COLORS.brand)
        doc.rect(0, 0, pageW, 2, 'F')
      }
    },
  })

  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
}

function addAccessoriesTable(doc: jsPDF, items: InventorySnapshotItem[], startY: number): number {
  const accRows = items.filter((i) => i.item_type === 'accessory')
  if (accRows.length === 0) return startY

  // Check if we need a new page (at least 40pt needed for header + a few rows)
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
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
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
      0: { cellWidth: 22, font: 'courier' },
      1: { cellWidth: 25 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
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

export function downloadInventoryPdf(snapshot: InventorySnapshot, items: InventorySnapshotItem[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })

  // Page 1: Summary
  addHeader(doc, snapshot)
  let y = 42
  y = addKpiRow(doc, snapshot, y)
  y = addAccessorySummary(doc, snapshot, y)
  y = addBreakdownGrid(doc, snapshot, y)

  // Page 2+: Item line-items
  doc.addPage()
  let itemY = 12
  itemY = addItemsTable(doc, items, itemY)
  addAccessoriesTable(doc, items, itemY)

  addFooter(doc)

  const filename = `dealz-inventory-${snapshot.period_label.replace(/\s+/g, '-').toLowerCase()}.pdf`
  doc.save(filename)
}
