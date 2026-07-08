import { z } from 'zod'

// Validation for the "New / Edit Shoot" dialog. A shoot is a lightweight plan card:
// a title, an optional assignee (from staff_profiles), the item codes to feature, and notes.
export const shootSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  assignee_id: z.string().uuid().nullable().optional(),
  item_codes: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().trim().optional(),
  orientation: z.enum(['portrait', 'landscape']).optional(),
})

export type ShootFormValues = z.infer<typeof shootSchema>
