import { z } from 'zod'

export const kaitoriRequestSchema = z.object({
  product_model_id: z.string().min(1, 'Product model is required'),
  battery_condition: z.enum(['GOOD', 'FAIR', 'POOR'], { required_error: 'Battery condition is required' }),
  screen_condition: z.enum(['GOOD', 'FAIR', 'POOR', 'CRACKED'], { required_error: 'Screen condition is required' }),
  body_condition: z.enum(['GOOD', 'FAIR', 'POOR', 'DAMAGED'], { required_error: 'Body condition is required' }),
  delivery_method: z.enum(['SHIP', 'WALK_IN'], { required_error: 'Delivery method is required' }),
  seller_notes: z.string().optional().or(z.literal('')),
})

export type KaitoriRequestFormValues = z.infer<typeof kaitoriRequestSchema>

export const priceRevisionSchema = z.object({
  final_price: z.coerce.number().min(0, 'Price must be non-negative'),
  revision_reason: z.string().min(1, 'Reason is required'),
})

export type PriceRevisionFormValues = z.infer<typeof priceRevisionSchema>

export const paymentSchema = z.object({
  payment_method: z.enum(['CASH', 'BANK_TRANSFER'], { required_error: 'Payment method is required' }),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>

export const priceListEntrySchema = z.object({
  product_model_id: z.string().min(1, 'Product model is required'),
  battery_condition: z.enum(['GOOD', 'FAIR', 'POOR']),
  screen_condition: z.enum(['GOOD', 'FAIR', 'POOR', 'CRACKED']),
  body_condition: z.enum(['GOOD', 'FAIR', 'POOR', 'DAMAGED']),
  purchase_price: z.coerce.number().min(0, 'Price must be non-negative'),
  active: z.boolean().default(true),
})

export type PriceListEntryFormValues = z.infer<typeof priceListEntrySchema>
