import { z } from 'zod'

export const socialMediaPostSchema = z.object({
  item_id: z.string().uuid('Select an item'),
  item_code: z.string().optional(),
  platform: z.string().default('facebook'),
  caption: z.string().optional().nullable(),
  media_urls: z.array(z.string()).min(1, 'Select at least one media'),
  schedule_type: z.enum(['now', 'next_slot', 'scheduled']).default('next_slot'),
  scheduled_at: z.string().optional().nullable(),
})

export type SocialMediaPostFormValues = z.infer<typeof socialMediaPostSchema>
