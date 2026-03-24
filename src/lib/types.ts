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


export interface ParsedSpecs {
  brand?: string
  model_name?: string
  cpu?: string
  ram_gb?: number
  storage_gb?: number
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
