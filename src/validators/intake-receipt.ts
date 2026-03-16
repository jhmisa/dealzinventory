import { z } from 'zod'

export const intakeLineItemSchema = z.object({
  product_description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().int().min(1, 'At least 1'),
  unit_price: z.coerce.number().nonnegative(),
  product_id: z.string().optional().or(z.literal('')),
  ai_confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().optional().or(z.literal('')),
})

export type IntakeLineItemFormValues = z.infer<typeof intakeLineItemSchema>

export const intakeBatchSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  source_type: z.enum(['AUCTION', 'WHOLESALE', 'KAITORI']),
  date_received: z.string().min(1, 'Date is required'),
  invoice_file_url: z.string().optional().or(z.literal('')),
  supplier_contact_snapshot: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  line_items: z.array(intakeLineItemSchema).min(1, 'At least one line item is required'),
})

export type IntakeBatchFormValues = z.infer<typeof intakeBatchSchema>

export const intakeAdjustmentSchema = z.object({
  receipt_id: z.string().min(1),
  adjustment_type: z.enum(['VOIDED', 'RETURNED', 'REFUNDED', 'MISSING']),
  item_ids: z.array(z.string()).min(1, 'Select at least one item'),
  reason: z.string().min(1, 'Reason is required'),
})

export type IntakeAdjustmentFormValues = z.infer<typeof intakeAdjustmentSchema>
