import { formatPrice } from '@/lib/utils'

interface LineItem {
  quantity: number
  unit_price: number
}

interface IntakeSummaryFooterProps {
  lineItems: LineItem[]
}

export function IntakeSummaryFooter({ lineItems }: IntakeSummaryFooterProps) {
  const totalLines = lineItems.length
  const totalQuantity = lineItems.reduce((sum, item) => sum + (item.quantity || 0), 0)
  const totalCost = lineItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0), 0)

  return (
    <div className="flex items-center justify-between border-t pt-4 px-1 text-sm">
      <div className="flex gap-6">
        <div>
          <span className="text-muted-foreground">Line Items: </span>
          <span className="font-medium">{totalLines}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Total Quantity: </span>
          <span className="font-medium">{totalQuantity}</span>
        </div>
      </div>
      <div>
        <span className="text-muted-foreground">Total Cost: </span>
        <span className="font-semibold">{formatPrice(totalCost)}</span>
      </div>
    </div>
  )
}
