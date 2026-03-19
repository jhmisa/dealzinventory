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
      customer_addresses: {
        Row: {
          address: Json
          care_of: string | null
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string
          updated_at: string
        }
        Insert: {
          address: Json
          care_of?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          address?: Json
          care_of?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string
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
      customers: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          created_at: string
          customer_code: string
          email: string | null
          first_name: string | null
          id: string
          id_document_url: string | null
          id_verified: boolean
          id_verified_at: string | null
          is_seller: boolean
          last_name: string
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
          first_name?: string | null
          id?: string
          id_document_url?: string | null
          id_verified?: boolean
          id_verified_at?: string | null
          is_seller?: boolean
          last_name: string
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
          first_name?: string | null
          id?: string
          id_document_url?: string | null
          id_verified?: boolean
          id_verified_at?: string | null
          is_seller?: boolean
          last_name?: string
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
      item_media: {
        Row: {
          created_at: string
          description: string | null
          file_url: string
          id: string
          item_id: string
          sort_order: number
          visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          item_id: string
          sort_order?: number
          visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          item_id?: string
          sort_order?: number
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
          is_unlocked: boolean | null
          item_code: string
          item_status: Database["public"]["Enums"]["item_status"]
          kaitori_request_id: string | null
          keyboard_layout: string | null
          model_name: string | null
          os_family: string | null
          other_features: string | null
          product_id: string | null
          purchase_price: number | null
          ram_gb: number | null
          screen_condition:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size: number | null
          selling_price: number | null
          source_type: Database["public"]["Enums"]["source_type"]
          specs_notes: string | null
          storage_gb: number | null
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
          is_unlocked?: boolean | null
          item_code: string
          item_status?: Database["public"]["Enums"]["item_status"]
          kaitori_request_id?: string | null
          keyboard_layout?: string | null
          model_name?: string | null
          os_family?: string | null
          other_features?: string | null
          product_id?: string | null
          purchase_price?: number | null
          ram_gb?: number | null
          screen_condition?:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size?: number | null
          selling_price?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          specs_notes?: string | null
          storage_gb?: number | null
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
          is_unlocked?: boolean | null
          item_code?: string
          item_status?: Database["public"]["Enums"]["item_status"]
          kaitori_request_id?: string | null
          keyboard_layout?: string | null
          model_name?: string | null
          os_family?: string | null
          other_features?: string | null
          product_id?: string | null
          purchase_price?: number | null
          ram_gb?: number | null
          screen_condition?:
            | Database["public"]["Enums"]["screen_condition"]
            | null
          screen_size?: number | null
          selling_price?: number | null
          source_type?: Database["public"]["Enums"]["source_type"]
          specs_notes?: string | null
          storage_gb?: number | null
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
          created_at: string
          customer_id: string
          delivery_date: string | null
          delivery_time_code: string | null
          id: string
          notes: string | null
          order_code: string
          order_source: Database["public"]["Enums"]["order_source"]
          order_status: Database["public"]["Enums"]["order_status"]
          quantity: number
          sell_group_id: string | null
          shipped_date: string | null
          shipping_address: string
          shipping_cost: number
          total_price: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_date?: string | null
          delivery_time_code?: string | null
          id?: string
          notes?: string | null
          order_code: string
          order_source: Database["public"]["Enums"]["order_source"]
          order_status?: Database["public"]["Enums"]["order_status"]
          quantity: number
          sell_group_id?: string | null
          shipped_date?: string | null
          shipping_address: string
          shipping_cost?: number
          total_price: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_date?: string | null
          delivery_time_code?: string | null
          id?: string
          notes?: string | null
          order_code?: string
          order_source?: Database["public"]["Enums"]["order_source"]
          order_status?: Database["public"]["Enums"]["order_status"]
          quantity?: number
          sell_group_id?: string | null
          shipped_date?: string | null
          shipping_address?: string
          shipping_cost?: number
          total_price?: number
          tracking_number?: string | null
          updated_at?: string
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
          carrier: string | null
          category_id: string | null
          chipset: string | null
          color: string
          cpu: string | null
          created_at: string
          device_category: Database["public"]["Enums"]["device_category"]
          gpu: string | null
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
          os_family: string | null
          other_features: string | null
          ports: string | null
          ram_gb: number | null
          screen_size: number | null
          short_description: string | null
          status: Database["public"]["Enums"]["product_status"]
          storage_gb: number | null
          supports_stylus: boolean | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          year: number | null
        }
        Insert: {
          brand: string
          carrier?: string | null
          category_id?: string | null
          chipset?: string | null
          color: string
          cpu?: string | null
          created_at?: string
          device_category?: Database["public"]["Enums"]["device_category"]
          gpu?: string | null
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
          os_family?: string | null
          other_features?: string | null
          ports?: string | null
          ram_gb?: number | null
          screen_size?: number | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          storage_gb?: number | null
          supports_stylus?: boolean | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          year?: number | null
        }
        Update: {
          brand?: string
          carrier?: string | null
          category_id?: string | null
          chipset?: string | null
          color?: string
          cpu?: string | null
          created_at?: string
          device_category?: Database["public"]["Enums"]["device_category"]
          gpu?: string | null
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
          os_family?: string | null
          other_features?: string | null
          ports?: string | null
          ram_gb?: number | null
          screen_size?: number | null
          short_description?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          storage_gb?: number | null
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
      generate_code: {
        Args: { prefix: string; seq_name: string }
        Returns: string
      }
      match_product_model: { Args: { p_description: string }; Returns: string }
      parse_specs_from_description: {
        Args: { p_description: string }
        Returns: Json
      }
    }
    Enums: {
      ac_adapter_status: "CORRECT" | "INCORRECT" | "MISSING"
      battery_condition: "GOOD" | "FAIR" | "POOR"
      body_condition: "GOOD" | "FAIR" | "POOR" | "DAMAGED"
      condition_grade: "S" | "A" | "B" | "C" | "D" | "J"
      device_category: "IPHONE" | "ANDROID" | "COMPUTER" | "TABLET" | "OTHER"
      intake_adjustment_type: "VOIDED" | "RETURNED" | "REFUNDED" | "MISSING"
      item_status:
        | "INTAKE"
        | "AVAILABLE"
        | "REPAIR"
        | "MISSING"
        | "RESERVED"
        | "SOLD"
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
      media_role: "hero" | "gallery" | "video"
      media_type: "image" | "video"
      order_source: "SHOP" | "LIVE_SELLING" | "WALK_IN" | "FB" | "YOUTUBE"
      order_status:
        | "PENDING"
        | "CONFIRMED"
        | "PACKED"
        | "SHIPPED"
        | "DELIVERED"
        | "CANCELLED"
      product_status: "DRAFT" | "ACTIVE"
      screen_condition: "GOOD" | "FAIR" | "POOR" | "CRACKED"
      source_type: "AUCTION" | "WHOLESALE" | "KAITORI"
      supplier_type: "auction" | "wholesaler" | "individual_kaitori"
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
      battery_condition: ["GOOD", "FAIR", "POOR"],
      body_condition: ["GOOD", "FAIR", "POOR", "DAMAGED"],
      condition_grade: ["S", "A", "B", "C", "D", "J"],
      device_category: ["IPHONE", "ANDROID", "COMPUTER", "TABLET", "OTHER"],
      intake_adjustment_type: ["VOIDED", "RETURNED", "REFUNDED", "MISSING"],
      item_status: [
        "INTAKE",
        "AVAILABLE",
        "REPAIR",
        "MISSING",
        "RESERVED",
        "SOLD",
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
      media_role: ["hero", "gallery", "video"],
      media_type: ["image", "video"],
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
      screen_condition: ["GOOD", "FAIR", "POOR", "CRACKED"],
      source_type: ["AUCTION", "WHOLESALE", "KAITORI"],
      supplier_type: ["auction", "wholesaler", "individual_kaitori"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.78.1 (currently installed v2.75.0)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
