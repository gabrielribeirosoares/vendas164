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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      customer_store_link: {
        Row: {
          created_at: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_store_link_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          delivery_status: string
          down_payment: number
          id: string
          installment_count: number | null
          payment_status: string
          pix_key: string | null
          product_id: string
          remaining_balance: number | null
          reservation_expires_at: string | null
          store_id: string
          total_price: number
          tracking_code: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delivery_status?: string
          down_payment?: number
          id?: string
          installment_count?: number | null
          payment_status?: string
          pix_key?: string | null
          product_id: string
          remaining_balance?: number | null
          reservation_expires_at?: string | null
          store_id: string
          total_price?: number
          tracking_code?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delivery_status?: string
          down_payment?: number
          id?: string
          installment_count?: number | null
          payment_status?: string
          pix_key?: string | null
          product_id?: string
          remaining_balance?: number | null
          reservation_expires_at?: string | null
          store_id?: string
          total_price?: number
          tracking_code?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_installments: {
        Row: {
          id: string
          order_id: string
          installment_number: number
          amount: number
          due_date: string
          status: string
          paid_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          installment_number: number
          amount: number
          due_date: string
          status?: string
          paid_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          installment_number?: number
          amount?: number
          due_date?: string
          status?: string
          paid_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_installments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          brand: string
          created_at: string
          id: string
          image_url: string | null
          is_open: boolean
          model: string
          payment_deadline_hours: number
          payment_deadline_date?: string | null
          price: number
          max_installments?: number | null
          price_2x?: number | null
          installment_price?: number | null
          has_installment_surcharge?: boolean | null
          release_date: string | null
          scale: string
          stock: number
          initial_stock?: number | null
          bulk_discount_threshold?: number | null
          bulk_discount_price?: number | null
          bulk_has_installment_surcharge?: boolean | null
          bulk_installment_price?: number | null
          store_id: string
          slug: string | null
        }
        Insert: {
          brand: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_open?: boolean
          model: string
          payment_deadline_hours?: number
          payment_deadline_date?: string | null
          price?: number
          max_installments?: number | null
          price_2x?: number | null
          installment_price?: number | null
          has_installment_surcharge?: boolean | null
          release_date?: string | null
          scale?: string
          stock?: number
          initial_stock?: number | null
          bulk_discount_threshold?: number | null
          bulk_discount_price?: number | null
          bulk_has_installment_surcharge?: boolean | null
          bulk_installment_price?: number | null
          store_id: string
          slug?: string | null
        }
        Update: {
          brand?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_open?: boolean
          model?: string
          payment_deadline_hours?: number
          payment_deadline_date?: string | null
          price?: number
          max_installments?: number | null
          price_2x?: number | null
          installment_price?: number | null
          has_installment_surcharge?: boolean | null
          release_date?: string | null
          scale?: string
          stock?: number
          initial_stock?: number | null
          bulk_discount_threshold?: number | null
          bulk_discount_price?: number | null
          bulk_has_installment_surcharge?: boolean | null
          bulk_installment_price?: number | null
          store_id?: string
          slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      stores: {
        Row: {
          contact_email: string | null
          contact_instagram: string | null
          created_at: string
          default_installment_due_day?: number | null
          description: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          pix_key: string | null
          primary_color: string
          slug: string
          status?: string | null
          rejection_reason?: string | null
          whatsapp_number: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_instagram?: string | null
          created_at?: string
          default_installment_due_day?: number | null
          description?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          pix_key?: string | null
          primary_color?: string
          slug: string
          status?: string | null
          rejection_reason?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_instagram?: string | null
          created_at?: string
          default_installment_due_day?: number | null
          description?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          pix_key?: string | null
          primary_color?: string
          slug?: string
          status?: string | null
          rejection_reason?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          store_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          store_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_manual_reservations: {
        Args: { _request_id: string; _product_id: string; _quantity: number; _order: Json };
        Returns: string[];
      }
      catalog_page: {
        Args: { _store_id: string; _search?: string; _brand?: string; _scale?: string; _type?: string; _in_stock?: boolean; _sort?: string; _page?: number; _page_size?: number };
        Returns: Json;
      }
      checkout_cart: {
        Args: { _request_id: string; _items: { product_id: string; quantity: number; installments: number; expected_total: number; expected_signal: number }[] };
        Returns: string[];
      }
      create_reservation: { Args: { _product_id: string }; Returns: string }
      expire_stale_orders: { Args: never; Returns: number }
      is_store_owner: { Args: { _store_id: string }; Returns: boolean }
      migrate_reservations_by_phone: { Args: { p_new_user_id: string; p_phone: string }; Returns: void }
      reservar_miniatura: {
        Args: { p_produto_id: string; p_quantidade: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
