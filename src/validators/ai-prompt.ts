import { z } from 'zod'

export const aiPromptSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  prompt_text: z.string().min(1, 'Prompt text is required'),
  media_type: z.string().default('image'),
  sample_image_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
})

export type AiPromptFormValues = z.infer<typeof aiPromptSchema>
