import { z } from 'zod'

export const manualOrderItemSchema = z.object({
  item_id: z.string().uuid(),
  item_code: z.string(),
  product_name: z.string(),
  condition_grade: z.string().nullable(),
  unit_price: z.coerce.number().nonnegative('Price must be ≥ 0'),
})

export const manualOrderSchema = z.object({
  customer_id: z.string().uuid('Customer is required'),
  order_source: z.enum(['SHOP', 'LIVE_SELLING', 'WALK_IN', 'FB', 'YOUTUBE']),
  shipping_address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'Shipping address is required',
  }),
  care_of: z.string().nullable().optional(),
  delivery_date: z.string().nullable().optional(),
  delivery_time_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(manualOrderItemSchema).min(1, 'At least 1 item is required'),
})

export type ManualOrderFormValues = z.infer<typeof manualOrderSchema>
export type ManualOrderItemValues = z.infer<typeof manualOrderItemSchema>
