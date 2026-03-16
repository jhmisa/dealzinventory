import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IntakeSummaryFooter } from './intake-summary-footer'
import { ConfidenceBadge } from './confidence-badge'
import { formatPrice, formatDate } from '@/lib/utils'
import type { Supplier } from '@/lib/types'
import type { LineItemRow } from './intake-line-item-table'

interface IntakeReviewCardProps {
  supplierName: string
  sourceType: string
  dateReceived: string
  notes: string
  lineItems: LineItemRow[]
}

export function IntakeReviewCard({
  supplierName,
  sourceType,
  dateReceived,
  notes,
  lineItems,
}: IntakeReviewCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Intake Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground block">Supplier</span>
            <span className="font-medium">{supplierName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Source</span>
            <span className="font-medium">{sourceType}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Date Received</span>
            <span className="font-medium">{formatDate(dateReceived)}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Total Items</span>
            <span className="font-medium">
              {lineItems.reduce((sum, item) => sum + item.quantity, 0)}
            </span>
          </div>
        </div>

        {notes && (
          <div className="text-sm">
            <span className="text-muted-foreground block">Notes</span>
            <span>{notes}</span>
          </div>
        )}

        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-center font-medium">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, idx) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">{item.product_description}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{formatPrice(item.unit_price)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatPrice(item.quantity * item.unit_price)}</td>
                  <td className="px-3 py-2 text-center"><ConfidenceBadge confidence={item.ai_confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <IntakeSummaryFooter lineItems={lineItems} />
      </CardContent>
    </Card>
  )
}
