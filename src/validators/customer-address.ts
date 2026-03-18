import { z } from 'zod'

export const customerAddressSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g. "Home", "Office")'),
  care_of: z.string().nullable().optional(),
  address: z.any().refine((val) => val && typeof val === 'object' && val.country, {
    message: 'A valid address is required',
  }),
  is_default: z.boolean().default(false),
})

export type CustomerAddressFormValues = z.infer<typeof customerAddressSchema>
