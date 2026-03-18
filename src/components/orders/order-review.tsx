import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AddressDisplay } from '@/components/shared/address-display'
import { ORDER_SOURCES, YAMATO_TIME_SLOTS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import type { ManualOrderItemValues } from '@/validators/manual-order'

interface OrderReviewProps {
  customer: Customer | null
  orderSource: string
  onOrderSourceChange: (source: string) => void
  shippingAddress: ShippingAddress | null
  careOf: string | null
  deliveryDate: string | null
  deliveryTimeCode: string | null
  items: ManualOrderItemValues[]
  notes: string
  onNotesChange: (notes: string) => void
  onSubmit: () => void
  isSubmitting: boolean
}

export function OrderReview({
  customer,
  orderSource,
  onOrderSourceChange,
  shippingAddress,
  careOf,
  deliveryDate,
  deliveryTimeCode,
  items,
  notes,
  onNotesChange,
  onSubmit,
  isSubmitting,
}: OrderReviewProps) {
  const totalPrice = items.reduce((sum, i) => sum + i.unit_price, 0)
  const timeSlot = YAMATO_TIME_SLOTS.find((s) => s.code === deliveryTimeCode)

  const canSubmit = customer && shippingAddress && items.length > 0 && orderSource

  return (
    <div className="space-y-4">
      {/* Order Source */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Order Source *</Label>
            <Select value={orderSource} onValueChange={onOrderSourceChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                {ORDER_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Staff Notes</Label>
            <Textarea
              placeholder="Optional notes about this order..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Customer */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Customer</p>
            {customer ? (
              <p className="text-sm font-medium">
                {customer.customer_code} — {customer.last_name} {customer.first_name ?? ''}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not selected</p>
            )}
          </div>

          {/* Shipping */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Shipping Address</p>
            {shippingAddress ? (
              <AddressDisplay address={shippingAddress} careOf={careOf ?? undefined} className="mt-0.5" />
            ) : (
              <p className="text-sm text-muted-foreground">Not selected</p>
            )}
          </div>

          {/* Delivery */}
          {(deliveryDate || deliveryTimeCode) && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Delivery</p>
              <p className="text-sm">
                {deliveryDate ?? 'No date'} {timeSlot ? `· ${timeSlot.label}` : ''}
              </p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Items ({items.length})
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items selected</p>
            ) : (
              <div className="space-y-1">
                {items.map((item) => (
                  <div key={item.item_id} className="flex justify-between text-sm">
                    <span>
                      {item.item_code} — {item.product_name}
                      {item.condition_grade ? ` (${item.condition_grade})` : ''}
                    </span>
                    <span className="font-medium">{formatPrice(item.unit_price)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t font-medium">
                  <span>Total</span>
                  <span>{formatPrice(totalPrice)}</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="sticky bottom-0 bg-background border-t p-4 -mx-6 -mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">{formatPrice(totalPrice)}</p>
          <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''}</p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={!canSubmit || isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Create Order
        </Button>
      </div>
    </div>
  )
}
