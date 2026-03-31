import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CodeDisplay } from '@/components/shared'
import { formatPrice } from '@/lib/utils'
import { printItemLabels } from '@/components/items/label-print'

interface IntakeSuccessCardProps {
  receiptId: string
  receiptCode: string
  totalItems: number
  totalCost: number
  pCodeRangeStart: string
  pCodeRangeEnd: string
  createdItems: Array<{ id: string; item_code: string; description?: string }>
  onReset: () => void
}

export function IntakeSuccessCard({
  receiptId,
  receiptCode,
  totalItems,
  totalCost,
  pCodeRangeStart,
  pCodeRangeEnd,
  createdItems,
  onReset,
}: IntakeSuccessCardProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <CardTitle>Intake Complete</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block">Receipt Code</span>
              <CodeDisplay code={receiptCode} />
            </div>
            <div>
              <span className="text-muted-foreground block">Items Created</span>
              <span className="font-semibold text-lg">{totalItems}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">P-Code Range</span>
              <span className="font-mono text-sm">{pCodeRangeStart} → {pCodeRangeEnd}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Total Cost</span>
              <span className="font-semibold">{formatPrice(totalCost)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={`/admin/receiving-reports/${receiptId}`}>View Receipt</Link>
            </Button>
            <Button variant="outline" onClick={() => printItemLabels(createdItems.map(i => ({ item_code: i.item_code, description: i.description })))}>
              Print QR Labels
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/inspection">Go to Inspection</Link>
            </Button>
            <Button onClick={onReset}>New Intake</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 print:grid-cols-4 print:gap-2">
        {createdItems.map((item) => (
          <Card
            key={item.id}
            className="print:border print:shadow-none"
          >
            <CardContent className="p-3 flex flex-col items-center gap-2">
              <QRCodeSVG value={item.item_code} size={80} />
              <CodeDisplay code={item.item_code} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
