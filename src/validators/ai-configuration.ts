import { z } from 'zod'

export const AI_PURPOSES = [
  { value: 'invoice_parsing', label: 'Invoice Parsing' },
  { value: 'image_enhancement', label: 'Image Enhancement' },
  { value: 'general', label: 'General' },
  { value: 'social_media', label: 'Social Media' },
] as const

export type AiPurpose = (typeof AI_PURPOSES)[number]['value']

export const aiConfigurationSchema = z.object({
  service_name: z.string().min(1, 'Service name is required'),
  api_endpoint_url: z.string().url('Must be a valid URL'),
  api_key_encrypted: z.string().min(1, 'API key is required'),
  purpose: z.string().min(1, 'Purpose is required').default('general'),
})

export type AiConfigurationFormValues = z.infer<typeof aiConfigurationSchema>
