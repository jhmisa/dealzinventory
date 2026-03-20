import { z } from 'zod'

export const createReturnSchema = z.object({
  reason_category: z.enum(['DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_TRANSIT', 'NOT_AS_DESCRIBED', 'OTHER'], {
    required_error: 'Please select a reason',
  }),
  description: z.string().min(10, 'Please describe the issue in at least 10 characters'),
  items: z.array(z.object({
    order_item_id: z.string(),
    reason_note: z.string().optional().or(z.literal('')),
  })).min(1, 'Select at least one item'),
})

export type CreateReturnFormValues = z.infer<typeof createReturnSchema>

export const resolveReturnSchema = z.object({
  resolution: z.enum(['REFUND', 'REPLACE', 'REPAIR', 'REJECTED'], {
    required_error: 'Please select a resolution',
  }),
  refund_amount: z.coerce.number().int().min(0).optional(),
  resolution_notes: z.string().optional().or(z.literal('')),
})

export type ResolveReturnFormValues = z.infer<typeof resolveReturnSchema>
