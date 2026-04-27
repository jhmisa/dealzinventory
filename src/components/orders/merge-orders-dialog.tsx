import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CodeDisplay, PriceDisplay } from '@/components/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMergeableOrders, useMergeOrders } from '@/hooks/use-orders'
import { Loader2 } from 'lucide-react'

interface MergeOrdersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceOrderId: string
  sourceOrderCode: string
  onSuccess: (targetOrderId: string) => void
}

export function MergeOrdersDialog({
  open,
  onOpenChange,
  sourceOrderId,
  sourceOrderCode,
  onSuccess,
}: MergeOrdersDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { data: candidates, isLoading } = useMergeableOrders(sourceOrderId, open)
  const mergeMutation = useMergeOrders()

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setSelectedId(null)
    onOpenChange(nextOpen)
  }

  function handleConfirm() {
    if (!selectedId) return
    mergeMutation.mutate(
      { sourceOrderId, targetOrderId: selectedId },
      {
        onSuccess: () => {
          handleOpenChange(false)
          onSuccess(selectedId)
        },
      },
    )
  }

  const selected = candidates?.find(c => c.id === selectedId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge Order</DialogTitle>
          <DialogDescription>
            Move all items from {sourceOrderCode} into another order. {sourceOrderCode} will be cancelled.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !candidates || candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No matching orders to merge with. Orders must be from the same customer, same delivery date, and PENDING or CONFIRMED status.
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Select target order</label>
              <div className="space-y-1">
                {candidates.map((order) => {
                  const itemCount = order.order_items?.[0]?.count ?? 0
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      className={`w-full flex items-center justify-between rounded-md border p-3 text-left text-sm transition-colors ${
                        selectedId === order.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <CodeDisplay code={order.order_code} />
                        <span className="text-muted-foreground">
                          {itemCount} item{itemCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <PriceDisplay amount={order.total_price} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {selected && (
            <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              Move all items from <strong>{sourceOrderCode}</strong> → <strong>{selected.order_code}</strong>.{' '}
              {sourceOrderCode} will be cancelled.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={mergeMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedId || mergeMutation.isPending}
          >
            {mergeMutation.isPending ? 'Merging...' : 'Merge Orders'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
