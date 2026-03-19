import { z } from 'zod'

const funcStatusEnum = z.enum(['WORKING', 'PROBLEM', '']).default('')

export const inspectionChecklistSchema = z.object({
  // Functionality — status + note pairs
  func_keyboard_status: funcStatusEnum,
  func_keyboard_note: z.string().default(''),
  func_trackpad_status: funcStatusEnum,
  func_trackpad_note: z.string().default(''),
  func_ports_status: funcStatusEnum,
  func_ports_note: z.string().default(''),
  func_mic_earpiece_status: funcStatusEnum,
  func_mic_earpiece_note: z.string().default(''),
  func_buttons_status: funcStatusEnum,
  func_buttons_note: z.string().default(''),
  func_sim_status: funcStatusEnum,
  func_sim_note: z.string().default(''),
  func_touchscreen_status: funcStatusEnum,
  func_touchscreen_note: z.string().default(''),
  func_camera_status: funcStatusEnum,
  func_camera_note: z.string().default(''),
  func_speakers_status: funcStatusEnum,
  func_speakers_note: z.string().default(''),
  func_wifi_status: funcStatusEnum,
  func_wifi_note: z.string().default(''),
  func_bluetooth_status: funcStatusEnum,
  func_bluetooth_note: z.string().default(''),
})

export type InspectionChecklist = z.infer<typeof inspectionChecklistSchema>

export const inspectionSchema = z.object({
  condition_grade: z.enum(['S', 'A', 'B', 'C', 'D', 'J'], {
    required_error: 'Condition grade is required',
  }),
  item_status: z.enum(['AVAILABLE', 'REPAIR', 'MISSING']),
  product_id: z.string().optional().or(z.literal('')),
  ac_adapter_status: z.enum(['CORRECT', 'INCORRECT', 'MISSING']).optional(),

  // Battery
  battery_health_pct: z.coerce.number().int().min(0).max(100).nullable().optional(),

  // Inspection checklist (JSONB) — functionality checks only
  inspection_checklist: inspectionChecklistSchema.default({}),

  // Spec correction fields (saved directly to item columns)
  cpu: z.string().optional().or(z.literal('')),
  ram_gb: z.coerce.number().int().positive().nullable().optional(),
  storage_gb: z.coerce.number().int().positive().nullable().optional(),
  os_family: z.string().optional().or(z.literal('')),
  screen_size: z.coerce.number().positive().nullable().optional(),
  keyboard_layout: z.string().optional().or(z.literal('')),
  gpu: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  carrier: z.string().optional().or(z.literal('')),
  is_unlocked: z.boolean().nullable().optional(),
  imei: z.string().optional().or(z.literal('')),

  // Specs verified by IT (confirms specs match what's in the system)
  specs_verified: z.boolean().default(false),

  // Notes
  specs_notes: z.string().optional().or(z.literal('')),
  condition_notes: z.string().optional().or(z.literal('')),

  // Pricing
  purchase_price: z.coerce.number().nonnegative().nullable().optional(),
  selling_price: z.coerce.number().nonnegative().nullable().optional(),
}).refine(
  (data) => !(data.condition_grade === 'J' && data.item_status === 'AVAILABLE'),
  { message: 'Grade J items cannot be set to Available', path: ['item_status'] },
)

export type InspectionFormValues = z.infer<typeof inspectionSchema>
