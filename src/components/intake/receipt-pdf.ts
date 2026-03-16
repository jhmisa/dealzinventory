import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { IntakeReceipt, IntakeReceiptLineItem, IntakeAdjustment } from '@/lib/types'

interface ReceiptPdfData {
  receipt: IntakeReceipt & { suppliers?: { supplier_name: string } | null }
  lineItems: IntakeReceiptLineItem[]
  adjustments: IntakeAdjustment[]
}

export function generateReceiptPdf({ receipt, lineItems, adjustments }: ReceiptPdfData) {
  const doc = new jsPDF()

  // Header
  doc.setFontSize(18)
  doc.text('Receiving Report', 14, 22)

  doc.setFontSize(11)
  doc.text(receipt.receipt_code, 14, 30)

  // Receipt details
  doc.setFontSize(9)
  const details = [
    ['Supplier', (receipt as { suppliers?: { supplier_name: string } | null }).suppliers?.supplier_name ?? '—'],
    ['Source', receipt.source_type],
    ['Date Received', receipt.date_received ?? '—'],
    ['Total Items', String(receipt.total_items)],
    ['Total Cost', `¥${(receipt.total_cost ?? 0).toLocaleString('ja-JP')}`],
    ['P-Code Range', `${receipt.p_code_range_start} → ${receipt.p_code_range_end}`],
  ]

  let y = 38
  for (const [label, value] of details) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, 55, y)
    y += 6
  }

  if (receipt.notes) {
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(receipt.notes, 55, y, { maxWidth: 140 })
    y += 10
  }

  // Line items table
  y += 4
  doc.setFontSize(12)
  doc.text('Line Items', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Total']],
    body: lineItems.map((item) => [
      String(item.line_number),
      item.product_description,
      String(item.quantity),
      `¥${(item.unit_price ?? 0).toLocaleString('ja-JP')}`,
      `¥${(item.line_total ?? 0).toLocaleString('ja-JP')}`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  })

  // Adjustments (if any)
  if (adjustments.length > 0) {
    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20
    doc.setFontSize(12)
    doc.text('Adjustments', 14, finalY + 10)

    autoTable(doc, {
      startY: finalY + 14,
      head: [['Code', 'Type', 'Qty', 'Reason', 'Date']],
      body: adjustments.map((adj) => [
        adj.adjustment_code,
        adj.adjustment_type,
        String(adj.quantity),
        adj.reason,
        adj.created_at ? new Date(adj.created_at).toLocaleDateString('ja-JP') : '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [192, 57, 43] },
    })
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(
      `Dealz K.K. — ${receipt.receipt_code} — Page ${i} of ${pageCount}`,
      14,
      doc.internal.pageSize.height - 10,
    )
  }

  doc.save(`${receipt.receipt_code}.pdf`)
}
