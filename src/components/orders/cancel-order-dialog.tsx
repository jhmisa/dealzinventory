import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CANCELLATION_CATEGORIES } from '@/lib/constants'

interface CancelOrderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCode: string
  onConfirm: (category: string, notes: string) => void
  isPending: boolean
}

export function CancelOrderDialog({
  open,
  onOpenChange,
  orderCode,
  onConfirm,
  isPending,
}: CancelOrderDialogProps) {
  const [category, setCategory] = useState('')
  const [notes, setNotes] = useState('')

  const isOther = category === 'OTHER'
  const canSubmit = category && (!isOther || notes.trim().length > 0)

  function handleConfirm() {
    if (!canSubmit) return
    onConfirm(category, notes.trim())
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setCategory('')
      setNotes('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Order</DialogTitle>
          <DialogDescription>
            Cancel order {orderCode}? Reserved items will be returned to available stock.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Notes {isOther && <span className="text-red-500">*</span>}
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isOther ? 'Please describe the reason...' : 'Optional notes...'}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canSubmit || isPending}
          >
            {isPending ? 'Cancelling...' : 'Cancel Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
