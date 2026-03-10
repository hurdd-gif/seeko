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
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          doc_id: string | null
          id: string
          target: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          doc_id?: string | null
          id?: string
          target: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          doc_id?: string | null
          id?: string
          target?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          phase: Database["public"]["Enums"]["area_phase"] | null
          progress: number | null
          status: Database["public"]["Enums"]["area_status"] | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          phase?: Database["public"]["Enums"]["area_phase"] | null
          progress?: number | null
          status?: Database["public"]["Enums"]["area_status"] | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          phase?: Database["public"]["Enums"]["area_phase"] | null
          progress?: number | null
          status?: Database["public"]["Enums"]["area_status"] | null
        }
        Relationships: []
      }
      deadline_extensions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          denial_reason: string | null
          extra_hours: number
          id: string
          new_deadline: string
          original_deadline: string
          requested_by: string
          status: string
          task_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          denial_reason?: string | null
          extra_hours: number
          id?: string
          new_deadline: string
          original_deadline: string
          requested_by: string
          status?: string
          task_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          denial_reason?: string | null
          extra_hours?: number
          id?: string
          new_deadline?: string
          original_deadline?: string
          requested_by?: string
          status?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadline_extensions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_extensions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadline_extensions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      docs: {
        Row: {
          content: string | null
          created_at: string | null
          granted_user_ids: string[] | null
          id: string
          parent_id: string | null
          restricted_department: string[] | null
          slides: Json | null
          sort_order: number | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          granted_user_ids?: string[] | null
          id?: string
          parent_id?: string | null
          restricted_department?: string[] | null
          slides?: Json | null
          sort_order?: number | null
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          granted_user_ids?: string[] | null
          id?: string
          parent_id?: string | null
          restricted_department?: string[] | null
          slides?: Json | null
          sort_order?: number | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "docs_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "docs"
            referencedColumns: ["id"]
          },
        ]
      }
      external_signing_invites: {
        Row: {
          created_at: string | null
          created_by: string
          custom_sections: Json | null
          custom_title: string | null
          expires_at: string
          id: string
          personal_note: string | null
          recipient_email: string
          signed_at: string | null
          signer_address: string | null
          signer_ip: string | null
          signer_name: string | null
          signer_user_agent: string | null
          status: string
          template_id: string | null
          template_type: string
          token: string
          verification_attempts: number
          verification_code: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          custom_sections?: Json | null
          custom_title?: string | null
          expires_at: string
          id?: string
          personal_note?: string | null
          recipient_email: string
          signed_at?: string | null
          signer_address?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          template_type: string
          token: string
          verification_attempts?: number
          verification_code?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          custom_sections?: Json | null
          custom_title?: string | null
          expires_at?: string
          id?: string
          personal_note?: string | null
          recipient_email?: string
          signed_at?: string | null
          signer_address?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          signer_user_agent?: string | null
          status?: string
          template_id?: string | null
          template_type?: string
          token?: string
          verification_attempts?: number
          verification_code?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_signing_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_items: {
        Row: {
          amount: number
          id: string
          label: string
          payment_id: string
          task_id: string | null
        }
        Insert: {
          amount: number
          id?: string
          label: string
          payment_id: string
          task_id?: string | null
        }
        Update: {
          amount?: number
          id?: string
          label?: string
          payment_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_items_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string
          currency: string
          description: string | null
          id: string
          paid_at: string | null
          recipient_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by: string
          currency?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          recipient_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string
          currency?: string
          description?: string | null
          id?: string
          paid_at?: string | null
          recipient_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_invites: {
        Row: {
          created_at: string | null
          department: string | null
          email: string
          is_contractor: boolean
          is_investor: boolean
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          email: string
          is_contractor?: boolean
          is_investor?: boolean
        }
        Update: {
          created_at?: string | null
          department?: string | null
          email?: string
          is_contractor?: boolean
          is_investor?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: Database["public"]["Enums"]["department"] | null
          display_name: string | null
          email: string | null
          id: string
          is_admin: boolean
          is_contractor: boolean
          is_investor: boolean
          last_seen_at: string | null
          must_set_password: boolean
          nda_accepted_at: string | null
          nda_ip: string | null
          nda_signer_address: string | null
          nda_signer_name: string | null
          nda_user_agent: string | null
          onboarded: number
          paypal_email: string | null
          role: string | null
          timezone: string | null
          tour_completed: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          display_name?: string | null
          email?: string | null
          id: string
          is_admin?: boolean
          is_contractor?: boolean
          is_investor?: boolean
          last_seen_at?: string | null
          must_set_password?: boolean
          nda_accepted_at?: string | null
          nda_ip?: string | null
          nda_signer_address?: string | null
          nda_signer_name?: string | null
          nda_user_agent?: string | null
          onboarded?: number
          paypal_email?: string | null
          role?: string | null
          timezone?: string | null
          tour_completed?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean
          is_contractor?: boolean
          is_investor?: boolean
          last_seen_at?: string | null
          must_set_password?: boolean
          nda_accepted_at?: string | null
          nda_ip?: string | null
          nda_signer_address?: string | null
          nda_signer_name?: string | null
          nda_user_agent?: string | null
          onboarded?: number
          paypal_email?: string | null
          role?: string | null
          timezone?: string | null
          tour_completed?: number
        }
        Relationships: []
      }
      task_comment_attachments: {
        Row: {
          comment_id: string
          created_at: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          storage_path: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          file_name: string
          file_size?: number
          file_type?: string
          file_url: string
          id?: string
          storage_path: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comment_reactions: {
        Row: {
          comment_id: string
          created_at: string | null
          emoji: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          emoji: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          emoji?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          reply_to_id: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          reply_to_id?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_deliverables: {
        Row: {
          created_at: string | null
          file_name: string
          id: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          id?: string
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          id?: string
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_deliverables_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_deliverables_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_handoffs: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          note: string | null
          task_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          note?: string | null
          task_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          note?: string | null
          task_id?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_handoffs_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_handoffs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_handoffs_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          area_id: string | null
          assignee_id: string | null
          bounty: number | null
          created_at: string | null
          deadline: string | null
          department: Database["public"]["Enums"]["department"] | null
          description: string | null
          id: string
          name: string
          priority: Database["public"]["Enums"]["priority"] | null
          status: Database["public"]["Enums"]["task_status"] | null
        }
        Insert: {
          area_id?: string | null
          assignee_id?: string | null
          bounty?: number | null
          created_at?: string | null
          deadline?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          id?: string
          name: string
          priority?: Database["public"]["Enums"]["priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
        }
        Update: {
          area_id?: string | null
          assignee_id?: string | null
          bounty?: number | null
          created_at?: string | null
          deadline?: string | null
          department?: Database["public"]["Enums"]["department"] | null
          description?: string | null
          id?: string
          name?: string
          priority?: Database["public"]["Enums"]["priority"] | null
          status?: Database["public"]["Enums"]["task_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          page: string
          target: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          page: string
          target?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          page?: string
          target?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      area_phase: "Alpha" | "Beta" | "Launch"
      area_status: "Active" | "Planned" | "Complete"
      department:
        | "Coding"
        | "Visual Art"
        | "UI/UX"
        | "Animation"
        | "Asset Creation"
      notification_kind:
        | "task_assigned"
        | "mentioned"
        | "comment_reply"
        | "task_completed"
        | "deliverable_uploaded"
        | "payment_request"
        | "payment_approved"
        | "payment_denied"
        | "deadline_extension_requested"
        | "deadline_extension_approved"
        | "deadline_extension_denied"
        | "task_submitted_review"
        | "task_review_approved"
        | "task_review_denied"
        | "task_handoff"
      payment_status: "pending" | "paid" | "cancelled"
      priority: "High" | "Medium" | "Low"
      task_status: "Complete" | "In Progress" | "In Review" | "Blocked"
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
      area_phase: ["Alpha", "Beta", "Launch"],
      area_status: ["Active", "Planned", "Complete"],
      department: [
        "Coding",
        "Visual Art",
        "UI/UX",
        "Animation",
        "Asset Creation",
      ],
      notification_kind: [
        "task_assigned",
        "mentioned",
        "comment_reply",
        "task_completed",
        "deliverable_uploaded",
        "payment_request",
        "payment_approved",
        "payment_denied",
        "deadline_extension_requested",
        "deadline_extension_approved",
        "deadline_extension_denied",
        "task_submitted_review",
        "task_review_approved",
        "task_review_denied",
        "task_handoff",
      ],
      payment_status: ["pending", "paid", "cancelled"],
      priority: ["High", "Medium", "Low"],
      task_status: ["Complete", "In Progress", "In Review", "Blocked"],
    },
  },
} as const
