import { z } from 'zod'

export const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  form_fields: z.array(z.string()).default([]),
  description_fields: z.array(z.string()).default([]),
  sort_order: z.coerce.number().int().default(0),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
