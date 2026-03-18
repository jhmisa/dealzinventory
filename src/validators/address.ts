import { z } from 'zod'

export const shippingAddressJPSchema = z.object({
  country: z.literal('JP'),
  postal_code: z.string().min(1, 'Postal code is required'),
  prefecture_ja: z.string().min(1, 'Prefecture is required'),
  prefecture_en: z.string().min(1),
  city_ja: z.string().min(1, 'City is required'),
  city_en: z.string().min(1, 'City (English) is required'),
  town_ja: z.string().optional().or(z.literal('')),
  town_en: z.string().optional().or(z.literal('')),
  address_line_1: z.string().min(1, 'Address is required'),
  address_line_2: z.string().optional().or(z.literal('')),
})

export const shippingAddressIntlSchema = z.object({
  country: z.string().length(2, 'Country is required').refine(c => c !== 'JP', 'Use JP address form for Japan'),
  address_line_1: z.string().min(1, 'Address is required'),
  address_line_2: z.string().optional().or(z.literal('')),
  city: z.string().min(1, 'City is required'),
  state: z.string().optional().or(z.literal('')),
  postal_code: z.string().min(1, 'Postal code is required'),
})

export const shippingAddressLegacySchema = z.object({
  country: z.string(),
  freeform_legacy: z.string(),
})

// Union schema — validates based on country field
export const shippingAddressSchema = z.union([
  shippingAddressJPSchema,
  shippingAddressIntlSchema,
  shippingAddressLegacySchema,
])

export type ShippingAddressJPFormValues = z.infer<typeof shippingAddressJPSchema>
export type ShippingAddressIntlFormValues = z.infer<typeof shippingAddressIntlSchema>
export type ShippingAddressFormValues = z.infer<typeof shippingAddressSchema>
