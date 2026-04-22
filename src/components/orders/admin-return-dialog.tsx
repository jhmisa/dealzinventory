import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RETURN_REASONS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'

export interface ReturnableItem {
  id: string
  item_id: string | null
  description: string | null
  unit_price: number
  quantity: number
  items: { id: string; item_code: string } | null
}

interface AdminReturnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCode: string
  orderItems: ReturnableItem[]
  onConfirm: (data: {
    reason_category: string
    description: string
    items: { order_item_id: string; item_id?: string | null }[]
  }) => void
  isPending: boolean
}

export function AdminReturnDialog({
  open,
  onOpenChange,
  orderCode,
  orderItems,
  onConfirm,
  isPending,
}: AdminReturnDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')

  const canSubmit = selectedIds.size > 0 && reason && description.trim().length >= 10

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    if (!canSubmit) return
    const items = orderItems
      .filter((oi) => selectedIds.has(oi.id))
      .map((oi) => ({
        order_item_id: oi.id,
        item_id: oi.item_id,
      }))
    onConfirm({ reason_category: reason, description: description.trim(), items })
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSelectedIds(new Set())
      setReason('')
      setDescription('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Return</DialogTitle>
          <DialogDescription>
            Create a return request for order {orderCode} on behalf of the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select items to return</label>
            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
              {orderItems.map((oi) => (
                <label
                  key={oi.id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded p-1"
                >
                  <Checkbox
                    checked={selectedIds.has(oi.id)}
                    onCheckedChange={() => toggleItem(oi.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {oi.items?.item_code && (
                        <span className="font-mono text-muted-foreground mr-2">
                          {oi.items.item_code}
                        </span>
                      )}
                      {oi.description}
                    </div>
                  </div>
                  <span className="text-sm font-medium shrink-0">
                    {formatPrice(oi.unit_price * oi.quantity)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {RETURN_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description <span className="text-red-500">*</span>
              <span className="text-xs text-muted-foreground ml-1">(min 10 characters)</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the reason for the return..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || isPending}>
            {isPending ? 'Creating...' : 'Create Return'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
