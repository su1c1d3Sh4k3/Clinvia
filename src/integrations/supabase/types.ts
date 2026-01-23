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
          user_id: string | null
        }
        Insert: {
          conversation_id: string
          id?: string
          last_updated?: string | null
          sentiment_score?: number | null
          speed_score?: number | null
          summary?: string | null
          user_id?: string | null
        }
        Update: {
          conversation_id?: string
          id?: string
          last_updated?: string | null
          sentiment_score?: number | null
          speed_score?: number | null
          summary?: string | null
          user_id?: string | null
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
      appointments: {
        Row: {
          contact_id: string | null
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          price: number | null
          professional_id: string
          professional_name: string | null
          service_id: string | null
          service_name: string | null
          start_time: string
          status: string
          type: Database["public"]["Enums"]["appointment_type"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          price?: number | null
          professional_id: string
          professional_name?: string | null
          service_id?: string | null
          service_name?: string | null
          start_time: string
          status?: string
          type?: Database["public"]["Enums"]["appointment_type"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          price?: number | null
          professional_id?: string
          professional_name?: string | null
          service_id?: string | null
          service_name?: string | null
          start_time?: string
          status?: string
          type?: Database["public"]["Enums"]["appointment_type"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_usage_log: {
        Row: {
          audio_duration_seconds: number | null
          characters_processed: number | null
          cost_usd: number | null
          created_at: string | null
          function_name: string
          id: string
          model: string
          owner_id: string
          team_member_id: string | null
        }
        Insert: {
          audio_duration_seconds?: number | null
          characters_processed?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name: string
          id?: string
          model: string
          owner_id: string
          team_member_id?: string | null
        }
        Update: {
          audio_duration_seconds?: number | null
          characters_processed?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name?: string
          id?: string
          model?: string
          owner_id?: string
          team_member_id?: string | null
        }
        Relationships: []
      }
      bia_chat_history: {
        Row: {
          auth_user_id: string
          content: string
          created_at: string | null
          id: string
          page_name: string | null
          page_slug: string | null
          role: string
        }
        Insert: {
          auth_user_id: string
          content: string
          created_at?: string | null
          id?: string
          page_name?: string | null
          page_slug?: string | null
          role: string
        }
        Update: {
          auth_user_id?: string
          content?: string
          created_at?: string | null
          id?: string
          page_name?: string | null
          page_slug?: string | null
          role?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          tag_id: string
          user_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          tag_id: string
          user_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          tag_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          analysis: Json[] | null
          channel: string | null
          company: string | null
          cpf: string | null
          created_at: string | null
          custom_attributes: Json | null
          edited: boolean | null
          email: string | null
          follow_stage: string | null
          follow_status: string | null
          ia_on: boolean | null
          id: string
          instagram: string | null
          instagram_id: string | null
          instagram_instance_id: string | null
          instance_id: string | null
          is_group: boolean | null
          message_date: string | null
          nps: Json | null
          number: string
          patient: boolean | null
          patient_id: string | null
          phone: string | null
          profile_pic_url: string | null
          push_name: string | null
          quality: number[] | null
          report: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          analysis?: Json[] | null
          channel?: string | null
          company?: string | null
          cpf?: string | null
          created_at?: string | null
          custom_attributes?: Json | null
          edited?: boolean | null
          email?: string | null
          follow_stage?: string | null
          follow_status?: string | null
          ia_on?: boolean | null
          id?: string
          instagram?: string | null
          instagram_id?: string | null
          instagram_instance_id?: string | null
          instance_id?: string | null
          is_group?: boolean | null
          message_date?: string | null
          nps?: Json | null
          number: string
          patient?: boolean | null
          patient_id?: string | null
          phone?: string | null
          profile_pic_url?: string | null
          push_name?: string | null
          quality?: number[] | null
          report?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          analysis?: Json[] | null
          channel?: string | null
          company?: string | null
          cpf?: string | null
          created_at?: string | null
          custom_attributes?: Json | null
          edited?: boolean | null
          email?: string | null
          follow_stage?: string | null
          follow_status?: string | null
          ia_on?: boolean | null
          id?: string
          instagram?: string | null
          instagram_id?: string | null
          instagram_instance_id?: string | null
          instance_id?: string | null
          is_group?: boolean | null
          message_date?: string | null
          nps?: Json | null
          number?: string
          patient?: boolean | null
          patient_id?: string | null
          phone?: string | null
          profile_pic_url?: string | null
          push_name?: string | null
          quality?: number[] | null
          report?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_instagram_instance_id_fkey"
            columns: ["instagram_instance_id"]
            isOneToOne: false
            referencedRelation: "instagram_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contacts_patient"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_follow_ups: {
        Row: {
          auto_send: boolean | null
          category_id: string
          completed: boolean | null
          conversation_id: string
          created_at: string | null
          current_template_index: number | null
          id: string
          last_seen_template_id: string | null
          next_send_at: string | null
          updated_at: string | null
        }
        Insert: {
          auto_send?: boolean | null
          category_id: string
          completed?: boolean | null
          conversation_id: string
          created_at?: string | null
          current_template_index?: number | null
          id?: string
          last_seen_template_id?: string | null
          next_send_at?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_send?: boolean | null
          category_id?: string
          completed?: boolean | null
          conversation_id?: string
          created_at?: string | null
          current_template_index?: number | null
          id?: string
          last_seen_template_id?: string | null
          next_send_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_follow_ups_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "follow_up_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_follow_ups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_follow_ups_last_seen_template_id_fkey"
            columns: ["last_seen_template_id"]
            isOneToOne: false
            referencedRelation: "follow_up_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_agent_id: string | null
          channel: string | null
          contact_id: string | null
          created_at: string | null
          follow_up_notified_at: string | null
          group_id: string | null
          has_follow_up: boolean | null
          id: string
          instagram_instance_id: string | null
          instance_id: string | null
          last_message: string | null
          last_message_at: string | null
          messages_history: Json | null
          queue_id: string | null
          sentiment_score: number | null
          status: string | null
          summary: string | null
          ticket_id: string | null
          unread_count: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          follow_up_notified_at?: string | null
          group_id?: string | null
          has_follow_up?: boolean | null
          id?: string
          instagram_instance_id?: string | null
          instance_id?: string | null
          last_message?: string | null
          last_message_at?: string | null
          messages_history?: Json | null
          queue_id?: string | null
          sentiment_score?: number | null
          status?: string | null
          summary?: string | null
          ticket_id?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          follow_up_notified_at?: string | null
          group_id?: string | null
          has_follow_up?: boolean | null
          id?: string
          instagram_instance_id?: string | null
          instance_id?: string | null
          last_message?: string | null
          last_message_at?: string | null
          messages_history?: Json | null
          queue_id?: string | null
          sentiment_score?: number | null
          status?: string | null
          summary?: string | null
          ticket_id?: string | null
          unread_count?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_instagram_instance_id_fkey"
            columns: ["instagram_instance_id"]
            isOneToOne: false
            referencedRelation: "instagram_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot: {
        Row: {
          about_company: string | null
          created_at: string
          customer_profile: string | null
          humor_level: string | null
          personality: string | null
          products: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          about_company?: string | null
          created_at?: string
          customer_profile?: string | null
          humor_level?: string | null
          personality?: string | null
          products?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          about_company?: string | null
          created_at?: string
          customer_profile?: string | null
          humor_level?: string | null
          personality?: string | null
          products?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_deal_products: {
        Row: {
          created_at: string | null
          deal_id: string
          id: string
          product_service_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          id?: string
          product_service_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          id?: string
          product_service_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_deal_products_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_products_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          assigned_professional_id: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          funnel_id: string
          id: string
          loss_reason: string | null
          loss_reason_other: string | null
          notes: Json | null
          priority: string | null
          product_service_id: string | null
          quantity: number | null
          responsible_id: string | null
          stage_changed_at: string | null
          stage_id: string
          title: string
          updated_at: string | null
          user_id: string
          value: number | null
        }
        Insert: {
          assigned_professional_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          funnel_id: string
          id?: string
          loss_reason?: string | null
          loss_reason_other?: string | null
          notes?: Json | null
          priority?: string | null
          product_service_id?: string | null
          quantity?: number | null
          responsible_id?: string | null
          stage_changed_at?: string | null
          stage_id: string
          title: string
          updated_at?: string | null
          user_id: string
          value?: number | null
        }
        Update: {
          assigned_professional_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          funnel_id?: string
          id?: string
          loss_reason?: string | null
          loss_reason_other?: string | null
          notes?: Json | null
          priority?: string | null
          product_service_id?: string | null
          quantity?: number | null
          responsible_id?: string | null
          stage_changed_at?: string | null
          stage_id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_assigned_professional_id_fkey"
            columns: ["assigned_professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "crm_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_funnels: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      crm_stages: {
        Row: {
          color: string | null
          created_at: string | null
          funnel_id: string
          history: number | null
          id: string
          is_system: boolean | null
          name: string
          position: number
          stagnation_limit_days: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          funnel_id: string
          history?: number | null
          id?: string
          is_system?: boolean | null
          name: string
          position?: number
          stagnation_limit_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          funnel_id?: string
          history?: number | null
          id?: string
          is_system?: boolean | null
          name?: string
          position?: number
          stagnation_limit_days?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "crm_funnels"
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
      expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          commission_revenue_id: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          is_recurring: boolean | null
          item: string
          paid_date: string | null
          parent_expense_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          recurrence_period:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          commission_revenue_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          is_recurring?: boolean | null
          item: string
          paid_date?: string | null
          parent_expense_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recurrence_period?:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          commission_revenue_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          is_recurring?: boolean | null
          item?: string
          paid_date?: string | null
          parent_expense_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recurrence_period?:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_commission_revenue_id_fkey"
            columns: ["commission_revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_parent_expense_id_fkey"
            columns: ["parent_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          content: Json
          created_at: string | null
          end_date: string
          id: string
          name: string
          raw_data: Json | null
          start_date: string
          status: string | null
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string | null
          end_date: string
          id?: string
          name: string
          raw_data?: Json | null
          start_date: string
          status?: string | null
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string | null
          end_date?: string
          id?: string
          name?: string
          raw_data?: Json | null
          start_date?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      follow_up_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          team_member_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_categories_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_templates: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          message: string
          name: string
          team_member_id: string | null
          time_minutes: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          message: string
          name: string
          team_member_id?: string | null
          time_minutes: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          message?: string
          name?: string
          team_member_id?: string | null
          time_minutes?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "follow_up_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_templates_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string | null
          group_id: string | null
          id: string
          number: string
          profile_pic_url: string | null
          push_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          number: string
          profile_pic_url?: string | null
          push_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string | null
          id?: string
          number?: string
          profile_pic_url?: string | null
          push_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string | null
          group_name: string | null
          group_pic_url: string | null
          id: string
          instance_id: string | null
          remote_jid: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          group_name?: string | null
          group_pic_url?: string | null
          id?: string
          instance_id?: string | null
          remote_jid: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          group_name?: string | null
          group_pic_url?: string | null
          id?: string
          instance_id?: string | null
          remote_jid?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_config: {
        Row: {
          address: string | null
          agent_name: string | null
          convenio: string | null
          created_at: string | null
          crm_auto: boolean | null
          delay: number | null
          description: string | null
          facebook: string | null
          followup: boolean | null
          followup_business_hours: boolean | null
          frequent_questions: string | null
          fup1: boolean | null
          fup1_message: string | null
          fup1_time: number | null
          fup2: boolean | null
          fup2_message: string | null
          fup2_time: number | null
          fup3: boolean | null
          fup3_message: string | null
          fup3_time: number | null
          genre: string | null
          ia_on: boolean | null
          id: string
          instagram: string | null
          link_google: string | null
          name: string | null
          opening_hours: string | null
          payment: string | null
          qualify: string | null
          restrictions: string | null
          scheduling_on: boolean | null
          site: string | null
          updated_at: string | null
          user_id: string
          voice: boolean | null
          welcome: string | null
        }
        Insert: {
          address?: string | null
          agent_name?: string | null
          convenio?: string | null
          created_at?: string | null
          crm_auto?: boolean | null
          delay?: number | null
          description?: string | null
          facebook?: string | null
          followup?: boolean | null
          followup_business_hours?: boolean | null
          frequent_questions?: string | null
          fup1?: boolean | null
          fup1_message?: string | null
          fup1_time?: number | null
          fup2?: boolean | null
          fup2_message?: string | null
          fup2_time?: number | null
          fup3?: boolean | null
          fup3_message?: string | null
          fup3_time?: number | null
          genre?: string | null
          ia_on?: boolean | null
          id?: string
          instagram?: string | null
          link_google?: string | null
          name?: string | null
          opening_hours?: string | null
          payment?: string | null
          qualify?: string | null
          restrictions?: string | null
          scheduling_on?: boolean | null
          site?: string | null
          updated_at?: string | null
          user_id: string
          voice?: boolean | null
          welcome?: string | null
        }
        Update: {
          address?: string | null
          agent_name?: string | null
          convenio?: string | null
          created_at?: string | null
          crm_auto?: boolean | null
          delay?: number | null
          description?: string | null
          facebook?: string | null
          followup?: boolean | null
          followup_business_hours?: boolean | null
          frequent_questions?: string | null
          fup1?: boolean | null
          fup1_message?: string | null
          fup1_time?: number | null
          fup2?: boolean | null
          fup2_message?: string | null
          fup2_time?: number | null
          fup3?: boolean | null
          fup3_message?: string | null
          fup3_time?: number | null
          genre?: string | null
          ia_on?: boolean | null
          id?: string
          instagram?: string | null
          link_google?: string | null
          name?: string | null
          opening_hours?: string | null
          payment?: string | null
          qualify?: string | null
          restrictions?: string | null
          scheduling_on?: boolean | null
          site?: string | null
          updated_at?: string | null
          user_id?: string
          voice?: boolean | null
          welcome?: string | null
        }
        Relationships: []
      }
      instagram_instances: {
        Row: {
          access_token: string
          account_name: string
          created_at: string | null
          facebook_page_id: string | null
          facebook_page_name: string | null
          ia_on_insta: boolean | null
          id: string
          instagram_account_id: string
          status: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          access_token: string
          account_name: string
          created_at?: string | null
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          ia_on_insta?: boolean | null
          id?: string
          instagram_account_id: string
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          access_token?: string
          account_name?: string
          created_at?: string | null
          facebook_page_id?: string | null
          facebook_page_name?: string | null
          ia_on_insta?: boolean | null
          id?: string
          instagram_account_id?: string
          status?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: []
      }
      instances: {
        Row: {
          apikey: string
          client_number: string | null
          cliente_number: string | null
          created_at: string | null
          default_queue_id: string | null
          ia_on_wpp: boolean | null
          id: string
          instance_name: string | null
          name: string
          pin_code: string | null
          profile_pic_url: string | null
          qr_code: string | null
          server_url: string
          status: Database["public"]["Enums"]["instance_status"] | null
          updated_at: string | null
          user_id: string | null
          user_name: string | null
          webhook_url: string | null
          workflow_id: string | null
        }
        Insert: {
          apikey: string
          client_number?: string | null
          cliente_number?: string | null
          created_at?: string | null
          default_queue_id?: string | null
          ia_on_wpp?: boolean | null
          id?: string
          instance_name?: string | null
          name: string
          pin_code?: string | null
          profile_pic_url?: string | null
          qr_code?: string | null
          server_url: string
          status?: Database["public"]["Enums"]["instance_status"] | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
          webhook_url?: string | null
          workflow_id?: string | null
        }
        Update: {
          apikey?: string
          client_number?: string | null
          cliente_number?: string | null
          created_at?: string | null
          default_queue_id?: string | null
          ia_on_wpp?: boolean | null
          id?: string
          instance_name?: string | null
          name?: string
          pin_code?: string | null
          profile_pic_url?: string | null
          qr_code?: string | null
          server_url?: string
          status?: Database["public"]["Enums"]["instance_status"] | null
          updated_at?: string | null
          user_id?: string | null
          user_name?: string | null
          webhook_url?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instances_default_queue_id_fkey"
            columns: ["default_queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          conversions_count: number | null
          created_at: string | null
          end_date: string | null
          id: string
          investment: number
          leads_count: number | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["marketing_origin"]
          start_date: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversions_count?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          investment?: number
          leads_count?: number | null
          name: string
          notes?: string | null
          origin: Database["public"]["Enums"]["marketing_origin"]
          start_date: string
          status: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversions_count?: number | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          investment?: number
          leads_count?: number | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["marketing_origin"]
          start_date?: string
          status?: string
          updated_at?: string | null
          user_id?: string
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
          is_deleted: boolean | null
          media_url: string | null
          message_type: Database["public"]["Enums"]["message_type"] | null
          quoted_body: string | null
          quoted_sender: string | null
          reply_to_id: string | null
          sender_jid: string | null
          sender_name: string | null
          sender_profile_pic_url: string | null
          status: string | null
          transcription: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          evolution_id?: string | null
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
          quoted_body?: string | null
          quoted_sender?: string | null
          reply_to_id?: string | null
          sender_jid?: string | null
          sender_name?: string | null
          sender_profile_pic_url?: string | null
          status?: string | null
          transcription?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          evolution_id?: string | null
          id?: string
          is_deleted?: boolean | null
          media_url?: string | null
          message_type?: Database["public"]["Enums"]["message_type"] | null
          quoted_body?: string | null
          quoted_sender?: string | null
          reply_to_id?: string | null
          sender_jid?: string | null
          sender_name?: string | null
          sender_profile_pic_url?: string | null
          status?: string | null
          transcription?: string | null
          user_id?: string | null
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
      notification_dismissals: {
        Row: {
          dismissed_at: string | null
          notification_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string | null
          notification_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string | null
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          related_user_id: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          related_user_id?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          related_user_id?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          alert_date: string
          appointment_id: string | null
          assigned_to: string | null
          claimed_at: string | null
          claimed_by: string | null
          contact_id: string
          created_at: string | null
          dismissed: boolean | null
          id: string
          product_service_id: string | null
          professional_id: string | null
          reference_date: string
          revenue_id: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          alert_date: string
          appointment_id?: string | null
          assigned_to?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id: string
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          product_service_id?: string | null
          professional_id?: string | null
          reference_date: string
          revenue_id?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          alert_date?: string
          appointment_id?: string | null
          assigned_to?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          contact_id?: string
          created_at?: string | null
          dismissed?: boolean | null
          id?: string
          product_service_id?: string | null
          professional_id?: string | null
          reference_date?: string
          revenue_id?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contact_id: string | null
          contatos_emergencia: Json | null
          convenios: Json | null
          cpf: string | null
          created_at: string | null
          data_nascimento: string | null
          docs: string[] | null
          email: string | null
          endereco: string | null
          escolaridade: string | null
          estado: string | null
          estado_civil: string | null
          id: string
          nome: string
          nome_civil: string | null
          notes: Json | null
          photos: string[] | null
          profissao: string | null
          rg: string | null
          sexo: string | null
          telefone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contact_id?: string | null
          contatos_emergencia?: Json | null
          convenios?: Json | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          docs?: string[] | null
          email?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: string
          nome: string
          nome_civil?: string | null
          notes?: Json | null
          photos?: string[] | null
          profissao?: string | null
          rg?: string | null
          sexo?: string | null
          telefone: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contact_id?: string | null
          contatos_emergencia?: Json | null
          convenios?: Json | null
          cpf?: string | null
          created_at?: string | null
          data_nascimento?: string | null
          docs?: string[] | null
          email?: string | null
          endereco?: string | null
          escolaridade?: string | null
          estado?: string | null
          estado_civil?: string | null
          id?: string
          nome?: string
          nome_civil?: string | null
          notes?: Json | null
          photos?: string[] | null
          profissao?: string | null
          rg?: string | null
          sexo?: string | null
          telefone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_signups: {
        Row: {
          address: string | null
          company_name: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          instagram: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          instagram?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          instagram?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      products_services: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          image_urls: string[] | null
          name: string
          opportunity_alert_days: number | null
          price: number | null
          stock_quantity: number | null
          type: Database["public"]["Enums"]["product_service_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_urls?: string[] | null
          name: string
          opportunity_alert_days?: number | null
          price?: number | null
          stock_quantity?: number | null
          type: Database["public"]["Enums"]["product_service_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_urls?: string[] | null
          name?: string
          opportunity_alert_days?: number | null
          price?: number | null
          stock_quantity?: number | null
          type?: Database["public"]["Enums"]["product_service_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          commission: number | null
          created_at: string | null
          id: string
          name: string
          photo_url: string | null
          role: string | null
          service_ids: string[] | null
          updated_at: string | null
          user_id: string
          work_days: number[] | null
          work_hours: Json | null
        }
        Insert: {
          commission?: number | null
          created_at?: string | null
          id?: string
          name: string
          photo_url?: string | null
          role?: string | null
          service_ids?: string[] | null
          updated_at?: string | null
          user_id: string
          work_days?: number[] | null
          work_hours?: Json | null
        }
        Update: {
          commission?: number | null
          created_at?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          role?: string | null
          service_ids?: string[] | null
          updated_at?: string | null
          user_id?: string
          work_days?: number[] | null
          work_hours?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          approximate_cost_monthly: number | null
          approximate_cost_total: number | null
          audio_cost_monthly: number | null
          audio_cost_total: number | null
          avatar_url: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          financial_access: boolean | null
          full_name: string | null
          group_notifications_enabled: boolean | null
          id: string
          instagram: string | null
          must_change_password: boolean | null
          notifications_enabled: boolean | null
          openai_token: string | null
          openai_token_invalid: boolean | null
          phone: string | null
          role: string | null
          status: string | null
          tokens_monthly: number | null
          tokens_total: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          approximate_cost_monthly?: number | null
          approximate_cost_total?: number | null
          audio_cost_monthly?: number | null
          audio_cost_total?: number | null
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          financial_access?: boolean | null
          full_name?: string | null
          group_notifications_enabled?: boolean | null
          id: string
          instagram?: string | null
          must_change_password?: boolean | null
          notifications_enabled?: boolean | null
          openai_token?: string | null
          openai_token_invalid?: boolean | null
          phone?: string | null
          role?: string | null
          status?: string | null
          tokens_monthly?: number | null
          tokens_total?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          approximate_cost_monthly?: number | null
          approximate_cost_total?: number | null
          audio_cost_monthly?: number | null
          audio_cost_total?: number | null
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          financial_access?: boolean | null
          full_name?: string | null
          group_notifications_enabled?: boolean | null
          id?: string
          instagram?: string | null
          must_change_password?: boolean | null
          notifications_enabled?: boolean | null
          openai_token?: string | null
          openai_token_invalid?: boolean | null
          phone?: string | null
          role?: string | null
          status?: string | null
          tokens_monthly?: number | null
          tokens_total?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          device_type: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          device_type?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          device_type?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      queues: {
        Row: {
          assigned_users: string[] | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          assigned_users?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          assigned_users?: string[] | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quick_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          media_url: string | null
          message_type: string
          shortcut: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          message_type: string
          shortcut: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          shortcut?: string
          user_id?: string
        }
        Relationships: []
      }
      response_times: {
        Row: {
          agent_id: string | null
          agent_response_time: string | null
          client_message_time: string | null
          conversation_id: string | null
          created_at: string | null
          id: string
          response_duration_seconds: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_response_time?: string | null
          client_message_time?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          response_duration_seconds?: number | null
        }
        Update: {
          agent_id?: string | null
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
      revenue_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      revenues: {
        Row: {
          amount: number
          appointment_id: string | null
          category_id: string | null
          contact_id: string | null
          created_at: string | null
          description: string | null
          due_date: string
          id: string
          is_recurring: boolean | null
          item: string
          paid_date: string | null
          parent_revenue_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          product_service_id: string | null
          professional_id: string | null
          recurrence_period:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status: string
          team_member_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date: string
          id?: string
          is_recurring?: boolean | null
          item: string
          paid_date?: string | null
          parent_revenue_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          product_service_id?: string | null
          professional_id?: string | null
          recurrence_period?:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status?: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string
          id?: string
          is_recurring?: boolean | null
          item?: string
          paid_date?: string | null
          parent_revenue_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          product_service_id?: string | null
          professional_id?: string | null
          recurrence_period?:
            | Database["public"]["Enums"]["recurrence_period"]
            | null
          status?: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenues_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "revenue_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_parent_revenue_id_fkey"
            columns: ["parent_revenue_id"]
            isOneToOne: false
            referencedRelation: "revenues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenues_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_installments: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string
          id: string
          installment_number: number
          paid_date: string | null
          sale_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date: string
          id?: string
          installment_number: number
          paid_date?: string | null
          sale_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string
          id?: string
          installment_number?: number
          paid_date?: string | null
          sale_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_installments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          category: string
          contact_id: string | null
          created_at: string | null
          id: string
          installments: number
          interest_rate: number | null
          notes: string | null
          payment_type: string
          product_service_id: string
          professional_id: string | null
          quantity: number
          sale_date: string
          team_member_id: string | null
          total_amount: number
          unit_price: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          installments?: number
          interest_rate?: number | null
          notes?: string | null
          payment_type: string
          product_service_id: string
          professional_id?: string | null
          quantity?: number
          sale_date?: string
          team_member_id?: string | null
          total_amount: number
          unit_price: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          installments?: number
          interest_rate?: number | null
          notes?: string | null
          payment_type?: string
          product_service_id?: string
          professional_id?: string | null
          quantity?: number
          sale_date?: string
          team_member_id?: string | null
          total_amount?: number
          unit_price?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_service_id_fkey"
            columns: ["product_service_id"]
            isOneToOne: false
            referencedRelation: "products_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reports: {
        Row: {
          content: string
          created_at: string | null
          end_date: string
          id: string
          name: string
          start_date: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scheduling_settings: {
        Row: {
          auto_complete: boolean | null
          created_at: string
          end_hour: number
          id: string
          start_hour: number
          updated_at: string
          user_id: string
          work_days: number[]
        }
        Insert: {
          auto_complete?: boolean | null
          created_at?: string
          end_hour?: number
          id?: string
          start_hour?: number
          updated_at?: string
          user_id: string
          work_days?: number[]
        }
        Update: {
          auto_complete?: boolean | null
          created_at?: string
          end_hour?: number
          id?: string
          start_hour?: number
          updated_at?: string
          user_id?: string
          work_days?: number[]
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      task_boards: {
        Row: {
          allowed_agents: string[] | null
          created_at: string | null
          end_hour: number
          id: string
          interval_minutes: number
          name: string
          start_hour: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allowed_agents?: string[] | null
          created_at?: string | null
          end_hour?: number
          id?: string
          interval_minutes?: number
          name: string
          start_hour?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allowed_agents?: string[] | null
          created_at?: string | null
          end_hour?: number
          id?: string
          interval_minutes?: number
          name?: string
          start_hour?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          board_id: string
          contact_id: string | null
          created_at: string | null
          crm_deal_id: string | null
          description: string | null
          due_date: string | null
          end_time: string
          id: string
          recurrence: string | null
          responsible_id: string | null
          start_time: string
          status: string | null
          title: string
          type: string | null
          updated_at: string | null
          urgency: string | null
          user_id: string
        }
        Insert: {
          board_id: string
          contact_id?: string | null
          created_at?: string | null
          crm_deal_id?: string | null
          description?: string | null
          due_date?: string | null
          end_time: string
          id?: string
          recurrence?: string | null
          responsible_id?: string | null
          start_time: string
          status?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id: string
        }
        Update: {
          board_id?: string
          contact_id?: string | null
          created_at?: string | null
          crm_deal_id?: string | null
          description?: string | null
          due_date?: string | null
          end_time?: string
          id?: string
          recurrence?: string | null
          responsible_id?: string | null
          start_time?: string
          status?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
          urgency?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_crm_deal_id_fkey"
            columns: ["crm_deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_costs: {
        Row: {
          base_salary: number | null
          bonus: number | null
          collaborator_type: Database["public"]["Enums"]["collaborator_type"]
          commission: number | null
          created_at: string | null
          deductions: number | null
          due_date: string
          id: string
          notes: string | null
          paid_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          professional_id: string | null
          reference_month: number | null
          reference_year: number | null
          status: string
          team_member_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          base_salary?: number | null
          bonus?: number | null
          collaborator_type: Database["public"]["Enums"]["collaborator_type"]
          commission?: number | null
          created_at?: string | null
          deductions?: number | null
          due_date: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id?: string | null
          reference_month?: number | null
          reference_year?: number | null
          status?: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          base_salary?: number | null
          bonus?: number | null
          collaborator_type?: Database["public"]["Enums"]["collaborator_type"]
          commission?: number | null
          created_at?: string | null
          deductions?: number | null
          due_date?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id?: string | null
          reference_month?: number | null
          reference_year?: number | null
          status?: string
          team_member_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_costs_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_costs_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          address: string | null
          approximate_cost_total: number | null
          audio_cost_total: number | null
          auth_user_id: string | null
          avatar_url: string | null
          commission: number | null
          created_at: string | null
          email: string
          full_name: string | null
          group_notifications_enabled: boolean | null
          id: string
          instagram: string | null
          instagram_notifications_enabled: boolean | null
          name: string
          notifications_enabled: boolean | null
          phone: string | null
          push_notification_preferences: Json | null
          queue_ids: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          sign_messages: boolean | null
          tokens_total: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          approximate_cost_total?: number | null
          audio_cost_total?: number | null
          auth_user_id?: string | null
          avatar_url?: string | null
          commission?: number | null
          created_at?: string | null
          email: string
          full_name?: string | null
          group_notifications_enabled?: boolean | null
          id?: string
          instagram?: string | null
          instagram_notifications_enabled?: boolean | null
          name: string
          notifications_enabled?: boolean | null
          phone?: string | null
          push_notification_preferences?: Json | null
          queue_ids?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          sign_messages?: boolean | null
          tokens_total?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          approximate_cost_total?: number | null
          audio_cost_total?: number | null
          auth_user_id?: string | null
          avatar_url?: string | null
          commission?: number | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          group_notifications_enabled?: boolean | null
          id?: string
          instagram?: string | null
          instagram_notifications_enabled?: boolean | null
          name?: string
          notifications_enabled?: boolean | null
          phone?: string | null
          push_notification_preferences?: Json | null
          queue_ids?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          sign_messages?: boolean | null
          tokens_total?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      token_monthly_history: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string | null
          total_cost: number | null
          total_tokens: number | null
          year_month: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          total_cost?: number | null
          total_tokens?: number | null
          year_month: string
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          total_cost?: number | null
          total_tokens?: number | null
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_monthly_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_usage_log: {
        Row: {
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string | null
          function_name: string
          id: string
          model: string
          owner_id: string
          prompt_tokens: number | null
          team_member_id: string | null
          total_tokens: number | null
        }
        Insert: {
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name: string
          id?: string
          model: string
          owner_id: string
          prompt_tokens?: number | null
          team_member_id?: string | null
          total_tokens?: number | null
        }
        Update: {
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string | null
          function_name?: string
          id?: string
          model?: string
          owner_id?: string
          prompt_tokens?: number | null
          team_member_id?: string | null
          total_tokens?: number | null
        }
        Relationships: []
      }
      webhook_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          instance_name: string
          max_attempts: number | null
          payload: Json
          started_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          instance_name: string
          max_attempts?: number | null
          payload: Json
          started_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          instance_name?: string
          max_attempts?: number | null
          payload?: Json
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_nps_entry: {
        Args: { p_contact_id: string; p_feedback?: string; p_nota: string }
        Returns: undefined
      }
      admin_get_all_profiles: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          address: string
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          instagram: string
          phone: string
          role: string
          status: string
          total_count: number
        }[]
      }
      admin_get_appointment_stats: {
        Args: { p_user_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      admin_get_conversation_stats: {
        Args: { p_user_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      admin_get_cost_daily_history: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          audio_cost: number
          token_cost: number
          usage_date: string
        }[]
      }
      admin_get_cost_monthly_history: {
        Args: { p_user_id: string; p_year: string }
        Returns: {
          audio_cost: number
          token_cost: number
          year_month: string
        }[]
      }
      admin_get_inactive_profiles: {
        Args: never
        Returns: {
          address: string
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          instagram: string
          phone: string
        }[]
      }
      admin_get_pending_profiles: {
        Args: never
        Returns: {
          address: string
          company_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          instagram: string
          phone: string
        }[]
      }
      admin_get_professionals: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          name: string
          photo_url: string
          role: string
        }[]
      }
      admin_get_profile_tokens: {
        Args: { p_user_id: string }
        Returns: {
          approximate_cost_monthly: number
          approximate_cost_total: number
          audio_cost_monthly: number
          audio_cost_total: number
          tokens_monthly: number
          tokens_total: number
        }[]
      }
      admin_get_team_members: {
        Args: { p_user_id: string }
        Returns: {
          email: string
          id: string
          name: string
          phone: string
          role: string
        }[]
      }
      admin_get_team_members_with_tokens: {
        Args: { p_user_id: string }
        Returns: {
          approximate_cost_total: number
          audio_cost_total: number
          email: string
          id: string
          name: string
          phone: string
          role: string
          tokens_total: number
        }[]
      }
      admin_get_token_monthly_history: {
        Args: { p_user_id: string; p_year: string }
        Returns: {
          total_cost: number
          total_tokens: number
          year_month: string
        }[]
      }
      admin_get_token_usage_history: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          total_tokens: number
          usage_date: string
        }[]
      }
      admin_get_token_years: {
        Args: { p_user_id: string }
        Returns: {
          year: string
        }[]
      }
      calculate_speed_score: {
        Args: { duration_seconds: number }
        Returns: number
      }
      check_appointment_overlap: {
        Args: {
          p_end_time: string
          p_exclude_id?: string
          p_professional_id: string
          p_start_time: string
        }
        Returns: boolean
      }
      check_crm_stagnation: { Args: never; Returns: undefined }
      cleanup_old_tickets: { Args: never; Returns: undefined }
      cleanup_team_member_data: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      debug_get_owner_id: {
        Args: never
        Returns: {
          auth_uid: string
          found_by_auth_user_id: boolean
          found_by_user_id: boolean
          owner_id: string
        }[]
      }
      debug_owner_info: { Args: never; Returns: Json }
      format_currency_brl: { Args: { amount: number }; Returns: string }
      get_annual_balance: { Args: { p_year?: number }; Returns: Json }
      get_annual_sales: { Args: { p_year?: number }; Returns: Json }
      get_avg_sentiment_score: { Args: { owner_id: string }; Returns: number }
      get_current_team_member_id: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_dashboard_history: { Args: never; Returns: Json }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_financial_access_setting: { Args: never; Returns: boolean }
      get_financial_summary: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_global_metrics: { Args: never; Returns: Json }
      get_monthly_metrics: { Args: never; Returns: Json }
      get_my_owner_id: { Args: never; Returns: string }
      get_my_team_member_id: { Args: never; Returns: string }
      get_owner_id: { Args: never; Returns: string }
      get_profile_name: { Args: { p_id: string }; Returns: string }
      get_revenue_by_agent: { Args: never; Returns: Json }
      get_revenue_by_professional: { Args: never; Returns: Json }
      get_sales_by_agent: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      get_sales_by_professional: {
        Args: { p_month?: number; p_year?: number }
        Returns: Json
      }
      get_sales_projection: { Args: { p_year?: number }; Returns: Json }
      get_sales_summary: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      get_team_performance: { Args: never; Returns: Json }
      get_top_product_service: {
        Args: { p_month: number; p_year: number }
        Returns: Json
      }
      has_financial_notification_access: { Args: never; Returns: boolean }
      invoke_auto_follow_up: { Args: never; Returns: undefined }
      is_admin: { Args: never; Returns: boolean }
      is_agent: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_supervisor: { Args: never; Returns: boolean }
      process_recurring_entries: { Args: never; Returns: Json }
      reset_monthly_tokens: { Args: never; Returns: undefined }
      send_push_notification: {
        Args: {
          p_body: string
          p_notification_type?: string
          p_tag?: string
          p_title: string
          p_url?: string
          p_user_id: string
        }
        Returns: undefined
      }
      track_audio_usage: {
        Args: {
          p_audio_duration_seconds: number
          p_characters_processed: number
          p_cost_usd: number
          p_function_name: string
          p_model: string
          p_owner_id: string
          p_team_member_id: string
        }
        Returns: undefined
      }
      track_token_usage: {
        Args: {
          p_completion_tokens: number
          p_cost_usd: number
          p_function_name: string
          p_model: string
          p_owner_id: string
          p_prompt_tokens: number
          p_team_member_id: string
        }
        Returns: undefined
      }
      update_all_task_statuses: { Args: never; Returns: undefined }
      update_overdue_entries: { Args: never; Returns: Json }
      update_overdue_sale_installments: { Args: never; Returns: number }
    }
    Enums: {
      appointment_type: "appointment" | "absence"
      campaign_status: "active" | "paused" | "finished"
      collaborator_type: "agent" | "supervisor" | "professional"
      conversation_status: "open" | "pending" | "resolved"
      financial_status: "paid" | "pending" | "overdue" | "cancelled"
      instance_status: "connected" | "disconnected" | "connecting"
      marketing_origin:
        | "google"
        | "meta"
        | "tiktok"
        | "linkedin"
        | "twitter"
        | "email"
        | "organic"
        | "referral"
        | "other"
      message_direction: "inbound" | "outbound"
      message_type: "text" | "image" | "audio" | "video" | "document"
      payment_method:
        | "pix"
        | "credit_card"
        | "debit_card"
        | "bank_transfer"
        | "cash"
        | "boleto"
        | "other"
      product_service_type: "product" | "service"
      recurrence_period: "weekly" | "monthly" | "yearly"
      user_role: "admin" | "supervisor" | "agent"
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
      appointment_type: ["appointment", "absence"],
      campaign_status: ["active", "paused", "finished"],
      collaborator_type: ["agent", "supervisor", "professional"],
      conversation_status: ["open", "pending", "resolved"],
      financial_status: ["paid", "pending", "overdue", "cancelled"],
      instance_status: ["connected", "disconnected", "connecting"],
      marketing_origin: [
        "google",
        "meta",
        "tiktok",
        "linkedin",
        "twitter",
        "email",
        "organic",
        "referral",
        "other",
      ],
      message_direction: ["inbound", "outbound"],
      message_type: ["text", "image", "audio", "video", "document"],
      payment_method: [
        "pix",
        "credit_card",
        "debit_card",
        "bank_transfer",
        "cash",
        "boleto",
        "other",
      ],
      product_service_type: ["product", "service"],
      recurrence_period: ["weekly", "monthly", "yearly"],
      user_role: ["admin", "supervisor", "agent"],
    },
  },
} as const
