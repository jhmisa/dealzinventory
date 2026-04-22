import { z } from 'zod'

export const createSupplierReturnSchema = z.object({
  item_id: z.string().min(1, 'Item is required'),
  supplier_id: z.string().min(1, 'Supplier is required'),
  intake_receipt_id: z.string().optional().or(z.literal('')),
  receipt_file_url: z.string().optional().or(z.literal('')),
  reason: z.string().min(10, 'Please describe the problem in at least 10 characters'),
})

export type CreateSupplierReturnFormValues = z.infer<typeof createSupplierReturnSchema>

export const resolveSupplierReturnSchema = z.object({
  resolution: z.enum(['EXCHANGE', 'REFUND'], {
    required_error: 'Please select a resolution',
  }),
  refund_amount: z.coerce.number().int().min(0).optional(),
  refund_payment_method: z.enum(['BANK_TRANSFER', 'CASH']).optional(),
  staff_notes: z.string().optional().or(z.literal('')),
})

export type ResolveSupplierReturnFormValues = z.infer<typeof resolveSupplierReturnSchema>
