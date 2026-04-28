import { z } from 'zod'

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters'),
  description: z.string().min(10, 'Please describe the issue in at least 10 characters'),
  ticket_type_id: z.string().min(1, 'Please select a ticket type'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  customer_id: z.string().min(1, 'Customer is required'),
  order_id: z.string().optional().or(z.literal('')),
  conversation_id: z.string().optional().or(z.literal('')),
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
