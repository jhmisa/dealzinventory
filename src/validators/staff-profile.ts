import { z } from 'zod'

const staffRoles = ['ADMIN', 'VA', 'IT', 'LIVE_SELLER'] as const

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

export type SetPasswordFormValues = z.infer<typeof setPasswordSchema>

export const inviteStaffSchema = z
  .object({
    email: z.string().email('Valid email is required'),
    display_name: z.string().min(1, 'Display name is required'),
    role: z.enum(staffRoles, { required_error: 'Role is required' }),
    password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
    confirm_password: z.string().optional().or(z.literal('')),
    send_setup_email: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.password && data.password.length > 0) {
        return data.password === data.confirm_password
      }
      return true
    },
    {
      message: 'Passwords do not match',
      path: ['confirm_password'],
    },
  )

export type InviteStaffFormValues = z.infer<typeof inviteStaffSchema>

export const editStaffSchema = z.object({
  display_name: z.string().min(1, 'Display name is required'),
  role: z.enum(staffRoles, { required_error: 'Role is required' }),
  is_active: z.boolean(),
})

export type EditStaffFormValues = z.infer<typeof editStaffSchema>
