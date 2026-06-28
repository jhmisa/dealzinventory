import { z } from 'zod'

// Schema for the "Add Backorder" paste-to-add dialog. Photos are curated and
// persisted separately via saveBackorderPhotos, so they are NOT part of this
// schema. selling_price is REQUIRED here even though the column is nullable.
export const backorderSchema = z
  .object({
    product_id: z.string().uuid('Select a product model'),
    supplier_id: z.string().uuid('Select a supplier'),
    condition_grade: z.enum(['S', 'A', 'B', 'C', 'D', 'J'], {
      required_error: 'Select a condition grade',
    }),
    selling_price: z.coerce
      .number({ invalid_type_error: 'Selling price is required' })
      .positive('Selling price must be greater than 0'),
    // color = canonical English (inventory + customer-facing); color_ja = Japanese (Kaitori side).
    color: z.string().trim().optional(),
    color_ja: z.string().trim().optional(),
    storage_gb: z.coerce.number().int().nonnegative().optional(),
    ram_gb: z.coerce.number().int().nonnegative().optional(),
    cpu: z.string().trim().optional(),
    screen_size: z.coerce.number().nonnegative().optional(),
    supplier_price: z.coerce.number().nonnegative().optional(),
    // Markup (¥) added on top of supplier_price to derive selling_price. Default ¥4000;
    // editable up or down per line.
    markup_jpy: z.coerce.number().nonnegative('Markup cannot be negative').default(4000),
    supplier_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    supplier_product_code: z.string().trim().optional(),
    supplier_stock: z.coerce.number().int().nonnegative().optional(),
    quantity_total: z.coerce.number().int().min(1, 'Quantity must be at least 1').default(1),
    // Lead time is a working-day RANGE: min..max. lead_time_days is the upper bound (max).
    lead_time_min_days: z.coerce.number().int().min(0, 'Lead time cannot be negative').default(4),
    lead_time_days: z.coerce.number().int().min(0, 'Lead time cannot be negative').default(7),
  })
  .refine((v) => v.lead_time_min_days <= v.lead_time_days, {
    message: 'Min lead time cannot exceed max',
    path: ['lead_time_min_days'],
  })

export type BackorderFormValues = z.infer<typeof backorderSchema>
