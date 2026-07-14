import { z } from 'zod'

// Subject is no longer typed by staff — it is auto-composed from the item/note
// (follow-up types) or the description's first line (problem types).
// See src/lib/ticket-followups.ts. Kind-specific requirements (item for
// follow-ups, description for problems) are enforced in the dialog's onSubmit.
export const createTicketSchema = z.object({
  description: z.string().optional().or(z.literal('')),
  ticket_type_id: z.string().min(1, 'Please select a ticket type'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  customer_id: z.string().optional().or(z.literal('')),
  order_id: z.string().optional().or(z.literal('')),
  conversation_id: z.string().optional().or(z.literal('')),
  item_label: z.string().optional().or(z.literal('')),
  item_code: z.string().optional().or(z.literal('')),
  follow_up_at: z.string().optional().or(z.literal('')),
})

export type CreateTicketFormValues = z.infer<typeof createTicketSchema>

export const createReturnTicketSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters'),
  description: z.string().min(10, 'Please describe the issue in at least 10 characters'),
  ticket_type_id: z.string().min(1, 'Please select a ticket type'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  customer_id: z.string().min(1, 'Customer is required'),
  order_id: z.string().min(1, 'Order is required for returns'),
  reason_category: z.enum(['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'NOT_AS_DESCRIBED', 'OTHER'], {
    required_error: 'Please select a reason',
  }),
  items: z.array(z.object({
    order_item_id: z.string(),
    item_id: z.string().optional().or(z.literal('')),
    reason_note: z.string().optional().or(z.literal('')),
  })).min(1, 'Select at least one item'),
})

export type CreateReturnTicketFormValues = z.infer<typeof createReturnTicketSchema>

export const resolveTicketSchema = z.object({
  resolution_notes: z.string().min(1, 'Please add resolution notes'),
})

export type ResolveTicketFormValues = z.infer<typeof resolveTicketSchema>

export const ticketNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
})

export type TicketNoteFormValues = z.infer<typeof ticketNoteSchema>
