import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader, CodeDisplay, TableSkeleton } from '@/components/shared'
import { ConfidenceBadge } from '@/components/intake/confidence-badge'
import { AdjustmentDialog } from '@/components/intake/adjustment-dialog'
import { generateReceiptPdf } from '@/components/intake/receipt-pdf'
import { useIntakeReceipt, useReceiptItems, useReceiptAdjustments } from '@/hooks/use-intake-receipts'
import { formatDate, formatDateTime, formatPrice } from '@/lib/utils'
import { getStatusConfig, getAdjustmentTypeConfig } from '@/lib/constants'
import type { Item, IntakeAdjustment } from '@/lib/types'

export default function ReceivingReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)

  const { data: receipt, isLoading } = useIntakeReceipt(id!)
  const { data: items } = useReceiptItems(id!)
  const { data: adjustments } = useReceiptAdjustments(id!)

  if (isLoading) return <TableSkeleton />
  if (!receipt) return <div>Receipt not found</div>

  // Adjustment summary
  const adjustmentCounts = {
    voided: 0, returned: 0, refunded: 0, missing: 0,
  }
  for (const adj of adjustments ?? []) {
    const key = adj.adjustment_type.toLowerCase() as keyof typeof adjustmentCounts
    adjustmentCounts[key] += adj.quantity
  }
  const totalAdjusted = Object.values(adjustmentCounts).reduce((a, b) => a + b, 0)

  function handleDownloadPdf() {
    generateReceiptPdf({
      receipt: receipt as typeof receipt & { suppliers?: { supplier_name: string } | null },
      lineItems: (receipt as { intake_receipt_line_items?: Array<{ id: string; line_number: number; product_description: string; quantity: number; unit_price: number | null; line_total: number | null; ai_confidence: number | null; product_model_id: string | null; notes: string | null; receipt_id: string; created_at: string | null }> }).intake_receipt_line_items ?? [],
      adjustments: adjustments ?? [],
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/receiving-reports')} aria-label="Back to receiving reports">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={receipt.receipt_code}
          description="Receiving Report Detail"
        />
        <div className="ml-auto">
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Receipt header */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block">Supplier</span>
              <span className="font-medium">
                {(receipt as { suppliers?: { supplier_name: string } | null }).suppliers?.supplier_name ?? '—'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Source</span>
              <span className="font-medium">{receipt.source_type}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Date Received</span>
              <span className="font-medium">{formatDate(receipt.date_received)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total Items</span>
              <span className="font-semibold text-lg">{receipt.total_items}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">P-Code Range</span>
              <span className="font-mono text-sm">
                {receipt.p_code_range_start} → {receipt.p_code_range_end}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total Cost</span>
              <span className="font-semibold">{formatPrice(receipt.total_cost)}</span>
            </div>
            {receipt.supplier_contact_snapshot && (
              <div className="col-span-2">
                <span className="text-muted-foreground block">Supplier Contact</span>
                <span>{receipt.supplier_contact_snapshot}</span>
              </div>
            )}
          </div>
          {receipt.notes && (
            <div className="mt-3 text-sm">
              <span className="text-muted-foreground block">Notes</span>
              <span>{receipt.notes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-center font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {((receipt as { intake_receipt_line_items?: Array<{ line_number: number; product_description: string; quantity: number; unit_price: number | null; line_total: number | null; ai_confidence: number | null }> }).intake_receipt_line_items ?? []).map((item) => (
                  <tr key={item.line_number} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">{item.line_number}</td>
                    <td className="px-3 py-2">{item.product_description}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatPrice(item.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatPrice(item.line_total)}</td>
                    <td className="px-3 py-2 text-center">
                      <ConfidenceBadge confidence={item.ai_confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items ({items?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">P-Code</th>
                  <th className="px-3 py-2 text-left font-medium">Model</th>
                  <th className="px-3 py-2 text-left font-medium">Config</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium min-w-[200px]">Supplier Description</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((item: Item) => {
                  const statusConfig = getStatusConfig(item.item_status)
                  const model = item.brand && item.model_name
                    ? `${item.brand} ${item.model_name}`
                    : '—'
                  const config = [
                    item.cpu,
                    item.ram_gb ? `${item.ram_gb}GB` : null,
                    item.storage_gb ? `${item.storage_gb}GB` : null,
                  ].filter(Boolean).join(' / ') || '—'
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link to={`/admin/items/${item.id}`} className="hover:underline">
                          <CodeDisplay code={item.item_code} />
                        </Link>
                      </td>
                      <td className="px-3 py-2">{model}</td>
                      <td className="px-3 py-2">{config}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusConfig.color}`}
                        >
                          {statusConfig.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]">
                        {item.supplier_description || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Adjustments */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Intake Adjustments</CardTitle>
          <Button size="sm" onClick={() => setAdjustmentOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Adjustment
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Original: </span>
              <span className="font-medium">{receipt.total_items}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Voided: </span>
              <span className="font-medium">{adjustmentCounts.voided}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Returned: </span>
              <span className="font-medium">{adjustmentCounts.returned}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Refunded: </span>
              <span className="font-medium">{adjustmentCounts.refunded}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Missing: </span>
              <span className="font-medium">{adjustmentCounts.missing}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Available: </span>
              <span className="font-semibold">{receipt.total_items - totalAdjusted}</span>
            </div>
          </div>

          {/* Adjustments list */}
          {(adjustments ?? []).length > 0 ? (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Code</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-right font-medium">Items</th>
                    <th className="px-3 py-2 text-left font-medium">Reason</th>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(adjustments ?? []).map((adj: IntakeAdjustment) => {
                    const typeConfig = getAdjustmentTypeConfig(adj.adjustment_type)
                    return (
                      <tr key={adj.id} className="border-t">
                        <td className="px-3 py-2">
                          <CodeDisplay code={adj.adjustment_code} />
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs ${typeConfig.color}`}>
                            {typeConfig.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{adj.quantity}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{adj.reason}</td>
                        <td className="px-3 py-2">{formatDateTime(adj.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No adjustments yet.</p>
          )}
        </CardContent>
      </Card>

      <AdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        receiptId={id!}
        items={items ?? []}
      />
    </div>
  )
}
