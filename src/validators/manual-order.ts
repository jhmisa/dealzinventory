import { z } from 'zod'

export const orderLineItemSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid().nullable(),
  item_code: z.string().nullable(),
  description: z.string().min(1, 'Description is required'),
  condition_grade: z.string().nullable(),
  quantity: z.coerce.number().int().positive('Quantity must be > 0'),
  unit_price: z.coerce.number().nonnegative('Price must be ≥ 0'),
  discount: z.coerce.number().int().nonnegative('Discount must be ≥ 0').default(0),
})

export const manualOrderSchema = z.object({
  customer_id: z.string().uuid('Customer is required'),
  order_source: z.enum(['SHOP', 'LIVE_SELLING', 'WALK_IN', 'FB', 'YOUTUBE']),
  shipping_address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'Shipping address is required',
  }),
  delivery_date: z.string().nullable().optional(),
  delivery_time_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  shipping_cost: z.coerce.number().int().nonnegative('Delivery fee must be ≥ 0').default(0),
  items: z.array(orderLineItemSchema).min(1, 'At least 1 item is required'),
})

export type ManualOrderFormValues = z.infer<typeof manualOrderSchema>
export type OrderLineItemValues = z.infer<typeof orderLineItemSchema>

// Keep backward-compatible alias
export type ManualOrderItemValues = OrderLineItemValues
