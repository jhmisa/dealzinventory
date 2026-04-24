export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accessories: {
        Row: {
          accessory_code: string
          active: boolean
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_live_selling: boolean
          low_stock_threshold: number
          name: string
          selling_price: number
          shop_visible: boolean
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          accessory_code: string
          active?: boolean
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_live_selling?: boolean
          low_stock_threshold?: number
          name: string
          selling_price: number
          shop_visible?: boolean
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          accessory_code?: string
          active?: boolean
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_live_selling?: boolean
          low_stock_threshold?: number
          name?: string
          selling_price?: number
          shop_visible?: boolean
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      accessory_media: {
        Row: {
          accessory_id: string
          created_at: string
          file_url: string
          id: string
          media_type: string
          sort_order: number
        }
        Insert: {
          accessory_id: string
          created_at?: string
          file_url: string
          id?: string
          media_type?: string
          sort_order?: number
        }
        Update: {
          accessory_id?: string
          created_at?: string
          file_url?: string
          id?: string
          media_type?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "accessory_media_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
        ]
      }
      accessory_stock_adjustments: {
        Row: {
          accessory_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          quantity: number
          reason: Database["public"]["Enums"]["accessory_adjustment_reason"]
          supplier_id: string | null
        }
        Insert: {
          accessory_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity: number
          reason: Database["public"]["Enums"]["accessory_adjustment_reason"]
          supplier_id?: string | null
        }
        Update: {
          accessory_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          reason?: Database["public"]["Enums"]["accessory_adjustment_reason"]
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accessory_stock_adjustments_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessory_stock_adjustments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      accessory_stock_entries: {
        Row: {
          accessory_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          quantity: number
          receipt_id: string | null
          received_at: string
          supplier_id: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          accessory_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity: number
          receipt_id?: string | null
          received_at?: string
          supplier_id?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          accessory_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          quantity?: number
          receipt_id?: string | null
          received_at?: string
          supplier_id?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "accessory_stock_entries_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessory_stock_entries_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "intake_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessory_stock_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_configurations: {
        Row: {
          api_endpoint_url: string
          api_key_encrypted: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_test_at: string | null
          purpose: string
          service_name: string
          updated_at: string | null
        }
        Insert: {
          api_endpoint_url: string
          api_key_encrypted: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_test_at?: string | null
          purpose?: string
          service_name: string
          updated_at?: string | null
        }
        Update: {
          api_endpoint_url?: string
          api_key_encrypted?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_test_at?: string | null
          purpose?: string
          service_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          media_type: string
          name: string
          prompt_text: string
          sample_image_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string
          name: string
          prompt_text: string
          sample_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          media_type?: string
          name?: string
          prompt_text?: string
          sample_image_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          api_key_encrypted: string
          created_at: string
          id: string
          is_active: boolean
          model_id: string
          name: string
          provider: string
          purpose: string
        }
        Insert: {
          api_key_encrypted: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_id: string
          name: string
          provider: string
          purpose?: string
        }
        Update: {
          api_key_encrypted?: string
          created_at?: string
          id?: string
          is_active?: boolean
          model_id?: string
          name?: string
          provider?: string
          purpose?: string
        }
        Relationships: []
      }
      automated_message_queue: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          error_details: Json | null
          id: string
          message_type: Database["public"]["Enums"]["message_type"]
          order_id: string | null
          processed_at: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["queue_status"]
          template_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_details?: Json | null
          id?: string
          message_type: Database["public"]["Enums"]["message_type"]
          order_id?: string | null
          processed_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_details?: Json | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          order_id?: string | null
          processed_at?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["queue_status"]
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automated_message_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_message_queue_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_message_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automated_message_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "messaging_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_brands: {
        Row: {
          canonical_name: string
          id: string
          lower_name: string
        }
        Insert: {
          canonical_name: string
          id?: string
          lower_name: string
        }
        Update: {
          canonical_name?: string
          id?: string
          lower_name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description_fields: string[]
          form_fields: string[]
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_fields?: string[]
          form_fields?: string[]
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_fields?: string[]
          form_fields?: string[]
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          ai_enabled: boolean
          assigned_staff_id: string | null
          channel: Database["public"]["Enums"]["message_channel"]
          contact_avatar_url: string | null
          contact_name: string | null
          contact_platform_id: string | null
          created_at: string
          customer_id: string | null
          draft_pending_since: string | null
          folder_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          missive_conversation_id: string
          needs_human_review: boolean
          unmatched_contact: boolean
          unread_count: number
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          assigned_staff_id?: string | null
          channel?: Database["public"]["Enums"]["message_channel"]
          contact_avatar_url?: string | null
          contact_name?: string | null
          contact_platform_id?: string | null
          created_at?: string
          customer_id?: string | null
          draft_pending_since?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          missive_conversation_id: string
          needs_human_review?: boolean
          unmatched_contact?: boolean
          unread_count?: number
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          assigned_staff_id?: string | null
          channel?: Database["public"]["Enums"]["message_channel"]
          contact_avatar_url?: string | null
          contact_name?: string | null
          contact_platform_id?: string | null
          created_at?: string
          customer_id?: string | null
          draft_pending_since?: string | null
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          missive_conversation_id?: string
          needs_human_review?: boolean
          unmatched_contact?: boolean
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "message_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: Json
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string
          receiver_first_name: string | null
          receiver_last_name: string | null
          receiver_phone: string | null
          updated_at: string
        }
        Insert: {
          address: Json
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label: string
          receiver_first_name?: string | null
          receiver_last_name?: string | null
          receiver_phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string
          receiver_first_name?: string | null
          receiver_last_name?: string | null
          receiver_phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reviews: {
        Row: {
          created_at: string
          customer_name: string
          customer_quote: string
          generated_caption: string | null
          id: string
          item_code: string | null
          item_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_quote: string
          generated_caption?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_quote?: string
          generated_caption?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_reviews_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          created_at: string
          customer_code: string
          email: string | null
          fb_name: string | null
          first_name: string | null
          id: string
          id_document_url: string | null
          id_verified: boolean
          id_verified_at: string | null
          is_seller: boolean
          last_name: string
          missive_contact_id: string | null
          phone: string | null
          pin_hash: string
          shipping_address: Json | null
          updated_at: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string
          customer_code: string
          email?: string | null
          fb_name?: string | null
          first_name?: string | null
          id?: string
          id_document_url?: string | null
          id_verified?: boolean
          id_verified_at?: string | null
          is_seller?: boolean
          last_name: string
          missive_contact_id?: string | null
          phone?: string | null
          pin_hash: string
          shipping_address?: Json | null
          updated_at?: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          created_at?: string
          customer_code?: string
          email?: string | null
          fb_name?: string | null
          first_name?: string | null
          id?: string
          id_document_url?: string | null
          id_verified?: boolean
          id_verified_at?: string | null
          is_seller?: boolean
          last_name?: string
          missive_contact_id?: string | null
          phone?: string | null
          pin_hash?: string
          shipping_address?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      intake_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_code: string
          adjustment_type: Database["public"]["Enums"]["intake_adjustment_type"]
          created_at: string | null
          id: string
          item_ids: string[]
          quantity: number
          reason: string
          receipt_id: string
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_code: string
          adjustment_type: Database["public"]["Enums"]["intake_adjustment_type"]
          created_at?: string | null
          id?: string
          item_ids: string[]
          quantity: number
          reason: string
          receipt_id: string
        }
        Update: {
          adjusted_by?: string | null
          adjustment_code?: string
          adjustment_type?: Database["public"]["Enums"]["intake_adjustment_type"]
          created_at?: string | null
          id?: string
          item_ids?: string[]
          quantity?: number
          reason?: string
          receipt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_adjustments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "intake_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_receipt_line_items: {
        Row: {
          ai_confidence: number | null
          created_at: string | null
          id: string
          line_number: number
          line_total: number | null
          notes: string | null
          product_description: string
          product_id: string | null
          quantity: number
          receipt_id: string
          unit_price: number | null
        }
        Insert: {
          ai_confidence?: number | null
          created_at?: string | null
          id?: string
          line_number: number
          line_total?: number | null
          notes?: string | null
          product_description: string
          product_id?: string | null
          quantity: number
          receipt_id: string
          unit_price?: number | null
        }
        Update: {
          ai_confidence?: number | null
          created_at?: string | null
          id?: string
          line_number?: number
          line_total?: number | null
          notes?: string | null
          product_description?: string
          product_id?: string | null
          quantity?: number
          receipt_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_receipt_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_receipt_line_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "intake_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_receipts: {
        Row: {
          created_at: string | null
          created_by: string | null
          date_received: string | null
          id: string
          invoice_file_url: string | null
          notes: string | null
          p_code_range_end: string | null
          p_code_range_start: string | null
          receipt_code: string
          source_type: Database["public"]["Enums"]["source_type"]
          supplier_contact_snapshot: string | null
          supplier_id: string
          total_cost: number | null
          total_items: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date_received?: string | null
          id?: string
          invoice_file_url?: string | null
          notes?: string | null
          p_code_range_end?: string | null
          p_code_range_start?: string | null
          receipt_code: string
          source_type: Database["public"]["Enums"]["source_type"]
          supplier_contact_snapshot?: string | null
          supplier_id: string
          total_cost?: number | null
          total_items: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date_received?: string | null
          id?: string
          invoice_file_url?: string | null
          notes?: string | null
          p_code_range_end?: string | null
          p_code_range_start?: string | null
          receipt_code?: string
          source_type?: Database["public"]["Enums"]["source_type"]
          supplier_contact_snapshot?: string | null
          supplier_id?: string
          total_cost?: number | null
          total_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "intake_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_removals: {
        Row: {
          approved_by: string | null
          created_at: string
          decided_at: string | null
          id: string
          item_id: string
          notes: string | null
          reason: Database["public"]["Enums"]["inventory_removal_reason"]
          reason_text: string | null
          rejection_reason: string | null
          removal_code: string
          removal_status: Database["public"]["Enums"]["inventory_removal_status"]
          requested_at: string
          requested_by: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          reason: Database["public"]["Enums"]["inventory_removal_reason"]
          reason_text?: string | null
          rejection_reason?: string | null
          removal_code: string
          removal_status?: Database["public"]["Enums"]["inventory_removal_status"]
          requested_at?: string
          requested_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["inventory_removal_reason"]
          reason_text?: string | null
          rejection_reason?: string | null
          removal_code?: string
          removal_status?: Database["public"]["Enums"]["inventory_removal_status"]
          requested_at?: string
          requested_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_removals_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshot_items: {
        Row: {
          additional_costs: number
          brand: string | null
          condition_grade: string | null
          created_at: string
          id: string
          item_code: string
          item_status: string
          item_type: string
          model_name: string | null
          purchase_price: number
          snapshot_id: string
          source_type: string | null
          stock_quantity: number | null
          total_cost: number
          unit_cost: number | null
        }
        Insert: {
          additional_costs?: number
          brand?: string | null
          condition_grade?: string | null
          created_at?: string
          id?: string
          item_code: string
          item_status: string
          item_type?: string
          model_name?: string | null
          purchase_price?: number
          snapshot_id: string
          source_type?: string | null
          stock_quantity?: number | null
          total_cost?: number
          unit_cost?: number | null
        }
        Update: {
          additional_costs?: number
          brand?: string | null
          condition_grade?: string | null
          created_at?: string
          id?: string
          item_code?: string
          item_status?: string
          item_type?: string
          model_name?: string | null
          purchase_price?: number
          snapshot_id?: string
          source_type?: string | null
          stock_quantity?: number | null
          total_cost?: number
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshot_items_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "inventory_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          created_at: string
          generated_at: string
          generated_by: string | null
          grand_total: number
          id: string
          period_label: string
          snapshot_date: string
          summary_by_brand: Json
          summary_by_grade: Json
          summary_by_source: Json
          summary_by_status: Json
          total_accessory_skus: number
          total_accessory_units: number
          total_accessory_value: number
          total_additional_costs: number
          total_inventory_value: number
          total_items: number
          total_purchase_cost: number
        }
        Insert: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          grand_total: number
          id?: string
          period_label: string
          snapshot_date: string
          summary_by_brand: Json
          summary_by_grade: Json
          summary_by_source: Json
          summary_by_status: Json
          total_accessory_skus: number
          total_accessory_units: number
          total_accessory_value: number
          total_additional_costs: number
          total_inventory_value: number
          total_items: number
          total_purchase_cost: number
        }
        Update: {
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          grand_total?: number
          id?: string
          period_label?: string
          snapshot_date?: string
          summary_by_brand?: Json
          summary_by_grade?: Json
          summary_by_source?: Json
          summary_by_status?: Json
          total_accessory_skus?: number
          total_accessory_units?: number
          total_accessory_value?: number
          total_additional_costs?: number
          total_inventory_value?: number
          total_items?: number
          total_purchase_cost?: number
        }
        Relationships: []
      }
      item_audit_logs: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          field_name: string
          id: string
          item_id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_name: string
          id?: string
          item_id: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_name?: string
          id?: string
          item_id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_audit_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_costs: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          item_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          item_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_costs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_defects: {
        Row: {
          area: string
          created_at: string
          created_by: string | null
          defect_type: string
          description: string | null
          id: string
          item_id: string
          photo_url: string | null
        }
        Insert: {
          area: string
          created_at?: string
          created_by?: string | null
          defect_type: string
          description?: string | null
          id?: string
          item_id: string
          photo_url?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          created_by?: string | null
          defect_type?: string
          description?: string | null
          id?: string
          item_id?: string
          photo_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_defects_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_list_column_settings: {
        Row: {
          id: string
          status_tab: string
          updated_at: string | null
          visible_columns: string[]
        }
        Insert: {
          id?: string
          status_tab: string
          updated_at?: string | null
          visible_columns: string[]
        }
        Update: {
          id?: string
          status_tab?: string
          updated_at?: string | null
          visible_columns?: string[]
        }
        Relationships: []
      }
      item_media: {
        Row: {
          created_at: string
          description: string | null
          file_url: string
          id: string
          item_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          sort_order: number
          thumbnail_url: string | null
          visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          item_id: string
          media_type?: Database["public"]["Enums"]["media_type"]
          sort_order?: number
          thumbnail_url?: string | null
          visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          item_id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          sort_order?: number
          thumbnail_url?: string | null
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "item_media_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          ac_adapter_status:
            | Database["public"]["Enums"]["ac_adapter_status"]
            | null
          battery_health_pct: number | null
          body_condition: Database["public"]["Enums"]["body_condition"] | null
          brand: string | null
          carrier: string | null
          category_id: string | null
          color: string | null
          condition_grade: Database["public"]["Enums"]["condition_grade"] | null
          condition_notes: string | null
          cpu: string | null
          created_at: string
          device_category: Database["public"]["Enums"]["device_category"] | null
          discount: number | null
          field_sources: Json | null
          form_factor: string | null
          gallery_photo_order: Json | null
          gpu: string | null
          has_touchscreen: boolean | null
          hidden_product_photo_ids: string[]
          id: string
          imei: string | null
          imei2: string | null
          inspected_at: string | null
          inspected_by: string | null
          inspection_checklist: Json | null
          intake_receipt_id: string | null
          is_live_selling: boolean
          is_unlocked: boolean | null
          item_code: string
          item_status: Database["public"]["Enums"]["item_status"]
          kaitori_request_id: string | null
          keyboard_layout: string | null
          missing_notes: string | null
          missing_since: string | null
          model_name: string | null
          model_number: string | null
          os_family: string | null
          other_features: string | null
          part_number: string | null
          product_id: string | null
          purchase_price: number | null
          ram_gb: string | null
          screen_condition:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size: number | null
          selling_price: number | null
          source_type: Database["public"]["Enums"]["source_type"]
          specs_notes: string | null
          storage_gb: string | null
          supplier_description: string | null
          supplier_id: string
          updated_at: string
          year: number | null
        }
        Insert: {
          ac_adapter_status?:
            | Database["public"]["Enums"]["ac_adapter_status"]
            | null
          battery_health_pct?: number | null
          body_condition?: Database["public"]["Enums"]["body_condition"] | null
          brand?: string | null
          carrier?: string | null
          category_id?: string | null
          color?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          condition_notes?: string | null
          cpu?: string | null
          created_at?: string
          device_category?:
            | Database["public"]["Enums"]["device_category"]
            | null
          discount?: number | null
          field_sources?: Json | null
          form_factor?: string | null
          gallery_photo_order?: Json | null
          gpu?: string | null
          has_touchscreen?: boolean | null
          hidden_product_photo_ids?: string[]
          id?: string
          imei?: string | null
          imei2?: string | null
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_checklist?: Json | null
          intake_receipt_id?: string | null
          is_live_selling?: boolean
          is_unlocked?: boolean | null
          item_code: string
          item_status?: Database["public"]["Enums"]["item_status"]
          kaitori_request_id?: string | null
          keyboard_layout?: string | null
          missing_notes?: string | null
          missing_since?: string | null
          model_name?: string | null
          model_number?: string | null
          os_family?: string | null
          other_features?: string | null
          part_number?: string | null
          product_id?: string | null
          purchase_price?: number | null
          ram_gb?: string | null
          screen_condition?:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size?: number | null
          selling_price?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          specs_notes?: string | null
          storage_gb?: string | null
          supplier_description?: string | null
          supplier_id: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          ac_adapter_status?:
            | Database["public"]["Enums"]["ac_adapter_status"]
            | null
          battery_health_pct?: number | null
          body_condition?: Database["public"]["Enums"]["body_condition"] | null
          brand?: string | null
          carrier?: string | null
          category_id?: string | null
          color?: string | null
          condition_grade?:
            | Database["public"]["Enums"]["condition_grade"]
            | null
          condition_notes?: string | null
          cpu?: string | null
          created_at?: string
          device_category?:
            | Database["public"]["Enums"]["device_category"]
            | null
          discount?: number | null
          field_sources?: Json | null
          form_factor?: string | null
          gallery_photo_order?: Json | null
          gpu?: string | null
          has_touchscreen?: boolean | null
          hidden_product_photo_ids?: string[]
          id?: string
          imei?: string | null
          imei2?: string | null
          inspected_at?: string | null
          inspected_by?: string | null
          inspection_checklist?: Json | null
          intake_receipt_id?: string | null
          is_live_selling?: boolean
          is_unlocked?: boolean | null
          item_code?: string
          item_status?: Database["public"]["Enums"]["item_status"]
          kaitori_request_id?: string | null
          keyboard_layout?: string | null
          missing_notes?: string | null
          missing_since?: string | null
          model_name?: string | null
          model_number?: string | null
          os_family?: string | null
          other_features?: string | null
          part_number?: string | null
          product_id?: string | null
          purchase_price?: number | null
          ram_gb?: string | null
          screen_condition?:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size?: number | null
          selling_price?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          specs_notes?: string | null
          storage_gb?: string | null
          supplier_description?: string | null
          supplier_id?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_items_kaitori_request"
            columns: ["kaitori_request_id"]
            isOneToOne: false
            referencedRelation: "kaitori_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_intake_receipt_id_fkey"
            columns: ["intake_receipt_id"]
            isOneToOne: false
            referencedRelation: "intake_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      kaitori_price_list: {
        Row: {
          active: boolean
          battery_condition: Database["public"]["Enums"]["battery_condition"]
          body_condition: Database["public"]["Enums"]["body_condition"]
          created_at: string
          id: string
          product_model_id: string
          purchase_price: number
          screen_condition: Database["public"]["Enums"]["screen_condition"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          battery_condition: Database["public"]["Enums"]["battery_condition"]
          body_condition: Database["public"]["Enums"]["body_condition"]
          created_at?: string
          id?: string
          product_model_id: string
          purchase_price: number
          screen_condition: Database["public"]["Enums"]["screen_condition"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          battery_condition?: Database["public"]["Enums"]["battery_condition"]
          body_condition?: Database["public"]["Enums"]["body_condition"]
          created_at?: string
          id?: string
          product_model_id?: string
          purchase_price?: number
          screen_condition?: Database["public"]["Enums"]["screen_condition"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kaitori_price_list_product_model_id_fkey"
            columns: ["product_model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
        ]
      }
      kaitori_request_media: {
        Row: {
          created_at: string
          file_url: string
          id: string
          kaitori_request_id: string
          media_type: Database["public"]["Enums"]["media_type"]
          role: Database["public"]["Enums"]["kaitori_media_role"]
          sort_order: number
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          kaitori_request_id: string
          media_type?: Database["public"]["Enums"]["media_type"]
          role?: Database["public"]["Enums"]["kaitori_media_role"]
          sort_order?: number
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          kaitori_request_id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          role?: Database["public"]["Enums"]["kaitori_media_role"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "kaitori_request_media_kaitori_request_id_fkey"
            columns: ["kaitori_request_id"]
            isOneToOne: false
            referencedRelation: "kaitori_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      kaitori_requests: {
        Row: {
          auto_quote_price: number
          battery_condition: Database["public"]["Enums"]["battery_condition"]
          body_condition: Database["public"]["Enums"]["body_condition"]
          created_at: string
          customer_id: string
          delivery_method: Database["public"]["Enums"]["kaitori_delivery_method"]
          final_price: number | null
          id: string
          inspected_at: string | null
          inspected_by: string | null
          kaitori_code: string
          paid_at: string | null
          paid_by: string | null
          payment_method:
            | Database["public"]["Enums"]["kaitori_payment_method"]
            | null
          price_revised: boolean
          product_model_id: string
          request_status: Database["public"]["Enums"]["kaitori_status"]
          revision_reason: string | null
          screen_condition: Database["public"]["Enums"]["screen_condition"]
          seller_accepted_revision: boolean | null
          seller_notes: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          auto_quote_price: number
          battery_condition: Database["public"]["Enums"]["battery_condition"]
          body_condition: Database["public"]["Enums"]["body_condition"]
          created_at?: string
          customer_id: string
          delivery_method: Database["public"]["Enums"]["kaitori_delivery_method"]
          final_price?: number | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          kaitori_code: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method?:
            | Database["public"]["Enums"]["kaitori_payment_method"]
            | null
          price_revised?: boolean
          product_model_id: string
          request_status?: Database["public"]["Enums"]["kaitori_status"]
          revision_reason?: string | null
          screen_condition: Database["public"]["Enums"]["screen_condition"]
          seller_accepted_revision?: boolean | null
          seller_notes?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          auto_quote_price?: number
          battery_condition?: Database["public"]["Enums"]["battery_condition"]
          body_condition?: Database["public"]["Enums"]["body_condition"]
          created_at?: string
          customer_id?: string
          delivery_method?: Database["public"]["Enums"]["kaitori_delivery_method"]
          final_price?: number | null
          id?: string
          inspected_at?: string | null
          inspected_by?: string | null
          kaitori_code?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_method?:
            | Database["public"]["Enums"]["kaitori_payment_method"]
            | null
          price_revised?: boolean
          product_model_id?: string
          request_status?: Database["public"]["Enums"]["kaitori_status"]
          revision_reason?: string | null
          screen_condition?: Database["public"]["Enums"]["screen_condition"]
          seller_accepted_revision?: boolean | null
          seller_notes?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kaitori_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kaitori_requests_product_model_id_fkey"
            columns: ["product_model_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          entry_type: Database["public"]["Enums"]["kb_entry_type"]
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          entry_type?: Database["public"]["Enums"]["kb_entry_type"]
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          entry_type?: Database["public"]["Enums"]["kb_entry_type"]
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_folders: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_system: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_confidence: number | null
          ai_context_summary: string | null
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          error_details: Json | null
          id: string
          message_type: Database["public"]["Enums"]["message_type"]
          missive_message_id: string | null
          role: Database["public"]["Enums"]["message_role"]
          sent_by: string | null
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          ai_confidence?: number | null
          ai_context_summary?: string | null
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          error_details?: Json | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          missive_message_id?: string | null
          role: Database["public"]["Enums"]["message_role"]
          sent_by?: string | null
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          ai_confidence?: number | null
          ai_context_summary?: string | null
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          error_details?: Json | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          missive_message_id?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          sent_by?: string | null
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_persona: {
        Row: {
          created_at: string
          greeting_template: string | null
          id: string
          is_active: boolean
          language_style: string
          name: string
          system_prompt: string
          updated_at: string
          use_emojis: boolean
        }
        Insert: {
          created_at?: string
          greeting_template?: string | null
          id?: string
          is_active?: boolean
          language_style?: string
          name?: string
          system_prompt: string
          updated_at?: string
          use_emojis?: boolean
        }
        Update: {
          created_at?: string
          greeting_template?: string | null
          id?: string
          is_active?: boolean
          language_style?: string
          name?: string
          system_prompt?: string
          updated_at?: string
          use_emojis?: boolean
        }
        Relationships: []
      }
      messaging_templates: {
        Row: {
          attachments: Json | null
          content_en: string
          content_ja: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          message_type: Database["public"]["Enums"]["message_type"]
          name: string
          updated_at: string
          variables: string[]
        }
        Insert: {
          attachments?: Json | null
          content_en: string
          content_ja: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_type: Database["public"]["Enums"]["message_type"]
          name: string
          updated_at?: string
          variables?: string[]
        }
        Update: {
          attachments?: Json | null
          content_en?: string
          content_ja?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_type?: Database["public"]["Enums"]["message_type"]
          name?: string
          updated_at?: string
          variables?: string[]
        }
        Relationships: []
      }
      offer_items: {
        Row: {
          accessory_id: string | null
          added_by: string
          created_at: string
          description: string
          id: string
          item_id: string | null
          offer_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          accessory_id?: string | null
          added_by?: string
          created_at?: string
          description: string
          id?: string
          item_id?: string | null
          offer_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          accessory_id?: string | null
          added_by?: string
          created_at?: string
          description?: string
          id?: string
          item_id?: string | null
          offer_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_items_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          claimed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          expires_at: string
          fb_name: string
          id: string
          notes: string | null
          offer_code: string
          offer_status: Database["public"]["Enums"]["offer_status"]
          order_id: string | null
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at: string
          fb_name: string
          id?: string
          notes?: string | null
          offer_code: string
          offer_status?: Database["public"]["Enums"]["offer_status"]
          order_id?: string | null
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          expires_at?: string
          fb_name?: string
          id?: string
          notes?: string | null
          offer_code?: string
          offer_status?: Database["public"]["Enums"]["offer_status"]
          order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_audit_logs: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string
          order_item_id: string | null
          reason: string | null
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id: string
          order_item_id?: string | null
          reason?: string | null
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string
          order_item_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_audit_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_audit_logs_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          accessory_id: string | null
          description: string | null
          discount: number
          id: string
          item_id: string | null
          order_id: string
          packed_at: string | null
          packed_by: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          accessory_id?: string | null
          description?: string | null
          discount?: number
          id?: string
          item_id?: string | null
          order_id: string
          packed_at?: string | null
          packed_by?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          accessory_id?: string | null
          description?: string | null
          discount?: number
          id?: string
          item_id?: string | null
          order_id?: string
          packed_at?: string | null
          packed_by?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancellation_category: string | null
          cancellation_notes: string | null
          created_at: string
          customer_id: string
          delivery_box_count: number
          delivery_date: string | null
          delivery_issue_flag: boolean
          delivery_time_code: string | null
          dempyo_printed_at: string | null
          id: string
          invoice_printed_at: string | null
          notes: string | null
          order_code: string
          order_source: Database["public"]["Enums"]["order_source"]
          order_status: Database["public"]["Enums"]["order_status"]
          packed_by: string | null
          packed_date: string | null
          payment_method: string | null
          payment_method_code: number | null
          quantity: number
          receiver_first_name: string | null
          receiver_last_name: string | null
          receiver_phone: string | null
          review_requested_at: string | null
          sell_group_id: string | null
          shipped_date: string | null
          shipping_address: string
          shipping_cost: number
          total_price: number
          tracking_number: string | null
          updated_at: string
          yamato_last_checked_at: string | null
          yamato_status: string | null
        }
        Insert: {
          cancellation_category?: string | null
          cancellation_notes?: string | null
          created_at?: string
          customer_id: string
          delivery_box_count?: number
          delivery_date?: string | null
          delivery_issue_flag?: boolean
          delivery_time_code?: string | null
          dempyo_printed_at?: string | null
          id?: string
          invoice_printed_at?: string | null
          notes?: string | null
          order_code: string
          order_source: Database["public"]["Enums"]["order_source"]
          order_status?: Database["public"]["Enums"]["order_status"]
          packed_by?: string | null
          packed_date?: string | null
          payment_method?: string | null
          payment_method_code?: number | null
          quantity: number
          receiver_first_name?: string | null
          receiver_last_name?: string | null
          receiver_phone?: string | null
          review_requested_at?: string | null
          sell_group_id?: string | null
          shipped_date?: string | null
          shipping_address: string
          shipping_cost?: number
          total_price: number
          tracking_number?: string | null
          updated_at?: string
          yamato_last_checked_at?: string | null
          yamato_status?: string | null
        }
        Update: {
          cancellation_category?: string | null
          cancellation_notes?: string | null
          created_at?: string
          customer_id?: string
          delivery_box_count?: number
          delivery_date?: string | null
          delivery_issue_flag?: boolean
          delivery_time_code?: string | null
          dempyo_printed_at?: string | null
          id?: string
          invoice_printed_at?: string | null
          notes?: string | null
          order_code?: string
          order_source?: Database["public"]["Enums"]["order_source"]
          order_status?: Database["public"]["Enums"]["order_status"]
          packed_by?: string | null
          packed_date?: string | null
          payment_method?: string | null
          payment_method_code?: number | null
          quantity?: number
          receiver_first_name?: string | null
          receiver_last_name?: string | null
          receiver_phone?: string | null
          review_requested_at?: string | null
          sell_group_id?: string | null
          shipped_date?: string | null
          shipping_address?: string
          shipping_cost?: number
          total_price?: number
          tracking_number?: string | null
          updated_at?: string
          yamato_last_checked_at?: string | null
          yamato_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sell_group_id_fkey"
            columns: ["sell_group_id"]
            isOneToOne: false
            referencedRelation: "sell_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_confirmations: {
        Row: {
          amount: number
          confirmed_by: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          screenshot_url: string
        }
        Insert: {
          amount: number
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          screenshot_url: string
        }
        Update: {
          amount?: number
          confirmed_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          screenshot_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmations_confirmed_by_staff_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_confirmations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      postal_codes: {
        Row: {
          city_en: string
          city_ja: string
          created_at: string | null
          id: string
          postal_code: string
          prefecture_en: string
          prefecture_ja: string
          town_en: string
          town_ja: string
        }
        Insert: {
          city_en: string
          city_ja: string
          created_at?: string | null
          id?: string
          postal_code: string
          prefecture_en: string
          prefecture_ja: string
          town_en?: string
          town_ja?: string
        }
        Update: {
          city_en?: string
          city_ja?: string
          created_at?: string | null
          id?: string
          postal_code?: string
          prefecture_en?: string
          prefecture_ja?: string
          town_en?: string
          town_ja?: string
        }
        Relationships: []
      }
      product_media: {
        Row: {
          created_at: string
          file_url: string
          id: string
          media_type: Database["public"]["Enums"]["media_type"]
          product_id: string
          role: Database["public"]["Enums"]["media_role"]
          sort_order: number
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          product_id: string
          role?: Database["public"]["Enums"]["media_role"]
          sort_order?: number
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          media_type?: Database["public"]["Enums"]["media_type"]
          product_id?: string
          role?: Database["public"]["Enums"]["media_role"]
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
        ]
      }
      product_models: {
        Row: {
          brand: string
          camera: string | null
          carrier: string | null
          category_id: string | null
          chipset: string | null
          color: string
          cpu: string | null
          created_at: string
          device_category: Database["public"]["Enums"]["device_category"]
          form_factor: string | null
          gpu: string | null
          has_bluetooth: boolean
          has_camera: boolean
          has_cellular: boolean | null
          has_thunderbolt: boolean | null
          has_touchscreen: boolean | null
          id: string
          imei_slot_count: number | null
          is_unlocked: boolean | null
          keyboard_layout: string | null
          match_pattern: string | null
          match_priority: number | null
          model_name: string
          model_notes: string | null
          model_number: string | null
          os_family: string | null
          other_features: string | null
          part_number: string | null
          ports: string | null
          ram_gb: string | null
          screen_size: number | null
          short_description: string | null
          status: Database["public"]["Enums"]["product_status"]
          storage_gb: string | null
          supports_stylus: boolean | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          year: number | null
        }
        Insert: {
          brand: string
          camera?: string | null
          carrier?: string | null
          category_id?: string | null
          chipset?: string | null
          color: string
          cpu?: string | null
          created_at?: string
          device_category?: Database["public"]["Enums"]["device_category"]
          form_factor?: string | null
          gpu?: string | null
          has_bluetooth?: boolean
          has_camera?: boolean
          has_cellular?: boolean | null
          has_thunderbolt?: boolean | null
          has_touchscreen?: boolean | null
          id?: string
          imei_slot_count?: number | null
          is_unlocked?: boolean | null
          keyboard_layout?: string | null
          match_pattern?: string | null
          match_priority?: number | null
          model_name: string
          model_notes?: string | null
          model_number?: string | null
          os_family?: string | null
          other_features?: string | null
          part_number?: string | null
          ports?: string | null
          ram_gb?: string | null
          screen_size?: number | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          storage_gb?: string | null
          supports_stylus?: boolean | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          year?: number | null
        }
        Update: {
          brand?: string
          camera?: string | null
          carrier?: string | null
          category_id?: string | null
          chipset?: string | null
          color?: string
          cpu?: string | null
          created_at?: string
          device_category?: Database["public"]["Enums"]["device_category"]
          form_factor?: string | null
          gpu?: string | null
          has_bluetooth?: boolean
          has_camera?: boolean
          has_cellular?: boolean | null
          has_thunderbolt?: boolean | null
          has_touchscreen?: boolean | null
          id?: string
          imei_slot_count?: number | null
          is_unlocked?: boolean | null
          keyboard_layout?: string | null
          match_pattern?: string | null
          match_priority?: number | null
          model_name?: string
          model_notes?: string | null
          model_number?: string | null
          os_family?: string | null
          other_features?: string | null
          part_number?: string | null
          ports?: string | null
          ram_gb?: string | null
          screen_size?: number | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          storage_gb?: string | null
          supports_stylus?: boolean | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_models_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      return_request_items: {
        Row: {
          id: string
          item_id: string | null
          order_item_id: string
          reason_note: string | null
          return_request_id: string
        }
        Insert: {
          id?: string
          item_id?: string | null
          order_item_id: string
          reason_note?: string | null
          return_request_id: string
        }
        Update: {
          id?: string
          item_id?: string | null
          order_item_id?: string
          reason_note?: string | null
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_request_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_request_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_request_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_request_media: {
        Row: {
          file_url: string
          id: string
          media_type: string
          return_request_id: string
          sort_order: number
          uploaded_at: string
        }
        Insert: {
          file_url: string
          id?: string
          media_type: string
          return_request_id: string
          sort_order?: number
          uploaded_at?: string
        }
        Update: {
          file_url?: string
          id?: string
          media_type?: string
          return_request_id?: string
          sort_order?: number
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_request_media_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          approved_at: string | null
          created_at: string
          customer_description: string
          customer_id: string
          id: string
          order_id: string
          reason_category: string
          received_at: string | null
          refund_amount: number | null
          resolution: string | null
          resolution_notes: string | null
          resolved_at: string | null
          return_code: string
          return_status: string
          staff_notes: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          customer_description: string
          customer_id: string
          id?: string
          order_id: string
          reason_category: string
          received_at?: string | null
          refund_amount?: number | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          return_code: string
          return_status?: string
          staff_notes?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          customer_description?: string
          customer_id?: string
          id?: string
          order_id?: string
          reason_category?: string
          received_at?: string | null
          refund_amount?: number | null
          resolution?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          return_code?: string
          return_status?: string
          staff_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_group_items: {
        Row: {
          assigned_at: string
          id: string
          item_id: string
          sell_group_id: string
        }
        Insert: {
          assigned_at?: string
          id?: string
          item_id: string
          sell_group_id: string
        }
        Update: {
          assigned_at?: string
          id?: string
          item_id?: string
          sell_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_group_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sell_group_items_sell_group_id_fkey"
            columns: ["sell_group_id"]
            isOneToOne: false
            referencedRelation: "sell_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      sell_groups: {
        Row: {
          active: boolean
          base_price: number
          condition_grade: Database["public"]["Enums"]["condition_grade"]
          created_at: string
          id: string
          is_live_selling: boolean
          product_id: string
          sell_group_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_price: number
          condition_grade: Database["public"]["Enums"]["condition_grade"]
          created_at?: string
          id?: string
          is_live_selling?: boolean
          product_id: string
          sell_group_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_price?: number
          condition_grade?: Database["public"]["Enums"]["condition_grade"]
          created_at?: string
          id?: string
          is_live_selling?: boolean
          product_id?: string
          sell_group_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sell_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_models"
            referencedColumns: ["id"]
          },
        ]
      }
      social_media_posts: {
        Row: {
          account_id: string | null
          blotato_post_url: string | null
          blotato_submission_id: string | null
          caption: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          item_code: string | null
          item_id: string | null
          item_specs: Json | null
          media_urls: string[]
          page_id: string | null
          platform: string
          post_type: string
          published_at: string | null
          schedule_type: Database["public"]["Enums"]["social_schedule_type"]
          scheduled_at: string | null
          status: Database["public"]["Enums"]["social_post_status"]
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          blotato_post_url?: string | null
          blotato_submission_id?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_specs?: Json | null
          media_urls?: string[]
          page_id?: string | null
          platform?: string
          post_type?: string
          published_at?: string | null
          schedule_type?: Database["public"]["Enums"]["social_schedule_type"]
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          blotato_post_url?: string | null
          blotato_submission_id?: string | null
          caption?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          item_code?: string | null
          item_id?: string | null
          item_specs?: Json | null
          media_urls?: string[]
          page_id?: string | null
          platform?: string
          post_type?: string
          published_at?: string | null
          schedule_type?: Database["public"]["Enums"]["social_schedule_type"]
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_posts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["staff_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["staff_role"]
          updated_at?: string
        }
        Relationships: []
      }
      supplier_returns: {
        Row: {
          created_at: string
          id: string
          intake_receipt_id: string | null
          item_id: string
          reason: string
          receipt_file_url: string | null
          refund_amount: number | null
          refund_payment_method:
            | Database["public"]["Enums"]["refund_payment_method"]
            | null
          refund_received: boolean | null
          refund_received_at: string | null
          requested_at: string
          requested_by: string | null
          resolution:
            | Database["public"]["Enums"]["supplier_return_resolution"]
            | null
          resolved_at: string | null
          return_code: string
          return_status: Database["public"]["Enums"]["supplier_return_status"]
          returned_at: string | null
          staff_notes: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          intake_receipt_id?: string | null
          item_id: string
          reason: string
          receipt_file_url?: string | null
          refund_amount?: number | null
          refund_payment_method?:
            | Database["public"]["Enums"]["refund_payment_method"]
            | null
          refund_received?: boolean | null
          refund_received_at?: string | null
          requested_at?: string
          requested_by?: string | null
          resolution?:
            | Database["public"]["Enums"]["supplier_return_resolution"]
            | null
          resolved_at?: string | null
          return_code: string
          return_status?: Database["public"]["Enums"]["supplier_return_status"]
          returned_at?: string | null
          staff_notes?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          intake_receipt_id?: string | null
          item_id?: string
          reason?: string
          receipt_file_url?: string | null
          refund_amount?: number | null
          refund_payment_method?:
            | Database["public"]["Enums"]["refund_payment_method"]
            | null
          refund_received?: boolean | null
          refund_received_at?: string | null
          requested_at?: string
          requested_by?: string | null
          resolution?:
            | Database["public"]["Enums"]["supplier_return_resolution"]
            | null
          resolved_at?: string | null
          return_code?: string
          return_status?: Database["public"]["Enums"]["supplier_return_status"]
          returned_at?: string | null
          staff_notes?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_intake_receipt_id_fkey"
            columns: ["intake_receipt_id"]
            isOneToOne: false
            referencedRelation: "intake_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_info: string | null
          created_at: string
          id: string
          notes: string | null
          supplier_name: string
          supplier_type: Database["public"]["Enums"]["supplier_type"]
          updated_at: string
        }
        Insert: {
          contact_info?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          supplier_name: string
          supplier_type: Database["public"]["Enums"]["supplier_type"]
          updated_at?: string
        }
        Update: {
          contact_info?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          supplier_name?: string
          supplier_type?: Database["public"]["Enums"]["supplier_type"]
          updated_at?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          message: string
          resolved: boolean
          resolved_at: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          message: string
          resolved?: boolean
          resolved_at?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          message?: string
          resolved?: boolean
          resolved_at?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _hash_pin: { Args: { pin_text: string }; Returns: string }
      _verify_pin: {
        Args: { pin_hash: string; pin_text: string }
        Returns: boolean
      }
      check_yamato_tracking: { Args: never; Returns: undefined }
      create_accessory_intake_batch: {
        Args: {
          p_date_received: string
          p_invoice_file_url: string
          p_line_items: Json
          p_notes: string
          p_supplier_contact_snapshot: string
          p_supplier_id: string
        }
        Returns: Json
      }
      create_intake_batch: {
        Args: {
          p_date_received: string
          p_invoice_file_url?: string
          p_line_items: Json
          p_notes?: string
          p_source_type: Database["public"]["Enums"]["source_type"]
          p_supplier_contact_snapshot?: string
          p_supplier_id: string
        }
        Returns: Json
      }
      debug_check_product_numeric_fields: {
        Args: { p_product_id: string }
        Returns: {
          field_name: string
          field_type: string
          raw_value: string
        }[]
      }
      debug_list_triggers: {
        Args: never
        Returns: {
          event: string
          function_name: string
          timing: string
          trigger_name: string
        }[]
      }
      decrement_accessory_stock: {
        Args: { p_accessory_id: string; p_quantity: number }
        Returns: number
      }
      expire_pending_offers: { Args: never; Returns: undefined }
      fail_stale_sending_messages: { Args: never; Returns: number }
      generate_code: {
        Args: { prefix: string; seq_name: string }
        Returns: string
      }
      generate_inventory_snapshot: {
        Args: { p_date?: string }
        Returns: string
      }
      generate_pending_drafts: { Args: never; Returns: undefined }
      get_available_brands: {
        Args: never
        Returns: {
          brand: string
        }[]
      }
      get_awaiting_reply_counts: {
        Args: never
        Returns: {
          count: number
          folder_id: string
        }[]
      }
      increment_accessory_stock: {
        Args: { p_accessory_id: string; p_quantity: number }
        Returns: number
      }
      match_product_model: { Args: { p_description: string }; Returns: string }
      normalize_brand: { Args: { input: string }; Returns: string }
      parse_specs_from_description: {
        Args: { p_description: string }
        Returns: Json
      }
      process_message_queue: { Args: never; Returns: undefined }
      queue_review_requests: { Args: never; Returns: undefined }
      search_available_inventory: {
        Args: {
          filter_brand?: string
          filter_category_id?: string
          price_max?: number
          price_min?: number
          result_limit?: number
          search_query: string
        }
        Returns: {
          brand: string
          color: string
          condition_grade: string
          condition_notes: string
          cpu: string
          first_item_display_url: string
          first_item_thumb_url: string
          first_product_media_url: string
          gpu: string
          hero_media_url: string
          id: string
          item_code: string
          model_name: string
          model_number: string
          os_family: string
          product_id: string
          ram_gb: string
          screen_size: number
          selling_price: number
          storage_gb: string
          year: number
        }[]
      }
      search_customers_with_receivers: {
        Args: { query: string }
        Returns: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          created_at: string
          customer_code: string
          email: string | null
          fb_name: string | null
          first_name: string | null
          id: string
          id_document_url: string | null
          id_verified: boolean
          id_verified_at: string | null
          is_seller: boolean
          last_name: string
          missive_contact_id: string | null
          phone: string | null
          pin_hash: string
          shipping_address: Json | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      trigger_message_sync: { Args: never; Returns: undefined }
    }
    Enums: {
      ac_adapter_status: "CORRECT" | "INCORRECT" | "MISSING"
      accessory_adjustment_reason:
        | "DEFECTIVE"
        | "RETURNED_TO_SUPPLIER"
        | "DAMAGED"
        | "WRITE_OFF"
        | "CORRECTION"
      battery_condition: "GOOD" | "FAIR" | "POOR"
      body_condition: "GOOD" | "FAIR" | "POOR" | "DAMAGED"
      condition_grade: "S" | "A" | "B" | "C" | "D" | "J"
      device_category: "IPHONE" | "ANDROID" | "COMPUTER" | "TABLET" | "OTHER"
      intake_adjustment_type: "VOIDED" | "RETURNED" | "REFUNDED" | "MISSING"
      inventory_removal_reason:
        | "MISSING"
        | "OFFICE_USE"
        | "DAMAGED"
        | "GIFTED"
        | "OTHER"
      inventory_removal_status: "PENDING" | "APPROVED" | "REJECTED"
      item_status:
        | "INTAKE"
        | "AVAILABLE"
        | "REPAIR"
        | "MISSING"
        | "RESERVED"
        | "SOLD"
        | "SUPPLIER_RETURN"
        | "REMOVED"
      kaitori_delivery_method: "SHIP" | "WALK_IN"
      kaitori_media_role:
        | "front"
        | "back"
        | "screen"
        | "battery_info"
        | "damage"
        | "other"
      kaitori_payment_method: "CASH" | "BANK_TRANSFER"
      kaitori_status:
        | "QUOTED"
        | "ACCEPTED"
        | "SHIPPED"
        | "RECEIVED"
        | "INSPECTING"
        | "PRICE_REVISED"
        | "APPROVED"
        | "PAID"
        | "REJECTED"
        | "CANCELLED"
      kb_entry_type: "knowledge" | "guardrail"
      media_role: "hero" | "gallery" | "video"
      media_type: "image" | "video"
      message_channel: "facebook" | "email" | "sms"
      message_role: "customer" | "assistant" | "staff" | "system"
      message_status: "DRAFT" | "SENDING" | "SENT" | "FAILED" | "REJECTED"
      message_type: "REPLY" | "REVIEW_REQUEST" | "DELIVERY_ALERT"
      offer_status: "PENDING" | "CLAIMED" | "EXPIRED" | "CANCELLED"
      order_source: "SHOP" | "LIVE_SELLING" | "WALK_IN" | "FB" | "YOUTUBE"
      order_status:
        | "PENDING"
        | "CONFIRMED"
        | "PACKED"
        | "SHIPPED"
        | "DELIVERED"
        | "CANCELLED"
      product_status: "DRAFT" | "ACTIVE"
      queue_status: "PENDING" | "PROCESSING" | "SENT" | "FAILED"
      refund_payment_method: "BANK_TRANSFER" | "CASH"
      screen_condition: "GOOD" | "FAIR" | "POOR" | "CRACKED"
      social_post_status:
        | "draft"
        | "queued"
        | "processing"
        | "scheduled"
        | "published"
        | "failed"
      social_schedule_type: "now" | "next_slot" | "scheduled"
      source_type: "AUCTION" | "WHOLESALE" | "KAITORI"
      staff_role: "ADMIN" | "VA" | "IT" | "LIVE_SELLER"
      supplier_return_resolution: "EXCHANGE" | "REFUND"
      supplier_return_status: "REQUESTED" | "RETURNED" | "RESOLVED"
      supplier_type:
        | "auction"
        | "wholesaler"
        | "individual_kaitori"
        | "accessory"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ac_adapter_status: ["CORRECT", "INCORRECT", "MISSING"],
      accessory_adjustment_reason: [
        "DEFECTIVE",
        "RETURNED_TO_SUPPLIER",
        "DAMAGED",
        "WRITE_OFF",
        "CORRECTION",
      ],
      battery_condition: ["GOOD", "FAIR", "POOR"],
      body_condition: ["GOOD", "FAIR", "POOR", "DAMAGED"],
      condition_grade: ["S", "A", "B", "C", "D", "J"],
      device_category: ["IPHONE", "ANDROID", "COMPUTER", "TABLET", "OTHER"],
      intake_adjustment_type: ["VOIDED", "RETURNED", "REFUNDED", "MISSING"],
      inventory_removal_reason: [
        "MISSING",
        "OFFICE_USE",
        "DAMAGED",
        "GIFTED",
        "OTHER",
      ],
      inventory_removal_status: ["PENDING", "APPROVED", "REJECTED"],
      item_status: [
        "INTAKE",
        "AVAILABLE",
        "REPAIR",
        "MISSING",
        "RESERVED",
        "SOLD",
        "SUPPLIER_RETURN",
        "REMOVED",
      ],
      kaitori_delivery_method: ["SHIP", "WALK_IN"],
      kaitori_media_role: [
        "front",
        "back",
        "screen",
        "battery_info",
        "damage",
        "other",
      ],
      kaitori_payment_method: ["CASH", "BANK_TRANSFER"],
      kaitori_status: [
        "QUOTED",
        "ACCEPTED",
        "SHIPPED",
        "RECEIVED",
        "INSPECTING",
        "PRICE_REVISED",
        "APPROVED",
        "PAID",
        "REJECTED",
        "CANCELLED",
      ],
      kb_entry_type: ["knowledge", "guardrail"],
      media_role: ["hero", "gallery", "video"],
      media_type: ["image", "video"],
      message_channel: ["facebook", "email", "sms"],
      message_role: ["customer", "assistant", "staff", "system"],
      message_status: ["DRAFT", "SENDING", "SENT", "FAILED", "REJECTED"],
      message_type: ["REPLY", "REVIEW_REQUEST", "DELIVERY_ALERT"],
      offer_status: ["PENDING", "CLAIMED", "EXPIRED", "CANCELLED"],
      order_source: ["SHOP", "LIVE_SELLING", "WALK_IN", "FB", "YOUTUBE"],
      order_status: [
        "PENDING",
        "CONFIRMED",
        "PACKED",
        "SHIPPED",
        "DELIVERED",
        "CANCELLED",
      ],
      product_status: ["DRAFT", "ACTIVE"],
      queue_status: ["PENDING", "PROCESSING", "SENT", "FAILED"],
      refund_payment_method: ["BANK_TRANSFER", "CASH"],
      screen_condition: ["GOOD", "FAIR", "POOR", "CRACKED"],
      social_post_status: [
        "draft",
        "queued",
        "processing",
        "scheduled",
        "published",
        "failed",
      ],
      social_schedule_type: ["now", "next_slot", "scheduled"],
      source_type: ["AUCTION", "WHOLESALE", "KAITORI"],
      staff_role: ["ADMIN", "VA", "IT", "LIVE_SELLER"],
      supplier_return_resolution: ["EXCHANGE", "REFUND"],
      supplier_return_status: ["REQUESTED", "RETURNED", "RESOLVED"],
      supplier_type: [
        "auction",
        "wholesaler",
        "individual_kaitori",
        "accessory",
      ],
    },
  },
} as const
