import { z } from 'zod'

export const orderSchema = z.object({
  customer_id: z.string().min(1, 'Customer is required'),
  sell_group_id: z.string().min(1, 'Sell group is required'),
  order_source: z.enum(['SHOP', 'LIVE_SELLING', 'WALK_IN', 'FB', 'YOUTUBE']),
  shipping_address: z.string().min(1, 'Shipping address is required'),
  quantity: z.coerce.number().int().min(1, 'At least 1 item'),
  total_price: z.coerce.number().nonnegative('Total price must be non-negative'),
})

export type OrderFormValues = z.infer<typeof orderSchema>
