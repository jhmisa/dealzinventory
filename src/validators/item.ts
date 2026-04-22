import { z } from 'zod'

export const intakeItemSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  source_type: z.enum(['AUCTION', 'WHOLESALE', 'KAITORI']),
  purchase_price: z.coerce.number().nonnegative().optional(),
  product_id: z.string().optional().or(z.literal('')),
})

export type IntakeItemFormValues = z.infer<typeof intakeItemSchema>

export const bulkIntakeSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  source_type: z.enum(['AUCTION', 'WHOLESALE', 'KAITORI']),
  quantity: z.coerce.number().int().min(1, 'At least 1 item').max(100, 'Max 100 at a time'),
  purchase_price: z.coerce.number().nonnegative().optional(),
  product_id: z.string().optional().or(z.literal('')),
})

export type BulkIntakeFormValues = z.infer<typeof bulkIntakeSchema>

export const itemEditSchema = z.object({
  condition_grade: z.enum(['S', 'A', 'B', 'C', 'D', 'J']).optional(),
  item_status: z.enum(['INTAKE', 'AVAILABLE', 'REPAIR']),
  product_id: z.string().optional().or(z.literal('')),
  ac_adapter_status: z.enum(['CORRECT', 'INCORRECT', 'MISSING']).optional(),
  specs_notes: z.string().optional().or(z.literal('')),
  condition_notes: z.string().optional().or(z.literal('')),
})

export type ItemEditFormValues = z.infer<typeof itemEditSchema>

export const itemFinancialsSchema = z.object({
  selling_price: z.coerce.number().nonnegative('Must be 0 or more'),
})

export type ItemFinancialsFormValues = z.infer<typeof itemFinancialsSchema>

export const itemCostSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be positive'),
})

export type ItemCostFormValues = z.infer<typeof itemCostSchema>

export const itemSpecsSchema = z.object({
  brand: z.string().optional().or(z.literal('')),
  model_name: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  model_number: z.string().optional().or(z.literal('')),
  part_number: z.string().optional().or(z.literal('')),
  screen_size: z.coerce.number().positive().nullable().optional(),
  cpu: z.string().optional().or(z.literal('')),
  ram_gb: z.string().nullable().optional(),
  storage_gb: z.string().nullable().optional(),
  os_family: z.string().optional().or(z.literal('')),
  gpu: z.string().optional().or(z.literal('')),
  carrier: z.string().optional().or(z.literal('')),
  keyboard_layout: z.string().optional().or(z.literal('')),
  has_touchscreen: z.boolean().nullable().optional(),
  is_unlocked: z.boolean().nullable().optional(),
  imei: z.string().optional().or(z.literal('')),
  imei2: z.string().optional().or(z.literal('')),
  battery_health_pct: z.coerce.number().int().min(-1).max(100).nullable().optional(),
  year: z.coerce.number().int().positive().nullable().optional(),
  other_features: z.string().optional().or(z.literal('')),
})

export type ItemSpecsFormValues = z.infer<typeof itemSpecsSchema>
