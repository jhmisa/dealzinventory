import { z } from 'zod'

export const aiConfigurationSchema = z.object({
  service_name: z.string().min(1, 'Service name is required'),
  api_endpoint_url: z.string().url('Must be a valid URL'),
  api_key_encrypted: z.string().min(1, 'API key is required'),
})

export type AiConfigurationFormValues = z.infer<typeof aiConfigurationSchema>
