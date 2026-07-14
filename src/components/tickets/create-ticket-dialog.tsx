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
import { X } from 'lucide-react'
import { createTicketSchema, type CreateTicketFormValues } from '@/validators/ticket'
import { useTicketTypes, useCreateTicket } from '@/hooks/use-tickets'
import { useCustomerOrders } from '@/hooks/use-customers'
import { useAvailableInventorySearch } from '@/hooks/use-items'
import {
  composeFollowupSubject,
  composeProblemSubject,
  todayJst,
  addDaysJst,
} from '@/lib/ticket-followups'
import { TICKET_PRIORITIES, RETURN_REASONS } from '@/lib/constants'
import { formatPrice, formatDate, cn } from '@/lib/utils'
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
const ORDER_TYPES = new Set(['delivery', 'return', 'complaint', 'general', 'technical', 'stock-request'])
// Types where order is required
const ORDER_REQUIRED_TYPES = new Set(['delivery', 'return'])

const EMPTY_FORM: CreateTicketFormValues = {
  description: '',
  ticket_type_id: '',
  priority: 'NORMAL',
  customer_id: '',
  order_id: '',
  conversation_id: '',
  item_label: '',
  item_code: '',
  follow_up_at: '',
}

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

  // Item suggestion dropdown (follow-up types)
  const [itemQuery, setItemQuery] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)

  const defaultType = defaultTypeSlug
    ? ticketTypes.find((t) => t.slug === defaultTypeSlug)
    : undefined

  const form = useForm<CreateTicketFormValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { ...EMPTY_FORM },
  })

  // Re-seed the form from the CURRENT props every time the dialog opens.
  // This dialog stays mounted while staff switch conversations in the Messages
  // page, so mount-time defaultValues go stale — tickets were being created
  // with the wrong conversation_id/customer_id pairing (see
  // docs/investigations/incorrect-ticket-linking.md).
  useEffect(() => {
    if (open) {
      form.reset({
        ...EMPTY_FORM,
        ticket_type_id: defaultType?.id ?? '',
        customer_id: customerId ?? '',
        order_id: orderId ?? '',
        conversation_id: conversationId ?? '',
      })
      setSelectedItemIds(new Set())
      setReturnReason('')
      setItemQuery('')
      setSuggestionsOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Ticket types load async — fill in the default type once available
  if (defaultType && !form.getValues('ticket_type_id')) {
    form.setValue('ticket_type_id', defaultType.id)
  }

  // Derive current type
  const selectedTypeId = form.watch('ticket_type_id')
  const selectedType = ticketTypes.find((t) => t.id === selectedTypeId)
  const typeSlug = selectedType?.slug ?? ''
  const isFollowup = selectedType?.kind === 'followup'

  const showOrderSelector = !!customerId && ORDER_TYPES.has(typeSlug)
  const orderRequired = ORDER_REQUIRED_TYPES.has(typeSlug)
  const isReturn = typeSlug === 'return'
  const isDelivery = typeSlug === 'delivery'

  // Debounced inventory suggestions for the Item field
  const itemLabel = form.watch('item_label') ?? ''
  useEffect(() => {
    const handle = setTimeout(() => setItemQuery(itemLabel), 300)
    return () => clearTimeout(handle)
  }, [itemLabel])
  const { data: itemSuggestions = [] } = useAvailableInventorySearch(
    open && isFollowup && suggestionsOpen ? itemQuery : '',
  )

  const itemCode = form.watch('item_code') ?? ''
  const followUpAt = form.watch('follow_up_at') ?? ''

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

  const followUpChips: { label: string; value: string }[] = [
    { label: 'Today', value: todayJst() },
    { label: 'Tomorrow', value: addDaysJst(1) },
    { label: 'Next week', value: addDaysJst(7) },
  ]

  function onSubmit(data: CreateTicketFormValues) {
    let subject: string
    let description: string

    if (isFollowup) {
      const item = (data.item_label ?? '').trim()
      if (item.length < 2) {
        form.setError('item_label', { message: 'Enter what this follow-up is about' })
        return
      }
      const note = (data.description ?? '').trim()
      subject = composeFollowupSubject(item, note || undefined)
      description = note || subject
    } else {
      const desc = (data.description ?? '').trim()
      if (!isReturn && desc.length < 10) {
        form.setError('description', { message: 'Please describe the issue in at least 10 characters' })
        return
      }
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
        if (desc.length < 10) {
          form.setError('description', { message: 'Please describe the reason in at least 10 characters' })
          return
        }
      }
      subject = isReturn
        ? `Return: ${RETURN_REASONS.find(r => r.value === returnReason)?.label ?? returnReason}`
        : composeProblemSubject(desc)
      description = desc
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

    createTicket.mutate(
      {
        ticket_type_id: data.ticket_type_id,
        customer_id: data.customer_id,
        subject,
        description,
        priority: data.priority,
        order_id: data.order_id || undefined,
        conversation_id: data.conversation_id || undefined,
        created_by_role: 'staff',
        ...(isFollowup
          ? {
              item_label: (data.item_label ?? '').trim(),
              item_code: data.item_code || undefined,
              follow_up_at: data.follow_up_at || undefined,
            }
          : {}),
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
    form.reset({ ...EMPTY_FORM })
    setSelectedItemIds(new Set())
    setReturnReason('')
    onOpenChange(false)
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      form.reset({ ...EMPTY_FORM })
      setSelectedItemIds(new Set())
      setReturnReason('')
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isReturn ? 'Create Return Ticket' : isFollowup ? 'Create Follow-up' : 'Create Ticket'}
          </DialogTitle>
          <DialogDescription>
            {isReturn
              ? 'Select items to return and provide a reason.'
              : isFollowup
                ? 'What to follow up, and when. The subject is written for you.'
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

          {/* Follow-up types: Item + date */}
          {isFollowup && (
            <>
              <div className="space-y-2 relative">
                <label className="text-sm font-medium">
                  Item / what to follow up <span className="text-red-500">*</span>
                </label>
                <Input
                  value={itemLabel}
                  placeholder="e.g. Poco X7 — type to search inventory, or free text"
                  autoComplete="off"
                  onChange={(e) => {
                    form.setValue('item_label', e.target.value)
                    form.setValue('item_code', '')
                    form.clearErrors('item_label')
                    setSuggestionsOpen(true)
                  }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                />
                {suggestionsOpen && itemSuggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
                    {itemSuggestions.slice(0, 8).map((r) => (
                      <button
                        key={`${r.type}-${r.id}`}
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          form.setValue('item_label', r.description)
                          form.setValue('item_code', r.code)
                          form.clearErrors('item_label')
                          setSuggestionsOpen(false)
                        }}
                      >
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{r.code}</span>
                        <span className="truncate flex-1">{r.description}</span>
                        {r.price != null && (
                          <span className="text-xs font-medium shrink-0">{formatPrice(r.price)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {itemCode && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
                      {itemCode} linked
                      <button
                        type="button"
                        className="hover:text-destructive"
                        onClick={() => form.setValue('item_code', '')}
                        aria-label="Unlink item"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                )}
                {form.formState.errors.item_label && (
                  <p className="text-sm text-destructive">{form.formState.errors.item_label.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Follow up on</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {followUpChips.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={() => form.setValue('follow_up_at', followUpAt === chip.value ? '' : chip.value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        followUpAt === chip.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted',
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                  <input
                    type="date"
                    value={followUpAt}
                    min={todayJst()}
                    onChange={(e) => form.setValue('follow_up_at', e.target.value)}
                    className="h-7 rounded-md border bg-background px-2 text-xs"
                    aria-label="Custom follow-up date"
                  />
                  {followUpAt && (
                    <button
                      type="button"
                      onClick={() => form.setValue('follow_up_at', '')}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {followUpAt
                    ? `Will appear in the queue on ${followUpAt}.`
                    : 'No date — the ticket sits in the "No date" list until one is set.'}
                </p>
              </div>
            </>
          )}

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

          {/* Note / Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {isFollowup ? (
                <>Note <span className="text-xs text-muted-foreground">(optional)</span></>
              ) : (
                <>Description <span className="text-red-500">*</span></>
              )}
            </label>
            <Textarea
              {...form.register('description')}
              placeholder={
                isFollowup
                  ? 'e.g. customer will order end of month'
                  : isReturn
                    ? 'Describe the reason for the return...'
                    : 'Describe the issue in detail... (first line becomes the subject)'
              }
              rows={isFollowup ? 2 : isReturn ? 3 : 4}
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
              {createTicket.isPending ? 'Creating...' : isReturn ? 'Create Return Ticket' : isFollowup ? 'Create Follow-up' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
