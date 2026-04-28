import type { ConditionGrade, ItemStatus, SourceType, SupplierType, ProductStatus, AcAdapterStatus, OrderStatus, OrderSource, KaitoriStatus, KaitoriDeliveryMethod, KaitoriPaymentMethod, BatteryCondition, ScreenCondition, BodyCondition, KaitoriMediaRole, IntakeAdjustmentType, OfferStatus, SupplierReturnStatus, SupplierReturnResolution, RefundPaymentMethod, InventoryRemovalReason, InventoryRemovalStatus, TicketStatus, TicketPriority } from './types'

// --- Device Category Groupings ---

export type DeviceCategory = 'IPHONE' | 'ANDROID' | 'COMPUTER' | 'TABLET' | 'OTHER'

const ALL_CATEGORIES: DeviceCategory[] = ['IPHONE', 'ANDROID', 'COMPUTER', 'TABLET', 'OTHER']
const PHONES: DeviceCategory[] = ['IPHONE', 'ANDROID']
const COMPUTERS: DeviceCategory[] = ['COMPUTER']
const NON_PHONE: DeviceCategory[] = ['COMPUTER', 'TABLET', 'OTHER']

// --- Inspection Checklist Constants ---

export interface DefectCheckEntry {
  key: string
  label: string
  categories: DeviceCategory[]
}

export interface FunctionalityCheckEntry {
  key: string
  label: string
  categories: DeviceCategory[]
}

export interface SpecCheckFieldEntry {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean'
  categories: DeviceCategory[]
}

export const BODY_DEFECTS: DefectCheckEntry[] = [
  { key: 'body_scratches', label: 'Scratches', categories: ALL_CATEGORIES },
  { key: 'body_dents', label: 'Dents', categories: ALL_CATEGORIES },
  { key: 'body_cracks', label: 'Cracks', categories: ALL_CATEGORIES },
  { key: 'body_discoloration', label: 'Discoloration', categories: ALL_CATEGORIES },
  { key: 'body_missing_parts', label: 'Missing Parts', categories: ALL_CATEGORIES },
]

export const SCREEN_DEFECTS: DefectCheckEntry[] = [
  { key: 'screen_scratches', label: 'Scratches', categories: ALL_CATEGORIES },
  { key: 'screen_dead_pixels', label: 'Dead Pixels', categories: ALL_CATEGORIES },
  { key: 'screen_mura', label: 'Mura (Uneven Backlight)', categories: NON_PHONE },
  { key: 'screen_white_spots', label: 'White Spots', categories: NON_PHONE },
  { key: 'screen_backlight_bleed', label: 'Backlight Bleed', categories: NON_PHONE },
]

export const FUNCTIONALITY_CHECKS: FunctionalityCheckEntry[] = [
  { key: 'func_keyboard', label: 'Keyboard', categories: ['COMPUTER', 'TABLET'] },
  { key: 'func_trackpad', label: 'Trackpad', categories: COMPUTERS },
  { key: 'func_ports', label: 'Ports (USB, HDMI, etc.)', categories: ['COMPUTER', 'TABLET'] },
  { key: 'func_mic_earpiece', label: 'Microphone / Earpiece', categories: PHONES },
  { key: 'func_buttons', label: 'Buttons (Volume, Power, Mute)', categories: PHONES },
  { key: 'func_sim', label: 'SIM Tray / eSIM / Carrier', categories: PHONES },
  { key: 'func_touchscreen', label: 'Touchscreen', categories: ['IPHONE', 'ANDROID', 'TABLET'] },
  { key: 'func_camera', label: 'Camera', categories: ALL_CATEGORIES },
  { key: 'func_speakers', label: 'Speakers / Sound', categories: ALL_CATEGORIES },
  { key: 'func_wifi', label: 'Wi-Fi', categories: ALL_CATEGORIES },
  { key: 'func_bluetooth', label: 'Bluetooth', categories: ALL_CATEGORIES },
]

export const SPEC_CHECK_FIELDS: SpecCheckFieldEntry[] = [
  { key: 'cpu', label: 'CPU', type: 'text', categories: NON_PHONE },
  { key: 'ram_gb', label: 'Memory', type: 'text', categories: NON_PHONE },
  { key: 'storage_gb', label: 'Storage', type: 'text', categories: ALL_CATEGORIES },
  { key: 'os_family', label: 'OS Family', type: 'text', categories: NON_PHONE },
  { key: 'screen_size', label: 'Screen Size', type: 'number', categories: NON_PHONE },
  { key: 'keyboard_layout', label: 'Keyboard', type: 'text', categories: COMPUTERS },
  { key: 'gpu', label: 'GPU', type: 'text', categories: COMPUTERS },
  { key: 'color', label: 'Color', type: 'text', categories: ALL_CATEGORIES },
  { key: 'carrier', label: 'Carrier', type: 'text', categories: PHONES },
  { key: 'is_unlocked', label: 'Unlocked', type: 'boolean', categories: PHONES },
  { key: 'imei', label: 'IMEI', type: 'text', categories: PHONES },
]

export const CONDITION_GRADES: { value: ConditionGrade; label: string; color: string }[] = [
  { value: 'S', label: 'S — Brand New', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'A', label: 'A — Very Good', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'B', label: 'B — Good', color: 'bg-sky-100 text-sky-800 border-sky-300' },
  { value: 'C', label: 'C — Fair', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'D', label: 'D — As-Is', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'J', label: 'J — Junk', color: 'bg-red-100 text-red-800 border-red-300' },
]

export const ITEM_STATUSES: { value: ItemStatus; label: string; color: string }[] = [
  { value: 'INTAKE', label: 'Intake', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'AVAILABLE', label: 'Available', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'RESERVED', label: 'Reserved', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'REPAIR', label: 'Repair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'MISSING', label: 'Missing', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'SOLD', label: 'Sold', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'SUPPLIER_RETURN', label: 'Supplier Return', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'REMOVED', label: 'Removed', color: 'bg-slate-100 text-slate-800 border-slate-300' },
]

export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'AUCTION', label: 'Auction' },
  { value: 'WHOLESALE', label: 'Wholesale' },
  { value: 'KAITORI', label: 'Kaitori' },
]

export const SUPPLIER_TYPES: { value: SupplierType; label: string }[] = [
  { value: 'auction', label: 'Auction House' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'individual_kaitori', label: 'Individual (Kaitori)' },
  { value: 'accessory' as SupplierType, label: 'Accessory Supplier' },
]

export const ACCESSORY_ADJUSTMENT_REASONS = [
  { value: 'DEFECTIVE', label: 'Defective' },
  { value: 'RETURNED_TO_SUPPLIER', label: 'Returned to Supplier' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'WRITE_OFF', label: 'Write-off' },
  { value: 'CORRECTION', label: 'Correction' },
] as const

export const PRODUCT_STATUSES: { value: ProductStatus; label: string; color: string }[] = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-800 border-green-300' },
]

export const AC_ADAPTER_STATUSES: { value: AcAdapterStatus; label: string }[] = [
  { value: 'CORRECT', label: 'Correct' },
  { value: 'INCORRECT', label: 'Incorrect' },
  { value: 'MISSING', label: 'No AC' },
]

export const ORDER_STATUSES: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'PENDING', label: 'Pending', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'CONFIRMED', label: 'Confirmed', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'PACKED', label: 'Packed', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'SHIPPED', label: 'Shipped', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
]

export const ORDER_SOURCES: { value: OrderSource; label: string }[] = [
  { value: 'SHOP', label: 'Shop' },
  { value: 'LIVE_SELLING', label: 'Live Selling' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'FB', label: 'Facebook' },
  { value: 'YOUTUBE', label: 'YouTube' },
]

export const YAMATO_TRACKING_URL = 'https://member.kms.kuronekoyamato.co.jp/parcel/detail'

export type YamatoDeliveryStatus = 'ACCEPTED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED_ATTEMPT' | 'HELD_AT_DEPOT' | 'INVESTIGATING' | 'RETURNED'

export const YAMATO_DELIVERY_STATUSES: Record<YamatoDeliveryStatus, { label: string; label_en: string; color: string }> = {
  ACCEPTED:         { label: '受付済',   label_en: 'Accepted',          color: 'bg-gray-100 text-gray-800 border-gray-300' },
  IN_TRANSIT:       { label: '輸送中',   label_en: 'In Transit',        color: 'bg-blue-100 text-blue-800 border-blue-300' },
  OUT_FOR_DELIVERY: { label: '配達中',   label_en: 'Out for Delivery',  color: 'bg-blue-100 text-blue-800 border-blue-300' },
  DELIVERED:        { label: '配達完了', label_en: 'Delivered',          color: 'bg-green-100 text-green-800 border-green-300' },
  FAILED_ATTEMPT:   { label: '持戻',     label_en: 'Failed Attempt',    color: 'bg-orange-100 text-orange-800 border-orange-300' },
  HELD_AT_DEPOT:    { label: '保管中',   label_en: 'Held at Depot',     color: 'bg-orange-100 text-orange-800 border-orange-300' },
  INVESTIGATING:    { label: '調査中',   label_en: 'Investigating',     color: 'bg-red-100 text-red-800 border-red-300' },
  RETURNED:         { label: '返品',     label_en: 'Returned',          color: 'bg-red-100 text-red-800 border-red-300' },
} as const

export function getYamatoStatusConfig(status: string | null | undefined) {
  if (!status) return null
  return YAMATO_DELIVERY_STATUSES[status as YamatoDeliveryStatus] ?? null
}

export const YAMATO_TIME_SLOTS = [
  { code: '01', label: '午前中 (9:00AM–12:00PM)', label_en: 'Morning (9AM–12PM)' },
  { code: '14', label: '14:00–16:00 (2:00PM–4:00PM)', label_en: '2PM–4PM' },
  { code: '16', label: '16:00–18:00 (4:00PM–6:00PM)', label_en: '4PM–6PM' },
  { code: '04', label: '18:00–20:00 (6:00PM–8:00PM)', label_en: '6PM–8PM' },
] as const

export function getOrderStatusConfig(status: OrderStatus) {
  return ORDER_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

export function getGradeConfig(grade: ConditionGrade | null | undefined) {
  return CONDITION_GRADES.find(g => g.value === grade) ?? { value: grade, label: grade ?? '—', color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

export function getStatusConfig(status: ItemStatus) {
  return ITEM_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

// --- Kaitori ---

export const KAITORI_STATUSES: { value: KaitoriStatus; label: string; color: string }[] = [
  { value: 'QUOTED', label: 'Quoted', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'ACCEPTED', label: 'Accepted', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'SHIPPED', label: 'Shipped', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'RECEIVED', label: 'Received', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'INSPECTING', label: 'Inspecting', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'PRICE_REVISED', label: 'Price Revised', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'PAID', label: 'Paid', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
]

export function getKaitoriStatusConfig(status: KaitoriStatus) {
  return KAITORI_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

export const KAITORI_DELIVERY_METHODS: { value: KaitoriDeliveryMethod; label: string }[] = [
  { value: 'SHIP', label: 'Ship (送付)' },
  { value: 'WALK_IN', label: 'Walk-in (持込)' },
]

export const KAITORI_PAYMENT_METHODS: { value: KaitoriPaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash (現金)' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer (振込)' },
]

export const BATTERY_CONDITIONS: { value: BatteryCondition; label: string; description: string }[] = [
  { value: 'GOOD', label: 'Good', description: '80%+ capacity, holds charge well' },
  { value: 'FAIR', label: 'Fair', description: '50-80% capacity, drains faster' },
  { value: 'POOR', label: 'Poor', description: 'Below 50%, needs replacement' },
]

export const SCREEN_CONDITIONS: { value: ScreenCondition; label: string; description: string }[] = [
  { value: 'GOOD', label: 'Good', description: 'No scratches or dead pixels' },
  { value: 'FAIR', label: 'Fair', description: 'Minor scratches, all pixels work' },
  { value: 'POOR', label: 'Poor', description: 'Noticeable scratches or dead pixels' },
  { value: 'CRACKED', label: 'Cracked', description: 'Screen is cracked or shattered' },
]

export const BODY_CONDITIONS: { value: BodyCondition; label: string; description: string }[] = [
  { value: 'GOOD', label: 'Good', description: 'No dents, scratches, or scuffs' },
  { value: 'FAIR', label: 'Fair', description: 'Light scratches or minor scuffs' },
  { value: 'POOR', label: 'Poor', description: 'Visible dents or deep scratches' },
  { value: 'DAMAGED', label: 'Damaged', description: 'Broken parts, missing keys/buttons' },
]

export const KAITORI_MEDIA_ROLES: { value: KaitoriMediaRole; label: string }[] = [
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'screen', label: 'Screen' },
  { value: 'battery_info', label: 'Battery Info' },
  { value: 'damage', label: 'Damage' },
  { value: 'other', label: 'Other' },
]

// --- Category Spec Fields ---

export const AVAILABLE_SPEC_FIELDS: { key: string; label: string }[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'model_name', label: 'Model Name' },
  { key: 'model_number', label: 'Model Number' },
  { key: 'part_number', label: 'Part Number' },
  { key: 'color', label: 'Color' },
  { key: 'cpu', label: 'CPU' },
  { key: 'ram_gb', label: 'Memory' },
  { key: 'storage_gb', label: 'Storage' },
  { key: 'os_family', label: 'OS Family' },
  { key: 'gpu', label: 'GPU' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'is_unlocked', label: 'Unlocked' },
  { key: 'keyboard_layout', label: 'Keyboard Layout' },
  { key: 'screen_size', label: 'Screen Size' },
  { key: 'has_touchscreen', label: 'Touchscreen' },
  { key: 'has_thunderbolt', label: 'Thunderbolt' },
  { key: 'supports_stylus', label: 'Stylus Support' },
  { key: 'has_cellular', label: 'Cellular' },
  { key: 'imei_slot_count', label: 'IMEI Slot Count' },
  { key: 'chipset', label: 'Chipset' },
  { key: 'ports', label: 'Ports' },
  { key: 'year', label: 'Year' },
  { key: 'other_features', label: 'Other Features' },
  { key: 'has_camera', label: 'Camera' },
  { key: 'has_bluetooth', label: 'Bluetooth' },
  { key: 'battery_health_pct', label: 'Battery Health (%)' },
  { key: 'condition_notes', label: 'Condition Notes' },
]

// Fields always shown in the description (available even if not in form_fields)
export const ALWAYS_DESCRIPTION_FIELDS = ['brand', 'model_name', 'color']

export function getSpecFieldLabel(key: string): string {
  return AVAILABLE_SPEC_FIELDS.find(f => f.key === key)?.label ?? key
}

// --- Intake Adjustments ---

export const INTAKE_ADJUSTMENT_TYPES: { value: IntakeAdjustmentType; label: string; color: string }[] = [
  { value: 'VOIDED', label: 'Voided', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'RETURNED', label: 'Returned', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'REFUNDED', label: 'Refunded', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'MISSING', label: 'Missing', color: 'bg-red-100 text-red-800 border-red-300' },
]

export function getAdjustmentTypeConfig(type: IntakeAdjustmentType) {
  return INTAKE_ADJUSTMENT_TYPES.find(t => t.value === type) ?? { value: type, label: type, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

// --- Payment Methods (Order) ---

export type PaymentMethod = 'COD' | 'CREDIT_CARD' | 'BANK' | 'KONBINI' | 'CASH' | 'PAYPAL'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; code: number }[] = [
  { value: 'COD', label: 'Cash On Delivery (代引き)', code: 2 },
  { value: 'CREDIT_CARD', label: 'Credit Card', code: 2 },
  { value: 'BANK', label: 'Bank Transfer (振込)', code: 0 },
  { value: 'KONBINI', label: 'Konbini (コンビニ)', code: 0 },
  { value: 'CASH', label: 'Cash (現金)', code: 0 },
  { value: 'PAYPAL', label: 'PayPal', code: 0 },
]

export const REQUIRES_PAYMENT_CONFIRMATION: PaymentMethod[] = ['KONBINI', 'PAYPAL', 'BANK']

export function requiresPaymentConfirmation(method: string | null | undefined): boolean {
  return REQUIRES_PAYMENT_CONFIRMATION.includes(method as PaymentMethod)
}

export function getPaymentMethodLabel(value: string | null | undefined): string {
  return PAYMENT_METHODS.find(m => m.value === value)?.label ?? '—'
}

// --- Offers ---

export const OFFER_STATUSES: { value: OfferStatus; label: string; color: string }[] = [
  { value: 'PENDING', label: 'Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'CLAIMED', label: 'Claimed', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'EXPIRED', label: 'Expired', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
]

export function getOfferStatusConfig(status: OfferStatus) {
  return OFFER_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

// --- Order Cancellation ---

export const CANCELLATION_CATEGORIES = [
  { value: 'CUSTOMER_REFUSED', label: 'Customer Did Not Accept' },
  { value: 'WRONG_ADDRESS', label: 'Wrong Address' },
  { value: 'OTHER', label: 'Others' },
] as const

export type CancellationCategory = typeof CANCELLATION_CATEGORIES[number]['value']

export function getCancellationCategoryLabel(value: string | null | undefined): string {
  return CANCELLATION_CATEGORIES.find(c => c.value === value)?.label ?? '—'
}

// --- Returns ---

export type ReturnStatus = 'SUBMITTED' | 'APPROVED' | 'SHIPPED_BACK' | 'RECEIVED' | 'INSPECTING' | 'RESOLVED' | 'REJECTED' | 'CANCELLED'
export type ReturnReasonCategory = 'DEFECTIVE' | 'WRONG_ITEM' | 'DAMAGED_IN_TRANSIT' | 'NOT_AS_DESCRIBED' | 'OTHER'
export type ReturnResolution = 'REFUND' | 'REPLACE' | 'REPAIR' | 'REJECTED'

export const RETURN_STATUSES: { value: ReturnStatus; label: string; color: string }[] = [
  { value: 'SUBMITTED', label: 'Submitted', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'SHIPPED_BACK', label: 'Shipped Back', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'RECEIVED', label: 'Received', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  { value: 'INSPECTING', label: 'Inspecting', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-gray-100 text-gray-800 border-gray-300' },
]

export const RETURN_REASONS: { value: ReturnReasonCategory; label: string }[] = [
  { value: 'DEFECTIVE', label: 'Item is defective / not working' },
  { value: 'WRONG_ITEM', label: 'Received wrong item' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged during shipping' },
  { value: 'NOT_AS_DESCRIBED', label: 'Not as described (specs, condition)' },
  { value: 'OTHER', label: 'Other issue' },
]

export const RESOLUTION_TYPES: { value: ReturnResolution; label: string; color: string }[] = [
  { value: 'REFUND', label: 'Refund', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'REPLACE', label: 'Replace', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'REPAIR', label: 'Repair', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
]

export function getReturnStatusConfig(status: ReturnStatus) {
  return RETURN_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

// --- Defect Types (for inspection defect-based condition tracking) ---

export const DEFECT_TYPES = {
  body: [
    { value: 'scratch', label: 'Scratch' },
    { value: 'dent', label: 'Dent' },
    { value: 'crack', label: 'Crack' },
    { value: 'discoloration', label: 'Discoloration' },
    { value: 'missing_part', label: 'Missing Part' },
    { value: 'sticker_residue', label: 'Sticker Residue' },
    { value: 'other', label: 'Other' },
  ],
  screen: [
    { value: 'scratch', label: 'Scratch' },
    { value: 'dead_pixel', label: 'Dead Pixel' },
    { value: 'crack', label: 'Crack' },
    { value: 'mura', label: 'Mura (Uneven Backlight)' },
    { value: 'white_spot', label: 'White Spot' },
    { value: 'backlight_bleed', label: 'Backlight Bleed' },
    { value: 'burn_in', label: 'Burn-in' },
    { value: 'other', label: 'Other' },
  ],
  keyboard: [
    { value: 'sticky_key', label: 'Sticky Key' },
    { value: 'missing_key', label: 'Missing Key' },
    { value: 'non_functional_key', label: 'Non-functional Key' },
    { value: 'worn_keycap', label: 'Worn Keycap' },
    { value: 'other', label: 'Other' },
  ],
} as const

// 'other' area uses free-text input instead of dropdown
export type DefectArea = keyof typeof DEFECT_TYPES | 'other'

// --- Audit Log Field Labels ---

export const AUDIT_FIELD_LABELS: Record<string, string> = {
  item_status: 'Status',
  condition_grade: 'Grade',
  product_id: 'Product',
  category_id: 'Category',
  supplier_id: 'Supplier',
  source_type: 'Source Type',
  brand: 'Brand',
  model_name: 'Model',
  color: 'Color',
  short_description: 'Short Description',
  cpu: 'CPU',
  ram_gb: 'Memory',
  storage_gb: 'Storage',
  screen_size: 'Screen Size',
  os_family: 'OS',
  chipset: 'Chipset',
  ports: 'Ports',
  gpu: 'GPU',
  year: 'Year',
  other_features: 'Other Features',
  keyboard_layout: 'Keyboard',
  has_touchscreen: 'Touchscreen',
  has_thunderbolt: 'Thunderbolt',
  serial_number: 'Serial Number',
  purchase_price: 'Purchase Price',
  selling_price: 'Selling Price',
  discount: 'Discount',
  supplier_description: 'Supplier Description',
  ac_adapter_status: 'AC Adapter',
  notes: 'Notes',
  inspected_by: 'Inspected By',
  inspected_at: 'Inspected At',
  intake_receipt_id: 'Intake Receipt',
  device_category: 'Device Category',
  battery_health_pct: 'Battery Health',
  condition_notes: 'Condition Notes',
  specs_notes: 'Specs Notes',
  carrier: 'Carrier',
  is_unlocked: 'Unlocked',
  imei: 'IMEI',
  imei2: 'IMEI 2',
  kaitori_request_id: 'Kaitori Request',
  missing_since: 'Missing Since',
  missing_notes: 'Missing Notes',
}

// --- Supplier Returns ---

export const SUPPLIER_RETURN_STATUSES: { value: SupplierReturnStatus; label: string; color: string }[] = [
  { value: 'REQUESTED', label: 'Requested', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'RETURNED', label: 'Returned', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-green-100 text-green-800 border-green-300' },
]

export const SUPPLIER_RETURN_RESOLUTIONS: { value: SupplierReturnResolution; label: string; color: string }[] = [
  { value: 'EXCHANGE', label: 'Exchange', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'REFUND', label: 'Refund', color: 'bg-green-100 text-green-800 border-green-300' },
]

export const REFUND_PAYMENT_METHODS: { value: RefundPaymentMethod; label: string }[] = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer (振込)' },
  { value: 'CASH', label: 'Cash (現金)' },
]

export function getSupplierReturnStatusConfig(status: SupplierReturnStatus) {
  return SUPPLIER_RETURN_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

// --- Inventory Removals ---

export const INVENTORY_REMOVAL_STATUSES: { value: InventoryRemovalStatus; label: string; color: string }[] = [
  { value: 'PENDING', label: 'Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
]

export const INVENTORY_REMOVAL_REASONS: { value: InventoryRemovalReason; label: string }[] = [
  { value: 'MISSING', label: 'Missing' },
  { value: 'OFFICE_USE', label: 'Office Use' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'GIFTED', label: 'Gifted' },
  { value: 'OTHER', label: 'Other' },
]

export function getRemovalStatusConfig(status: InventoryRemovalStatus) {
  return INVENTORY_REMOVAL_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

export function getRemovalReasonLabel(reason: InventoryRemovalReason) {
  return INVENTORY_REMOVAL_REASONS.find(r => r.value === reason)?.label ?? reason
}

// --- Tickets ---

export const TICKET_STATUSES: { value: TicketStatus; label: string; color: string }[] = [
  { value: 'OPEN', label: 'Open', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'RESOLVED', label: 'Resolved', color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-300' },
]

export const TICKET_PRIORITIES: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Low', color: 'bg-gray-100 text-gray-800 border-gray-300' },
  { value: 'NORMAL', label: 'Normal', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'URGENT', label: 'Urgent', color: 'bg-red-100 text-red-800 border-red-300' },
]

export function getTicketStatusConfig(status: TicketStatus) {
  return TICKET_STATUSES.find(s => s.value === status) ?? { value: status, label: status, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}

export function getTicketPriorityConfig(priority: TicketPriority) {
  return TICKET_PRIORITIES.find(p => p.value === priority) ?? { value: priority, label: priority, color: 'bg-gray-100 text-gray-800 border-gray-300' }
}
