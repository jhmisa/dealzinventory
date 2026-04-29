import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createTicketSchema, type CreateTicketFormValues } from '@/validators/ticket'
import { useTicketTypes, useCreateTicket } from '@/hooks/use-tickets'
import { TICKET_PRIORITIES } from '@/lib/constants'
import { toast } from 'sonner'

interface CreateTicketDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId?: string
  orderId?: string
  conversationId?: string
  defaultTypeSlug?: string
  onSuccess?: (ticket: { id: string; ticket_code: string }) => void
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

  function onSubmit(data: CreateTicketFormValues) {
    createTicket.mutate(
      {
        ticket_type_id: data.ticket_type_id,
        customer_id: data.customer_id,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
        order_id: data.order_id || undefined,
        conversation_id: data.conversation_id || undefined,
        created_by_role: 'staff',
      },
      {
        onSuccess: (ticket) => {
          toast.success(`Ticket ${ticket.ticket_code} created`)
          form.reset()
          onOpenChange(false)
          onSuccess?.({ id: ticket.id, ticket_code: ticket.ticket_code })
        },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleOpenChange(open: boolean) {
    if (!open) form.reset()
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Ticket</DialogTitle>
          <DialogDescription>
            {customerId
              ? 'Create a new support ticket for this customer.'
              : 'Create a new support ticket. It will auto-link when a customer is linked to this conversation.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
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
                {ticketTypes
                  .filter((t) => t.name !== 'RETURN')
                  .map((t) => (
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

          <div className="space-y-2">
            <label className="text-sm font-medium">Subject</label>
            <Input {...form.register('subject')} placeholder="Brief summary of the issue" />
            {form.formState.errors.subject && (
              <p className="text-sm text-destructive">{form.formState.errors.subject.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              {...form.register('description')}
              placeholder="Describe the issue in detail..."
              rows={4}
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
              {createTicket.isPending ? 'Creating...' : 'Create Ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
