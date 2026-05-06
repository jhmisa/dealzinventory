import { z } from 'zod'

export const sellGroupSchema = z.object({
  discount_amount: z.coerce.number().int().nonnegative('Discount cannot be negative'),
  active: z.boolean(),
})

export type SellGroupFormValues = z.infer<typeof sellGroupSchema>
