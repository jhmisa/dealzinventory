import type { Database } from './database.types'

// Table row types
type Tables = Database['public']['Tables']

export type Category = Tables['categories']['Row']
export type CategoryInsert = Tables['categories']['Insert']
export type CategoryUpdate = Tables['categories']['Update']

export type ProductModel = Tables['product_models']['Row']
export type ProductModelInsert = Tables['product_models']['Insert']
export type ProductModelUpdate = Tables['product_models']['Update']

export type ProductMedia = Tables['product_media']['Row']
export type ProductMediaInsert = Tables['product_media']['Insert']

export type Supplier = Tables['suppliers']['Row']
export type SupplierInsert = Tables['suppliers']['Insert']
export type SupplierUpdate = Tables['suppliers']['Update']

export type Item = Tables['items']['Row']
export type ItemInsert = Tables['items']['Insert']
export type ItemUpdate = Tables['items']['Update']

export type SellGroup = Tables['sell_groups']['Row']
export type SellGroupInsert = Tables['sell_groups']['Insert']
export type SellGroupUpdate = Tables['sell_groups']['Update']

export type SellGroupItem = Tables['sell_group_items']['Row']

export type Customer = Tables['customers']['Row']
export type CustomerInsert = Tables['customers']['Insert']
export type CustomerUpdate = Tables['customers']['Update']

export type Order = Tables['orders']['Row']
export type OrderInsert = Tables['orders']['Insert']
export type OrderUpdate = Tables['orders']['Update']

export type OrderItem = Tables['order_items']['Row']

export type CustomerAddress = Tables['customer_addresses']['Row']
export type CustomerAddressInsert = Tables['customer_addresses']['Insert']
export type CustomerAddressUpdate = Tables['customer_addresses']['Update']

export type KaitoriPriceEntry = Tables['kaitori_price_list']['Row']
export type KaitoriPriceEntryInsert = Tables['kaitori_price_list']['Insert']
export type KaitoriPriceEntryUpdate = Tables['kaitori_price_list']['Update']

export type KaitoriRequest = Tables['kaitori_requests']['Row']
export type KaitoriRequestInsert = Tables['kaitori_requests']['Insert']
export type KaitoriRequestUpdate = Tables['kaitori_requests']['Update']

export type KaitoriRequestMedia = Tables['kaitori_request_media']['Row']

export type AiConfiguration = Tables['ai_configurations']['Row']
export type AiConfigurationInsert = Tables['ai_configurations']['Insert']
export type AiConfigurationUpdate = Tables['ai_configurations']['Update']

export type IntakeReceipt = Tables['intake_receipts']['Row']
export type IntakeReceiptInsert = Tables['intake_receipts']['Insert']

export type IntakeReceiptLineItem = Tables['intake_receipt_line_items']['Row']
export type IntakeReceiptLineItemInsert = Tables['intake_receipt_line_items']['Insert']

export type IntakeAdjustment = Tables['intake_adjustments']['Row']
export type IntakeAdjustmentInsert = Tables['intake_adjustments']['Insert']

export type Offer = Tables['offers']['Row']
export type OfferInsert = Tables['offers']['Insert']
export type OfferUpdate = Tables['offers']['Update']

export type OfferItem = Tables['offer_items']['Row']
export type OfferItemInsert = Tables['offer_items']['Insert']

export type PaymentConfirmation = Tables['payment_confirmations']['Row']
export type PaymentConfirmationInsert = Tables['payment_confirmations']['Insert']

// Accessory types — manually defined until DB types are regenerated
export interface Accessory {
  id: string
  accessory_code: string
  name: string
  description: string | null
  brand: string | null
  category_id: string | null
  selling_price: number
  stock_quantity: number
  low_stock_threshold: number
  shop_visible: boolean
  active: boolean
  is_live_selling: boolean
  created_at: string
  updated_at: string
}

export interface AccessoryInsert {
  accessory_code: string
  name: string
  description?: string | null
  brand?: string | null
  category_id?: string | null
  selling_price: number
  stock_quantity?: number
  low_stock_threshold?: number
  shop_visible?: boolean
  active?: boolean
}

export interface AccessoryUpdate {
  name?: string
  description?: string | null
  brand?: string | null
  category_id?: string | null
  selling_price?: number
  low_stock_threshold?: number
  shop_visible?: boolean
  active?: boolean
}

export interface AccessoryMedia {
  id: string
  accessory_id: string
  file_url: string
  media_type: string
  sort_order: number
  created_at: string
}

export interface AccessoryStockEntry {
  id: string
  accessory_id: string
  supplier_id: string | null
  receipt_id: string | null
  quantity: number
  unit_cost: number
  total_cost: number
  notes: string | null
  received_at: string
  created_by: string | null
  created_at: string
}

export interface AccessoryStockAdjustment {
  id: string
  accessory_id: string
  quantity: number
  reason: AccessoryAdjustmentReason
  supplier_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type AccessoryAdjustmentReason = 'DEFECTIVE' | 'RETURNED_TO_SUPPLIER' | 'DAMAGED' | 'WRITE_OFF' | 'CORRECTION'

export type AccessoryWithRelations = Accessory & {
  categories?: { name: string } | null
  accessory_media?: AccessoryMedia[]
}


export interface ParsedSpecs {
  brand?: string
  model_name?: string
  cpu?: string
  ram_gb?: string
  storage_gb?: string
  screen_size?: number
  serial_number?: string
}

export type ItemMedia = Tables['item_media']['Row']
export type ItemMediaInsert = Tables['item_media']['Insert']
export type ItemMediaUpdate = Tables['item_media']['Update']

export type ItemCost = Tables['item_costs']['Row']
export type ItemCostInsert = Tables['item_costs']['Insert']

export type ItemAuditLog = Tables['item_audit_logs']['Row']

export type ItemListColumnSetting = Tables['item_list_column_settings']['Row']

export type ProductModelWithHeroImage = ProductModel & {
  hero_image_url: string | null
  media_count: number
  categories?: { name: string } | null
}

// Enum types
type Enums = Database['public']['Enums']

export type ConditionGrade = Enums['condition_grade']
export type ItemStatus = Enums['item_status']
export type SourceType = Enums['source_type']
export type AcAdapterStatus = Enums['ac_adapter_status']
export type SupplierType = Enums['supplier_type']
export type ProductStatus = Enums['product_status']
export type MediaType = Enums['media_type']
export type MediaRole = Enums['media_role']
export type OrderStatus = Enums['order_status']
export type OrderSource = Enums['order_source']
export type KaitoriStatus = Enums['kaitori_status']
export type KaitoriDeliveryMethod = Enums['kaitori_delivery_method']
export type KaitoriPaymentMethod = Enums['kaitori_payment_method']
export type BatteryCondition = Enums['battery_condition']
export type ScreenCondition = Enums['screen_condition']
export type BodyCondition = Enums['body_condition']
export type KaitoriMediaRole = Enums['kaitori_media_role']
export type IntakeAdjustmentType = Enums['intake_adjustment_type']
export type OfferStatus = Enums['offer_status']

export type SupplierReturnStatus = Enums['supplier_return_status']
export type SupplierReturnResolution = Enums['supplier_return_resolution']
export type RefundPaymentMethod = Enums['refund_payment_method']
export type InventoryRemovalReason = Enums['inventory_removal_reason']
export type InventoryRemovalStatus = Enums['inventory_removal_status']

export type SupplierReturn = Tables['supplier_returns']['Row']
export type SupplierReturnInsert = Tables['supplier_returns']['Insert']

export type InventoryRemoval = Tables['inventory_removals']['Row']
export type InventoryRemovalInsert = Tables['inventory_removals']['Insert']

export type CustomerReview = Tables['customer_reviews']['Row']
export type CustomerReviewInsert = Tables['customer_reviews']['Insert']
export type CustomerReviewUpdate = Tables['customer_reviews']['Update']

// Social Media Posts — manually defined until DB types are regenerated
export type SocialPostStatus = 'draft' | 'queued' | 'processing' | 'scheduled' | 'published' | 'failed'
export type SocialScheduleType = 'now' | 'next_slot' | 'scheduled'

export interface SocialMediaPostItemSpecs {
  brand?: string | null
  model_name?: string | null
  model_number?: string | null
  part_number?: string | null
  year?: number | null
  ram_gb?: number | null
  storage_gb?: number | null
  cpu?: string | null
  gpu?: string | null
  screen_size?: string | null
  color?: string | null
  os_family?: string | null
  other_features?: string | null
  condition_grade?: string | null
  selling_price?: number | null
  condition_notes?: string | null
}

export interface SocialMediaPost {
  id: string
  item_id: string | null
  item_code: string | null
  post_type: string
  platform: string
  caption: string | null
  media_urls: string[]
  account_id: string | null
  page_id: string | null
  schedule_type: SocialScheduleType
  scheduled_at: string | null
  status: SocialPostStatus
  blotato_submission_id: string | null
  blotato_post_url: string | null
  error_message: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  published_at: string | null
  item_specs: SocialMediaPostItemSpecs
}

export interface SocialMediaPostInsert {
  item_id?: string | null
  item_code?: string | null
  post_type?: string
  platform?: string
  caption?: string | null
  media_urls?: string[]
  account_id?: string | null
  page_id?: string | null
  schedule_type?: SocialScheduleType
  scheduled_at?: string | null
  status?: SocialPostStatus
}

export interface SocialMediaPostUpdate {
  caption?: string | null
  media_urls?: string[]
  schedule_type?: SocialScheduleType
  scheduled_at?: string | null
  status?: SocialPostStatus
  blotato_submission_id?: string | null
  blotato_post_url?: string | null
  error_message?: string | null
  published_at?: string | null
}

export interface SocialMediaPostWithItem extends SocialMediaPost {
  items: {
    id: string
    item_code: string
    product_models: {
      brand: string
      model_name: string
    } | null
    condition_grade: string | null
    selling_price: number | null
  } | null
}

// Joined / composite types used across the app
export type ItemWithRelations = Item & {
  suppliers: Supplier | null
  product_models: ProductModel | null
}

export type SupplierWithItemCount = Supplier & {
  item_count: number
}

export type ProductModelWithCounts = ProductModel & {
  media_count: number
}

export type IntakeReceiptWithRelations = IntakeReceipt & {
  suppliers: Supplier | null
  intake_receipt_line_items: IntakeReceiptLineItem[]
}

export type IntakeReceiptDetail = IntakeReceipt & {
  suppliers: Supplier | null
  intake_receipt_line_items: IntakeReceiptLineItem[]
  items: Item[]
  intake_adjustments: IntakeAdjustment[]
}

export type StaffRole = 'ADMIN' | 'VA' | 'IT' | 'LIVE_SELLER'

export interface StaffProfile {
  id: string
  email: string
  display_name: string
  role: StaffRole
  is_active: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type StaffProfileInsert = Omit<StaffProfile, 'created_at' | 'updated_at'>
export type StaffProfileUpdate = Partial<Pick<StaffProfile, 'display_name' | 'role' | 'is_active'>>

// Messaging attachment type
export interface MessageAttachment {
  file_url: string
  filename: string
  mime_type: string
  size_bytes?: number
}

// Messaging types — manually defined until DB types are regenerated
export type MessageRole = 'customer' | 'assistant' | 'staff' | 'system'
export type MessageStatus = 'DRAFT' | 'SENDING' | 'SENT' | 'FAILED' | 'REJECTED'
export type MessageType = 'REPLY' | 'REVIEW_REQUEST' | 'DELIVERY_ALERT'
export type MessageChannel = 'facebook' | 'email' | 'sms'
export type QueueStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED'

export interface Conversation {
  id: string
  customer_id: string | null
  missive_conversation_id: string
  channel: MessageChannel
  contact_name: string | null
  contact_avatar_url: string | null
  folder_id: string | null
  is_archived: boolean
  needs_human_review: boolean
  unmatched_contact: boolean
  assigned_staff_id: string | null
  ai_enabled: boolean
  unread_count: number
  last_message_at: string | null
  created_at: string
  updated_at: string
}

export interface MessageFolder {
  id: string
  name: string
  icon: string
  sort_order: number
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface ConversationWithRelations extends Conversation {
  customers: Pick<Customer, 'id' | 'customer_code' | 'last_name' | 'first_name'> | null
  messages: Message[]
}

export interface Message {
  id: string
  conversation_id: string
  missive_message_id: string | null
  role: MessageRole
  content: string
  status: MessageStatus
  message_type: MessageType
  ai_confidence: number | null
  ai_context_summary: string | null
  attachments: MessageAttachment[]
  error_details: Record<string, unknown> | null
  sent_by: string | null
  created_at: string
}

export interface MessageInsert {
  conversation_id: string
  role: MessageRole
  content: string
  status?: MessageStatus
  message_type?: MessageType
  ai_confidence?: number | null
  ai_context_summary?: string | null
  attachments?: MessageAttachment[]
  sent_by?: string | null
}

export interface MessagingTemplate {
  id: string
  name: string
  description: string | null
  content_ja: string
  content_en: string
  message_type: MessageType
  variables: string[]
  attachments: MessageAttachment[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MessagingTemplateInsert {
  name: string
  description?: string | null
  content_ja: string
  content_en: string
  message_type: MessageType
  variables?: string[]
  attachments?: MessageAttachment[]
  is_active?: boolean
}

export interface AiProvider {
  id: string
  name: string
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter'
  model_id: string
  api_key_encrypted: string
  purpose: string
  is_active: boolean
  created_at: string
}

export interface AiProviderInsert {
  name: string
  provider: 'anthropic' | 'openai' | 'google' | 'openrouter'
  model_id: string
  api_key_encrypted: string
  purpose?: string
  is_active?: boolean
}

export interface MessagingPersona {
  id: string
  name: string
  system_prompt: string
  language_style: string
  use_emojis: boolean
  greeting_template: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MessagingPersonaUpdate {
  name?: string
  system_prompt?: string
  language_style?: string
  use_emojis?: boolean
  greeting_template?: string | null
}

export interface SystemAlert {
  id: string
  alert_type: string
  message: string
  details: Record<string, unknown> | null
  resolved: boolean
  resolved_at: string | null
  created_at: string
}

// Knowledge Base / Guardrails
export type KbEntryType = 'knowledge' | 'guardrail'

export interface KnowledgeBaseEntry {
  id: string
  entry_type: KbEntryType
  title: string
  content: string
  category: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseEntryInsert {
  entry_type?: KbEntryType
  title: string
  content: string
  category?: string
  is_active?: boolean
  sort_order?: number
}

export interface KnowledgeBaseEntryUpdate {
  entry_type?: KbEntryType
  title?: string
  content?: string
  category?: string
  is_active?: boolean
  sort_order?: number
}

// AI Test Playground
export interface TestAIMessage {
  role: 'customer' | 'assistant'
  content: string
}

export interface TestAIResponse {
  reply: string
  confidence: number
  intent: string
  data_used: string[]
  escalation_reason: string | null
}
