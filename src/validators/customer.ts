import { z } from 'zod'

export const customerLoginSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  email_or_phone: z.string().min(1, 'Email or phone is required'),
  pin: z.string().length(6, 'PIN must be 6 digits').regex(/^\d{6}$/, 'PIN must be 6 digits'),
})

export type CustomerLoginFormValues = z.infer<typeof customerLoginSchema>

export const customerRegisterSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  pin: z.string().length(6, 'PIN must be 6 digits').regex(/^\d{6}$/, 'PIN must be 6 digits'),
  pin_confirm: z.string().length(6, 'PIN must be 6 digits'),
  shipping_address: z.string().optional().or(z.literal('')),
}).refine((data) => data.pin === data.pin_confirm, {
  message: 'PINs do not match',
  path: ['pin_confirm'],
}).refine((data) => data.email || data.phone, {
  message: 'Email or phone is required',
  path: ['email'],
})

export type CustomerRegisterFormValues = z.infer<typeof customerRegisterSchema>

export const customerProfileSchema = z.object({
  last_name: z.string().min(1, 'Last name is required'),
  first_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Valid email required').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  shipping_address: z.string().optional().or(z.literal('')),
  is_seller: z.boolean().default(false),
  bank_name: z.string().optional().or(z.literal('')),
  bank_branch: z.string().optional().or(z.literal('')),
  bank_account_number: z.string().optional().or(z.literal('')),
  bank_account_holder: z.string().optional().or(z.literal('')),
})

export type CustomerProfileFormValues = z.infer<typeof customerProfileSchema>

export const changePinSchema = z.object({
  current_pin: z.string().length(6, 'PIN must be 6 digits').regex(/^\d{6}$/, 'PIN must be 6 digits'),
  new_pin: z.string().length(6, 'PIN must be 6 digits').regex(/^\d{6}$/, 'PIN must be 6 digits'),
  confirm_pin: z.string().length(6, 'PIN must be 6 digits'),
}).refine((data) => data.new_pin === data.confirm_pin, {
  message: 'PINs do not match',
  path: ['confirm_pin'],
})

export type ChangePinFormValues = z.infer<typeof changePinSchema>
