import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
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
import { RETURN_REASONS, TICKET_PRIORITIES } from '@/lib/constants'
import { useTicketTypes, useCreateTicket } from '@/hooks/use-tickets'
import { formatPrice } from '@/lib/utils'
import { toast } from 'sonner'
import type { TicketPriority } from '@/lib/types'
import type { ReturnData } from '@/services/tickets'

export interface ReturnableItem {
  id: string
  item_id: string | null
  description: string | null
  unit_price: number
  quantity: number
  items: { id: string; item_code: string } | null
}

interface CreateReturnTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orderCode: string
  orderId: string
  customerId: string
  orderItems: ReturnableItem[]
  onSuccess?: (ticket: { id: string; ticket_code: string }) => void
}

export function CreateReturnTicketDialog({
  open,
  onOpenChange,
  orderCode,
  orderId,
  customerId,
  orderItems,
  onSuccess,
}: CreateReturnTicketDialogProps) {
  const { data: ticketTypes = [] } = useTicketTypes()
  const createTicket = useCreateTicket()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('NORMAL')

  const returnType = ticketTypes.find((t) => t.name === 'RETURN')
  const canSubmit = selectedIds.size > 0 && reason && description.trim().length >= 10 && returnType

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleConfirm() {
    if (!canSubmit || !returnType) return

    const items = orderItems
      .filter((oi) => selectedIds.has(oi.id))
      .map((oi) => ({
        order_item_id: oi.id,
        item_id: oi.item_id,
      }))

    const returnData: ReturnData = {
      reason_category: reason,
      resolution_type: null,
      refund_amount: null,
      items,
    }

    createTicket.mutate(
      {
        ticket_type_id: returnType.id,
        customer_id: customerId,
        order_id: orderId,
        subject: subject.trim() || `Return: ${RETURN_REASONS.find(r => r.value === reason)?.label ?? reason}`,
        description: description.trim(),
        priority,
        created_by_role: 'staff',
        return_data: returnData,
      },
      {
        onSuccess: (ticket) => {
          toast.success(`Ticket ${ticket.ticket_code} created`)
          handleOpenChange(false)
          onSuccess?.({ id: ticket.id, ticket_code: ticket.ticket_code })
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setSelectedIds(new Set())
      setReason('')
      setDescription('')
      setSubject('')
      setPriority('NORMAL')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Return Ticket</DialogTitle>
          <DialogDescription>
            Create a return ticket for order {orderCode}.
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

          <div className="grid grid-cols-2 gap-3">
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
              <label className="text-sm font-medium">Priority</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Subject <span className="text-xs text-muted-foreground">(optional, auto-generated if empty)</span></label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary..."
            />
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
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={createTicket.isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canSubmit || createTicket.isPending}>
            {createTicket.isPending ? 'Creating...' : 'Create Return Ticket'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
