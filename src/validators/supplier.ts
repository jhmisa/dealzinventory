import { z } from 'zod'

export const supplierSchema = z.object({
  supplier_name: z.string().min(1, 'Supplier name is required'),
  supplier_type: z.enum(['auction', 'wholesaler', 'individual_kaitori', 'accessory'], {
    required_error: 'Supplier type is required',
  }),
  contact_info: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
})

export type SupplierFormValues = z.infer<typeof supplierSchema>
