import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createTicketSchema, type CreateTicketFormValues } from '@/validators/ticket'
import { useTicketTypes, useCreateTicket } from '@/hooks/use-tickets'
import { useCustomerOrders } from '@/hooks/use-customers'
import { TICKET_PRIORITIES, RETURN_REASONS } from '@/lib/constants'
import { formatPrice, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { ReturnData } from '@/services/tickets'

interface CreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId?: string
  orderId?: string
  conversationId?: string
  defaultTypeSlug?: string
  onSuccess?: (ticket: { id: string; ticket_code: string }) => void
}

// Types that show the order selector when a customer is present
const ORDER_TYPES = new Set(['delivery', 'return', 'complaint', 'general'])
// Types where order is required
const ORDER_REQUIRED_TYPES = new Set(['delivery', 'return'])

export function CreateTicketDialog({
  open,
  onOpenChange,
  customerId,
  orderId,
  conversationId,
  defaultTypeSlug,
  onSuccess,
}: CreateTicketDialogProps) {
  const { data: ticketTypes = [] } = useTicketTypes()
  const createTicket = useCreateTicket()
  const { data: customerOrders = [] } = useCustomerOrders(customerId ?? '')

  // Return-specific state
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [returnReason, setReturnReason] = useState('')

  const defaultType = defaultTypeSlug
    ? ticketTypes.find((t) => t.slug === defaultTypeSlug)
    : undefined

  const form = useForm<CreateTicketFormValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      subject: '',
      description: '',
      ticket_type_id: defaultType?.id ?? '',
      priority: 'NORMAL',
      customer_id: customerId ?? '',
      order_id: orderId ?? '',
      conversation_id: conversationId ?? '',
    },
  })

  // Update form values when props change
  if (customerId && form.getValues('customer_id') !== customerId) {
    form.setValue('customer_id', customerId)
  }
  if (defaultType && !form.getValues('ticket_type_id')) {
    form.setValue('ticket_type_id', defaultType.id)
  }

  // Derive current type slug
  const selectedTypeId = form.watch('ticket_type_id')
  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId)
  const typeSlug = selectedType?.slug ?? ''

  const showOrderSelector = !!customerId && ORDER_TYPES.has(typeSlug)
  const orderRequired = ORDER_REQUIRED_TYPES.has(typeSlug)
  const isReturn = typeSlug === 'return'
  const isDelivery = typeSlug === 'delivery'

  // Get the selected order's items for return checkbox display
  const selectedOrderId = form.watch('order_id')
  const selectedOrder = customerOrders.find((o: { id: string }) => o.id === selectedOrderId)
  const orderItems = (selectedOrder as { order_items?: Array<{
    id: string
    item_id: string | null
    description: string | null
    unit_price: number
    quantity: number
    items: { id: string; item_code: string } | null
  }> })?.order_items ?? []

  // Auto-select most recent order for delivery type
  useEffect(() => {
    if (isDelivery && customerOrders.length > 0 && !orderId) {
      const mostRecent = customerOrders[0] as { id: string }
      form.setValue('order_id', mostRecent.id)
    }
  }, [isDelivery, customerOrders, orderId, form])

  // Pre-select order when orderId prop is passed
  useEffect(() => {
    if (orderId) {
      form.setValue('order_id', orderId)
    }
  }, [orderId, form])

  // Reset return-specific state when type changes
  useEffect(() => {
    setSelectedItemIds(new Set())
    setReturnReason('')
    // Clear order selection when switching types (unless prop-provided)
    if (!orderId && !isDelivery) {
      form.setValue('order_id', '')
    }
  }, [typeSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onSubmit(data: CreateTicketFormValues) {
    // Subject required for non-return types
    if (!isReturn && data.subject.trim().length < 3) {
      form.setError('subject', { message: 'Subject must be at least 3 characters' })
      return
    }
    // Extra validation for types with requirements
    if (isDelivery && !data.order_id) {
      toast.error('Please select an order for delivery issues')
      return
    }
    if (isReturn) {
      if (!data.order_id) {
        toast.error('Please select an order for returns')
        return
      }
      if (selectedItemIds.size === 0) {
        toast.error('Please select at least one item to return')
        return
      }
      if (!returnReason) {
        toast.error('Please select a return reason')
        return
      }
    }

    // Build return_data if return type
    let returnData: ReturnData | undefined
    if (isReturn) {
      const items = orderItems
        .filter((oi) => selectedItemIds.has(oi.id))
        .map((oi) => ({
          order_item_id: oi.id,
          item_id: oi.item_id,
        }))

      returnData = {
        reason_category: returnReason,
        resolution_type: null,
        refund_amount: null,
        items,
      }
    }

    // Auto-generate subject for returns if empty
    const subject = data.subject.trim() || (isReturn
      ? `Return: ${RETURN_REASONS.find(r => r.value === returnReason)?.label ?? returnReason}`
      : data.subject)

    createTicket.mutate(
      {
        ticket_type_id: data.ticket_type_id,
        customer_id: data.customer_id,
        subject,
        description: data.description,
        priority: data.priority,
        order_id: data.order_id || undefined,
        conversation_id: data.conversation_id || undefined,
        created_by_role: 'staff',
        ...(returnData ? { return_data: returnData } : {}),
      },
      {
        onSuccess: (ticket) => {
          toast.success(`Ticket ${ticket.ticket_code} created`)
          resetAndClose()
          onSuccess?.({ id: ticket.id, ticket_code: ticket.ticket_code })
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function resetAndClose() {
    form.reset()
    setSelectedItemIds(new Set())
    setReturnReason('')
    onOpenChange(false)
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      form.reset()
      setSelectedItemIds(new Set())
      setReturnReason('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isReturn ? 'Create Return Ticket' : 'Create Ticket'}</DialogTitle>
          <DialogDescription>
            {isReturn
              ? 'Select items to return and provide a reason.'
              : customerId
                ? 'Create a new support ticket for this customer.'
                : 'Create a new support ticket. It will auto-link when a customer is linked to this conversation.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Type</label>
            <Select
              value={form.watch('ticket_type_id')}
              onValueChange={(v) => form.setValue('ticket_type_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {ticketTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.ticket_type_id && (
              <p className="text-sm text-destructive">{form.formState.errors.ticket_type_id.message}</p>
            )}
          </div>

          {/* Order selector */}
          {showOrderSelector && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Order {orderRequired && <span className="text-red-500">*</span>}
              </label>
              <Select
                value={form.watch('order_id') || ''}
                onValueChange={(v) => form.setValue('order_id', v === '_none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an order..." />
                </SelectTrigger>
                <SelectContent>
                  {!orderRequired && (
                    <SelectItem value="_none">No order</SelectItem>
                  )}
                  {customerOrders.map((o: { id: string; order_code: string; order_status: string; created_at: string }) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code} · {o.order_status} · {formatDate(o.created_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerOrders.length === 0 && (
                <p className="text-xs text-muted-foreground">No orders found for this customer.</p>
              )}
            </div>
          )}

          {/* Item checkboxes for returns */}
          {isReturn && selectedOrderId && orderItems.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Select items to return <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                {orderItems.map((oi) => (
                  <label
                    key={oi.id}
                    className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded p-1"
                  >
                    <Checkbox
                      checked={selectedItemIds.has(oi.id)}
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
          )}

          {/* Return reason + Priority row */}
          {isReturn ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Reason <span className="text-red-500">*</span>
                </label>
                <Select value={returnReason} onValueChange={setReturnReason}>
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
                <Select
                  value={form.watch('priority')}
                  onValueChange={(v) => form.setValue('priority', v as CreateTicketFormValues['priority'])}
                >
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
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={form.watch('priority')}
                onValueChange={(v) => form.setValue('priority', v as CreateTicketFormValues['priority'])}
              >
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
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Subject {isReturn && <span className="text-xs text-muted-foreground">(optional, auto-generated if empty)</span>}
            </label>
            <Input {...form.register('subject')} placeholder="Brief summary of the issue" />
            {form.formState.errors.subject && (
              <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Description <span className="text-red-500">*</span>
            </label>
            <Textarea
              {...form.register('description')}
              placeholder={isReturn ? 'Describe the reason for the return...' : 'Describe the issue in detail...'}
              rows={isReturn ? 3 : 4}
            />
            {form.formState.errors.description && (
              <p className="text-sm text-destructive">{form.formState.errors.description.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={createTicket.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={createTicket.isPending}>
              {createTicket.isPending ? 'Creating...' : isReturn ? 'Create Return Ticket' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
