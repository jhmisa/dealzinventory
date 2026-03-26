import { z } from 'zod'

const staffRoles = ['ADMIN', 'VA', 'IT', 'LIVE_SELLER'] as const

export const inviteStaffSchema = z.object({
  email: z.string().email('Valid email is required'),
  display_name: z.string().min(1, 'Display name is required'),
  role: z.enum(staffRoles, { required_error: 'Role is required' }),
})

export type InviteStaffFormValues = z.infer<typeof inviteStaffSchema>

export const editStaffSchema = z.object({
  display_name: z.string().min(1, 'Display name is required'),
  role: z.enum(staffRoles, { required_error: 'Role is required' }),
  is_active: z.boolean(),
})

export type EditStaffFormValues = z.infer<typeof editStaffSchema>
