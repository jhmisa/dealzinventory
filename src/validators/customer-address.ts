import { z } from 'zod'

export const customerAddressSchema = z.object({
  address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'A valid address is required',
  }),
  is_default: z.boolean().default(false),
  receiver_first_name: z.string().nullable().optional(),
  receiver_last_name: z.string().nullable().optional(),
  receiver_phone: z.string().nullable().optional(),
})

export type CustomerAddressFormValues = z.infer<typeof customerAddressSchema>
