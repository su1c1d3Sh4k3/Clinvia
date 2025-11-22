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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_analysis: {
        Row: {
          conversation_id: string
          id: string
          last_updated: string | null
          sentiment_score: number | null
          speed_score: number | null
          summary: string | null
        }
        Insert: {
          conversation_id: string
          id?: string
          last_updated?: string | null
          sentiment_score?: number | null
          speed_score?: number | null
          summary?: string | null
        }
        Update: {
          conversation_id?: string
          id?: string
          last_updated?: string | null
          sentiment_score?: number | null
          speed_score?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_analysis_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string | null
          custom_attributes: Json | null
          id: string
          profile_pic_url: string | null
          push_name: string | null
          remote_jid: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custom_attributes?: Json | null
          id?: string
          profile_pic_url?: string | null
          push_name?: string | null
          remote_jid: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custom_attributes?: Json | null
          id?: string
          profile_pic_url?: string | null
          push_name?: string | null
          remote_jid?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_agent_id: string | null
          contact_id: string
          created_at: string | null
          id: string
          last_message_at: string | null
          status: Database["public"]["Enums"]["conversation_status"] | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"] | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      dados_atendimento: {
        Row: {
          created_at: string | null
          id: string
          qualidade: number | null
          resumo: string | null
          team_id: string | null
          ticket_id: string | null
          updated_at: string | null
          user_id: string | null
          velocidade: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          qualidade?: number | null
          resumo?: string | null
          team_id?: string | null
          ticket_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          velocidade?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          qualidade?: number | null
          resumo?: string | null
          team_id?: string | null
          ticket_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          velocidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dados_atendimento_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      instances: {
        Row: {
          apikey: string
          created_at: string | null
          id: string
          instance_name: string | null
          name: string
          qr_code: string | null
          server_url: string
          status: Database["public"]["Enums"]["instance_status"] | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          apikey: string
          created_at?: string | null
          id?: string
          instance_name?: string | null
          name: string
          qr_code?: string | null
          server_url: string
          status?: Database["public"]["Enums"]["instance_status"] | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          apikey?: string
          created_at?: string | null
          id?: string
          instance_name?: string | null
          name?: string
          qr_code?: string | null
          server_url?: string
          status?: Database["public"]["Enums"]["instance_status"] | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          evolution_id: string | null
          id: string
          media_url: string | null
          message_type: Database["public"]["Enums"]["message_type"] | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          evolution_id?: string | null
          id?: string
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          evolution_id?: string | null
          id?: string
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      response_times: {
        Row: {
          agent_response_time: string | null
          client_message_time: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          response_duration_seconds: number | null
        }
        Insert: {
          agent_response_time?: string | null
          client_message_time?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          response_duration_seconds?: number | null
        }
        Update: {
          agent_response_time?: string | null
          client_message_time?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          response_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_times_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_speed_score: {
        Args: { duration_seconds: number }
        Returns: number
      }
    }
    Enums: {
      conversation_status: "open" | "pending" | "resolved"
      instance_status: "connected" | "disconnected"
      message_direction: "inbound" | "outbound"
      message_type: "text" | "image" | "audio" | "video" | "document"
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
      conversation_status: ["open", "pending", "resolved"],
      instance_status: ["connected", "disconnected"],
      message_direction: ["inbound", "outbound"],
      message_type: ["text", "image", "audio", "video", "document"],
    },
  },
} as const
