import { z } from 'zod'

export const createInventoryRemovalSchema = z.object({
  item_id: z.string().min(1, 'Item is required'),
  reason: z.enum(['MISSING', 'OFFICE_USE', 'DAMAGED', 'GIFTED', 'OTHER'], {
    required_error: 'Please select a reason',
  }),
  reason_text: z.string().optional().or(z.literal('')),
  notes: z.string().min(5, 'Please add notes (at least 5 characters)'),
}).refine(
  (data) => data.reason !== 'OTHER' || (data.reason_text && data.reason_text.length >= 5),
  { message: 'Please specify the reason (at least 5 characters)', path: ['reason_text'] },
)

export type CreateInventoryRemovalFormValues = z.infer<typeof createInventoryRemovalSchema>
