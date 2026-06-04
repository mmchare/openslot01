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
      applications: {
        Row: {
          apk_file_path: string | null
          apk_size_bytes: number | null
          apk_version: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_fcfa: number
          product_type: Database["public"]["Enums"]["product_type"]
          sort_order: number
          subscription_duration_days: number
        }
        Insert: {
          apk_file_path?: string | null
          apk_size_bytes?: number | null
          apk_version?: string | null
          category: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_fcfa: number
          product_type?: Database["public"]["Enums"]["product_type"]
          sort_order?: number
          subscription_duration_days?: number
        }
        Update: {
          apk_file_path?: string | null
          apk_size_bytes?: number | null
          apk_version?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_fcfa?: number
          product_type?: Database["public"]["Enums"]["product_type"]
          sort_order?: number
          subscription_duration_days?: number
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid: number
          application_id: string
          client_email: string
          client_name: string
          client_whatsapp: string
          created_at: string
          id: string
          notchpay_reference: string | null
          slot_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subscription_end_at: string | null
          subscription_start_at: string | null
          updated_at: string
        }
        Insert: {
          amount_paid: number
          application_id: string
          client_email: string
          client_name: string
          client_whatsapp: string
          created_at?: string
          id?: string
          notchpay_reference?: string | null
          slot_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subscription_end_at?: string | null
          subscription_start_at?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          application_id?: string
          client_email?: string
          client_name?: string
          client_whatsapp?: string
          created_at?: string
          id?: string
          notchpay_reference?: string | null
          slot_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subscription_end_at?: string | null
          subscription_start_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          level: string
          message: string | null
          metadata: Json | null
          notchpay_reference: string | null
          order_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          level?: string
          message?: string | null
          metadata?: Json | null
          notchpay_reference?: string | null
          order_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          level?: string
          message?: string | null
          metadata?: Json | null
          notchpay_reference?: string | null
          order_id?: string | null
        }
        Relationships: []
      }
      slots_stock: {
        Row: {
          account_email: string
          account_password: string
          application_id: string
          created_at: string
          id: string
          profile_name: string | null
          profile_password: string | null
          slot_number: number
          status: Database["public"]["Enums"]["slot_status"]
          updated_at: string
        }
        Insert: {
          account_email: string
          account_password: string
          application_id: string
          created_at?: string
          id?: string
          profile_name?: string | null
          profile_password?: string | null
          slot_number: number
          status?: Database["public"]["Enums"]["slot_status"]
          updated_at?: string
        }
        Update: {
          account_email?: string
          account_password?: string
          application_id?: string
          created_at?: string
          id?: string
          profile_name?: string | null
          profile_password?: string | null
          slot_number?: number
          status?: Database["public"]["Enums"]["slot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slots_stock_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slots_stock_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      applications_catalog: {
        Row: {
          apk_size_bytes: number | null
          apk_version: string | null
          category: string | null
          description: string | null
          id: string | null
          image_url: string | null
          name: string | null
          price_fcfa: number | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          sort_order: number | null
          stock_disponible: number | null
        }
        Insert: {
          apk_size_bytes?: number | null
          apk_version?: string | null
          category?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          name?: string | null
          price_fcfa?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sort_order?: number | null
          stock_disponible?: never
        }
        Update: {
          apk_size_bytes?: number | null
          apk_version?: string | null
          category?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          name?: string | null
          price_fcfa?: number | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          sort_order?: number | null
          stock_disponible?: never
        }
        Relationships: []
      }
    }
    Functions: {
      allocate_slot_for_order: {
        Args: { p_order_id: string }
        Returns: {
          account_email: string
          account_password: string
          application_name: string
          profile_name: string
          profile_password: string
          remaining_stock: number
          slot_id: string
          slot_number: number
        }[]
      }
    }
    Enums: {
      order_status: "en_attente" | "paye" | "echoue"
      product_type: "account" | "apk"
      slot_status: "disponible" | "vendu" | "bloque"
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
      order_status: ["en_attente", "paye", "echoue"],
      product_type: ["account", "apk"],
      slot_status: ["disponible", "vendu", "bloque"],
    },
  },
} as const
