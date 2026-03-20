import { z } from 'zod'

export const createOfferSchema = z.object({
  fb_name: z.string().min(1, 'FB name is required'),
  price: z.coerce.number().int().min(0, 'Price must be non-negative'),
  notes: z.string().optional().or(z.literal('')),
})

export type CreateOfferFormValues = z.infer<typeof createOfferSchema>

export const claimOfferSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Valid email required'),
  phone: z.string().optional().or(z.literal('')),
})

export type ClaimOfferFormValues = z.infer<typeof claimOfferSchema>

export const customOfferItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  unit_price: z.coerce.number().int().min(0, 'Price must be non-negative'),
  quantity: z.coerce.number().int().min(1, 'At least 1'),
})

export type CustomOfferItemFormValues = z.infer<typeof customOfferItemSchema>
