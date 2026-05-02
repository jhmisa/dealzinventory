import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { OrderDetailContent } from '@/components/orders/order-detail-content'

interface OrderDetailDialogProps {
  orderId: string | null
  onClose: () => void
}

export function OrderDetailDialog({ orderId, onClose }: OrderDetailDialogProps) {
  return (
    <Dialog open={!!orderId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-[95vw] sm:max-w-[95vw] h-[90vh] overflow-y-auto p-6">
        {orderId && (
          <OrderDetailContent
            orderId={orderId}
            isModal
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
