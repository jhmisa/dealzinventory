import { z } from 'zod'

export const sellGroupSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  condition_grade: z.enum(['S', 'A', 'B', 'C', 'D'], {
    required_error: 'Grade is required (J not allowed for sell groups)',
  }),
  base_price: z.coerce.number().positive('Price must be positive'),
  active: z.boolean(),
})

export type SellGroupFormValues = z.infer<typeof sellGroupSchema>
