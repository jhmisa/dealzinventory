import { z } from 'zod'

export const createSystemFeedbackSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().optional(),
  type: z.enum(['BUG', 'FEATURE_REQUEST'], { required_error: 'Type is required' }),
})

export type CreateSystemFeedbackFormValues = z.infer<typeof createSystemFeedbackSchema>
