/**
 * Database types.
 *
 * NOTE: In production these are generated via
 *   `supabase gen types typescript --local > src/lib/database.types.ts`
 * For Phase 1 (foundation) they are hand-authored for the tables introduced
 * in migration 0001 so the data-access layer is strictly typed from day one.
 * Regenerate after every migration.
 */

import type { AppRole } from './authz/roles';

export type OrganizationType = 'agency' | 'client';
export type MembershipStatus = 'invited' | 'active' | 'suspended';
export type ProjectStatus =
  | 'planned'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'archived';
export type ProjectMemberRole = 'lead' | 'contributor' | 'viewer' | 'client';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ColumnKey = 'queue' | 'active' | 'review' | 'done' | 'custom';
export type TimeSource = 'manual' | 'timer';
export type WorkSessionStatus = 'active' | 'on_break' | 'closed';
export type MembershipPaymentMethod = 'sepa' | 'transfer';
export type MembershipBillingStatus = 'active' | 'paused' | 'canceled';
export type InvoiceStatus =
  | 'draft'
  | 'finalized'
  | 'sent'
  | 'paid'
  | 'void';
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';
export type NotificationType =
  | 'task_assigned'
  | 'comment_mention'
  | 'client_comment'
  | 'internal_question'
  | 'task_in_review'
  | 'task_for_approval'
  | 'approval_granted'
  | 'changes_requested'
  | 'due_date_reached'
  | 'task_overdue'
  | 'file_uploaded'
  | 'absence'
  | 'kudos'
  | 'award'
  | 'pulse_reminder'
  | 'inquiry';
export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'role_change'
  | 'login'
  | 'logout'
  | 'invite'
  | 'invite_revoke'
  | 'invite_resend'
  | 'member_deactivate'
  | 'member_reactivate'
  | 'archive'
  | 'assignee_change'
  | 'due_date_change'
  | 'file_upload'
  | 'file_download'
  | 'comment'
  | 'approval_request'
  | 'approval_decision'
  | 'time_edit';

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          type: OrganizationType;
          slug: string;
          settings: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: OrganizationType;
          slug: string;
          settings?: Record<string, unknown>;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
          locale: string;
          status: string;
          hub_banner: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          locale?: string;
          status?: string;
          hub_banner?: string | null;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: AppRole;
          status: MembershipStatus;
          joined_company_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: AppRole;
          status?: MembershipStatus;
          joined_company_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
        Relationships: [];
      };
      hub_banner_images: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          unlock_level: number;
          storage_path: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          unlock_level?: number;
          storage_path: string;
          created_by?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['hub_banner_images']['Insert']
        >;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string | null;
          email: string;
          role: AppRole;
          token_hash: string;
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id?: string | null;
          email: string;
          role: AppRole;
          token_hash: string;
          invited_by: string;
          expires_at: string;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']> & {
          accepted_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      loot_config: {
        Row: {
          organization_id: string;
          xp_per_coin: number;
          price_common: number;
          price_rare: number;
          price_super: number;
          image_common: string | null;
          image_rare: string | null;
          image_super: string | null;
          video_common: string | null;
          video_rare: string | null;
          video_super: string | null;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          xp_per_coin?: number;
          price_common?: number;
          price_rare?: number;
          price_super?: number;
          image_common?: string | null;
          image_rare?: string | null;
          image_super?: string | null;
          video_common?: string | null;
          video_rare?: string | null;
          video_super?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['loot_config']['Insert']>;
        Relationships: [];
      };
      loot_items: {
        Row: {
          id: string;
          organization_id: string;
          box_tier: string;
          name: string;
          description: string | null;
          type: string;
          weight: number;
          badge_emoji: string | null;
          badge_name: string | null;
          image_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          box_tier: string;
          name: string;
          description?: string | null;
          type: string;
          weight?: number;
          badge_emoji?: string | null;
          badge_name?: string | null;
          image_path?: string | null;
        };
        Update: Partial<Database['public']['Tables']['loot_items']['Insert']>;
        Relationships: [];
      };
      loot_wallets: {
        Row: {
          user_id: string;
          organization_id: string;
          coins_spent: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          coins_spent?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['loot_wallets']['Insert']>;
        Relationships: [];
      };
      loot_inventory: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          name: string;
          description: string | null;
          type: string;
          badge_emoji: string | null;
          badge_name: string | null;
          box_tier: string | null;
          image_path: string | null;
          status: string;
          won_at: string;
          redeemed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          name: string;
          description?: string | null;
          type: string;
          badge_emoji?: string | null;
          badge_name?: string | null;
          box_tier?: string | null;
          image_path?: string | null;
          status?: string;
          won_at?: string;
          redeemed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['loot_inventory']['Insert']>;
        Relationships: [];
      };
      loot_grants: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          box_tier: string;
          note: string | null;
          created_by: string | null;
          created_at: string;
          opened_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          box_tier: string;
          note?: string | null;
          created_by?: string | null;
          created_at?: string;
          opened_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['loot_grants']['Insert']>;
        Relationships: [];
      };
      xp_boosts: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          factor: number;
          banner_path: string | null;
          starts_at: string;
          ends_at: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title?: string;
          factor?: number;
          banner_path?: string | null;
          starts_at?: string;
          ends_at: string;
          active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['xp_boosts']['Insert']>;
        Relationships: [];
      };
      custom_challenges: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          description: string | null;
          emoji: string;
          metric: string;
          target: number;
          xp: number;
          kind: string;
          badge_key: string | null;
          badge_name: string | null;
          badge_emoji: string | null;
          week_start: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          description?: string | null;
          emoji?: string;
          metric: string;
          target: number;
          xp?: number;
          kind?: string;
          badge_key?: string | null;
          badge_name?: string | null;
          badge_emoji?: string | null;
          week_start: string;
          active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['custom_challenges']['Insert']>;
        Relationships: [];
      };
      client_news: {
        Row: {
          client_company_id: string;
          organization_id: string;
          items: unknown;
          fetched_at: string;
        };
        Insert: {
          client_company_id: string;
          organization_id: string;
          items?: unknown;
          fetched_at?: string;
        };
        Update: Partial<Database['public']['Tables']['client_news']['Insert']>;
        Relationships: [];
      };
      client_companies: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          contact_email: string | null;
          notes: string | null;
          industry: string | null;
          brands: string | null;
          interests: string | null;
          billing_entity_id: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          contact_email?: string | null;
          notes?: string | null;
          industry?: string | null;
          brands?: string | null;
          interests?: string | null;
          billing_entity_id?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['client_companies']['Insert']
        > & {
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      client_contacts: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          user_id: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          user_id: string;
          is_primary?: boolean;
        };
        Update: Partial<
          Database['public']['Tables']['client_contacts']['Insert']
        >;
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: ActivityAction;
          entity_type: string;
          entity_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_id?: string | null;
          action: ActivityAction;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
        Relationships: [];
      };
      ai_briefings: {
        Row: {
          id: string;
          user_id: string;
          briefing_date: string;
          summary: string;
          priorities: { title: string; reason: string }[];
          next_move: string | null;
          notes: string[];
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          briefing_date: string;
          summary: string;
          priorities?: { title: string; reason: string }[];
          next_move?: string | null;
          notes?: string[];
          model?: string | null;
        };
        Update: Partial<Database['public']['Tables']['ai_briefings']['Insert']>;
        Relationships: [];
      };
      employee_skills: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          name: string;
          level: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          name: string;
          level?: number;
        };
        Update: Partial<
          Database['public']['Tables']['employee_skills']['Insert']
        >;
        Relationships: [];
      };
      task_ratings: {
        Row: {
          id: string;
          organization_id: string;
          task_id: string;
          rater_user_id: string;
          stars: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          task_id: string;
          rater_user_id: string;
          stars: number;
        };
        Update: Partial<Database['public']['Tables']['task_ratings']['Insert']>;
        Relationships: [];
      };
      objectives: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          title: string;
          description: string | null;
          period: string | null;
          status: 'active' | 'done' | 'archived';
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          title: string;
          description?: string | null;
          period?: string | null;
          status?: 'active' | 'done' | 'archived';
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['objectives']['Insert']>;
        Relationships: [];
      };
      key_results: {
        Row: {
          id: string;
          objective_id: string;
          title: string;
          done: boolean;
          points: number;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          objective_id: string;
          title: string;
          done?: boolean;
          points?: number;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['key_results']['Insert']>;
        Relationships: [];
      };
      pulse_checks: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          week_start: string;
          mood: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          week_start: string;
          mood: number;
          comment?: string | null;
        };
        Update: Partial<Database['public']['Tables']['pulse_checks']['Insert']>;
        Relationships: [];
      };
      kudos: {
        Row: {
          id: string;
          organization_id: string;
          from_user_id: string;
          to_user_id: string;
          badge: string;
          message: string | null;
          points: number;
          task_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          from_user_id: string;
          to_user_id: string;
          badge: string;
          message?: string | null;
          points?: number;
          task_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['kudos']['Insert']>;
        Relationships: [];
      };
      award_snapshots: {
        Row: {
          id: string;
          organization_id: string;
          year: number;
          month: number;
          month_label: string;
          overall: Record<string, unknown> | null;
          quality: Record<string, unknown> | null;
          reliability: Record<string, unknown> | null;
          team: Record<string, unknown> | null;
          rows: Record<string, unknown>[];
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          year: number;
          month: number;
          month_label: string;
          overall?: unknown;
          quality?: unknown;
          reliability?: unknown;
          team?: unknown;
          rows?: unknown;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['award_snapshots']['Insert']>;
        Relationships: [];
      };
      client_satisfaction: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          month: string;
          rating: number;
          comment: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          month: string;
          rating: number;
          comment?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['client_satisfaction']['Insert']>;
        Relationships: [];
      };
      marketing_reports: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          period_label: string;
          period_start: string;
          ranking: string | null;
          sea: string | null;
          inquiries: string | null;
          summary: string | null;
          screenshots: { url: string; caption?: string }[];
          published: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          period_label: string;
          period_start: string;
          ranking?: string | null;
          sea?: string | null;
          inquiries?: string | null;
          summary?: string | null;
          screenshots?: unknown;
          published?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['marketing_reports']['Insert']>;
        Relationships: [];
      };
      inquiry_endpoints: {
        Row: {
          client_company_id: string;
          organization_id: string;
          token: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          client_company_id: string;
          organization_id: string;
          token?: string;
          enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['inquiry_endpoints']['Insert']>;
        Relationships: [];
      };
      web_inquiries: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          name: string | null;
          email: string | null;
          phone: string | null;
          subject: string | null;
          message: string | null;
          source: string | null;
          payload: Record<string, unknown>;
          status: 'new' | 'called' | 'mailed' | 'done';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          subject?: string | null;
          message?: string | null;
          source?: string | null;
          payload?: unknown;
          status?: 'new' | 'called' | 'mailed' | 'done';
        };
        Update: Partial<Database['public']['Tables']['web_inquiries']['Insert']>;
        Relationships: [];
      };
      inquiry_comments: {
        Row: {
          id: string;
          inquiry_id: string;
          organization_id: string;
          client_company_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          inquiry_id: string;
          organization_id: string;
          client_company_id: string;
          author_id?: string | null;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['inquiry_comments']['Insert']>;
        Relationships: [];
      };
      chat_channels: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          is_archived: boolean;
          kind: string;
          is_private: boolean;
          dm_key: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          is_archived?: boolean;
          kind?: string;
          is_private?: boolean;
          dm_key?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['chat_channels']['Insert']>;
        Relationships: [];
      };
      chat_channel_members: {
        Row: {
          channel_id: string;
          organization_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          channel_id: string;
          organization_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_channel_members']['Insert']>;
        Relationships: [];
      };
      chat_channel_messages: {
        Row: {
          id: string;
          channel_id: string;
          organization_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          organization_id: string;
          author_id?: string | null;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['chat_channel_messages']['Insert']>;
        Relationships: [];
      };
      chat_reads: {
        Row: {
          channel_id: string;
          user_id: string;
          organization_id: string;
          last_read_at: string;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          organization_id: string;
          last_read_at?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_reads']['Insert']>;
        Relationships: [];
      };
      calendar_feed_tokens: {
        Row: {
          user_id: string;
          organization_id: string;
          token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          token?: string;
        };
        Update: Partial<
          Database['public']['Tables']['calendar_feed_tokens']['Insert']
        >;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          contact_name: string;
          company: string | null;
          email: string | null;
          phone: string | null;
          source: string | null;
          note: string | null;
          estimated_value_cents: number | null;
          status: 'new' | 'contacted' | 'offer' | 'won' | 'lost';
          assigned_to: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_name: string;
          company?: string | null;
          email?: string | null;
          phone?: string | null;
          source?: string | null;
          note?: string | null;
          estimated_value_cents?: number | null;
          status?: 'new' | 'contacted' | 'offer' | 'won' | 'lost';
          assigned_to?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
        Relationships: [];
      };
      work_preferences: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          name: string;
          level: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          name: string;
          level?: number;
        };
        Update: Partial<
          Database['public']['Tables']['work_preferences']['Insert']
        >;
        Relationships: [];
      };
      xp_events: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          kind: string;
          points: number;
          task_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          kind: string;
          points: number;
          task_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['xp_events']['Insert']>;
        Relationships: [];
      };
      achievements: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          key: string;
          earned_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          key: string;
          earned_at?: string;
        };
        Update: Partial<Database['public']['Tables']['achievements']['Insert']>;
        Relationships: [];
      };
      user_counters: {
        Row: {
          user_id: string;
          organization_id: string;
          key: string;
          count: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          organization_id: string;
          key: string;
          count?: number;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_counters']['Insert']>;
        Relationships: [];
      };
      client_chat_messages: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          author_id: string;
          body: string;
        };
        Update: Partial<
          Database['public']['Tables']['client_chat_messages']['Insert']
        >;
        Relationships: [];
      };
      recurring_tasks: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          column_id: string;
          title: string;
          description: string | null;
          priority: TaskPriority;
          is_internal: boolean;
          frequency: 'weekly' | 'monthly';
          weekday: number | null;
          day_of_month: number | null;
          next_run_date: string;
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          column_id: string;
          title: string;
          description?: string | null;
          priority?: TaskPriority;
          is_internal?: boolean;
          frequency: 'weekly' | 'monthly';
          weekday?: number | null;
          day_of_month?: number | null;
          next_run_date: string;
          active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['recurring_tasks']['Insert']
        >;
        Relationships: [];
      };
      client_requests: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          submitted_by: string | null;
          body: string;
          suggestions: { title: string; description: string; priority: TaskPriority }[];
          status: 'new' | 'processed' | 'dismissed';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          submitted_by: string;
          body: string;
          suggestions?: { title: string; description: string; priority: TaskPriority }[];
          status?: 'new' | 'processed' | 'dismissed';
        };
        Update: Partial<
          Database['public']['Tables']['client_requests']['Insert']
        >;
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          event_date: string;
          start_time: string | null;
          end_time: string | null;
          client_company_id: string | null;
          location: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          event_date: string;
          start_time?: string | null;
          end_time?: string | null;
          client_company_id?: string | null;
          location?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['calendar_events']['Insert']
        >;
        Relationships: [];
      };
      absences: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          type: 'urlaub' | 'krank' | 'sonstiges';
          start_date: string;
          end_date: string;
          note: string | null;
          status: 'pending' | 'approved' | 'rejected';
          decided_by: string | null;
          decided_at: string | null;
          decision_comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          type?: 'urlaub' | 'krank' | 'sonstiges';
          start_date: string;
          end_date: string;
          note?: string | null;
          status?: 'pending' | 'approved' | 'rejected';
          decided_by?: string | null;
          decided_at?: string | null;
          decision_comment?: string | null;
        };
        Update: Partial<Database['public']['Tables']['absences']['Insert']>;
        Relationships: [];
      };
      project_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          tasks: {
            title: string;
            description: string;
            priority: TaskPriority;
            is_internal: boolean;
          }[];
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          tasks?: {
            title: string;
            description: string;
            priority: TaskPriority;
            is_internal: boolean;
          }[];
          created_by?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['project_templates']['Insert']
        >;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          lead_user_id: string | null;
          is_client_visible: boolean;
          start_date: string | null;
          due_date: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          lead_user_id?: string | null;
          is_client_visible?: boolean;
          start_date?: string | null;
          due_date?: string | null;
          created_by: string;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']> & {
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: ProjectMemberRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role: ProjectMemberRole;
        };
        Update: Partial<
          Database['public']['Tables']['project_members']['Insert']
        >;
        Relationships: [];
      };
      boards: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          name: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          name?: string;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['boards']['Insert']>;
        Relationships: [];
      };
      board_columns: {
        Row: {
          id: string;
          organization_id: string;
          board_id: string;
          name: string;
          column_key: ColumnKey;
          position: number;
          wip_limit: number | null;
          wip_limit_per_user: number | null;
          is_done_column: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          board_id: string;
          name: string;
          column_key?: ColumnKey;
          position: number;
          wip_limit?: number | null;
          wip_limit_per_user?: number | null;
          is_done_column?: boolean;
        };
        Update: Partial<
          Database['public']['Tables']['board_columns']['Insert']
        >;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          board_id: string;
          column_id: string;
          parent_task_id: string | null;
          title: string;
          description: string | null;
          priority: TaskPriority;
          created_by: string;
          due_date: string | null;
          estimated_minutes: number | null;
          actual_minutes: number;
          position: number;
          is_internal: boolean;
          is_blocked: boolean;
          is_archived: boolean;
          lock_version: number;
          column_entered_at: string;
          reopen_count: number;
          completed_by: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          board_id: string;
          column_id: string;
          parent_task_id?: string | null;
          title: string;
          description?: string | null;
          priority?: TaskPriority;
          created_by: string;
          due_date?: string | null;
          estimated_minutes?: number | null;
          actual_minutes?: number;
          position?: number;
          is_internal?: boolean;
          is_blocked?: boolean;
          is_archived?: boolean;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']> & {
          lock_version?: number;
          deleted_at?: string | null;
          completed_by?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      task_views: {
        Row: {
          id: string;
          task_id: string;
          organization_id: string;
          user_id: string;
          opened_at: string;
          dwell_seconds: number;
        };
        Insert: {
          id?: string;
          task_id: string;
          organization_id: string;
          user_id: string;
          opened_at?: string;
          dwell_seconds?: number;
        };
        Update: Partial<Database['public']['Tables']['task_views']['Insert']>;
        Relationships: [];
      };
      task_assignees: {
        Row: {
          task_id: string;
          user_id: string;
          organization_id: string;
          assigned_at: string;
        };
        Insert: {
          task_id: string;
          user_id: string;
          organization_id: string;
        };
        Update: Partial<
          Database['public']['Tables']['task_assignees']['Insert']
        >;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          author_id: string;
          body: string;
          is_internal: boolean;
          edited_at: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          task_id: string;
          author_id: string;
          body: string;
          is_internal?: boolean;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']> & {
          edited_at?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      comment_mentions: {
        Row: {
          comment_id: string;
          mentioned_user_id: string;
          organization_id: string;
        };
        Insert: {
          comment_id: string;
          mentioned_user_id: string;
          organization_id: string;
        };
        Update: Partial<
          Database['public']['Tables']['comment_mentions']['Insert']
        >;
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string;
          task_id: string | null;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          checksum_sha256: string | null;
          is_internal: boolean;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id: string;
          task_id?: string | null;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          checksum_sha256?: string | null;
          is_internal?: boolean;
        };
        Update: Partial<Database['public']['Tables']['files']['Insert']> & {
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      checklists: {
        Row: {
          id: string;
          organization_id: string;
          task_id: string;
          title: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          task_id: string;
          title: string;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['checklists']['Insert']>;
        Relationships: [];
      };
      checklist_items: {
        Row: {
          id: string;
          organization_id: string;
          checklist_id: string;
          content: string;
          is_done: boolean;
          position: number;
          done_by: string | null;
          done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          checklist_id: string;
          content: string;
          is_done?: boolean;
          position?: number;
          done_by?: string | null;
          done_at?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['checklist_items']['Insert']
        > & {
          done_by?: string | null;
          done_at?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          recipient_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          entity_type: string;
          entity_id: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          recipient_id: string;
          type: NotificationType;
          title: string;
          body?: string | null;
          entity_type: string;
          entity_id?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['notifications']['Insert']
        > & {
          is_read?: boolean;
          read_at?: string | null;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string;
          description: string | null;
          is_active: boolean;
          is_client_visible: boolean;
          intensity: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          color: string;
          description?: string | null;
          is_active?: boolean;
          is_client_visible?: boolean;
          intensity?: number;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['labels']['Insert']>;
        Relationships: [];
      };
      task_labels: {
        Row: {
          task_id: string;
          label_id: string;
          organization_id: string;
        };
        Insert: {
          task_id: string;
          label_id: string;
          organization_id: string;
        };
        Update: Partial<Database['public']['Tables']['task_labels']['Insert']>;
        Relationships: [];
      };
      time_entries: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          task_id: string | null;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          duration_minutes: number | null;
          description: string | null;
          is_billable: boolean;
          is_client_visible: boolean;
          source: TimeSource;
          created_by: string;
          edit_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          task_id?: string | null;
          user_id: string;
          started_at: string;
          ended_at?: string | null;
          duration_minutes?: number | null;
          description?: string | null;
          is_billable?: boolean;
          is_client_visible?: boolean;
          source?: TimeSource;
          created_by: string;
          edit_reason?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['time_entries']['Insert']
        >;
        Relationships: [];
      };
      work_sessions: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          clock_in: string;
          clock_out: string | null;
          status: WorkSessionStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          clock_in: string;
          clock_out?: string | null;
          status?: WorkSessionStatus;
        };
        Update: Partial<
          Database['public']['Tables']['work_sessions']['Insert']
        >;
        Relationships: [];
      };
      work_session_breaks: {
        Row: {
          id: string;
          work_session_id: string;
          organization_id: string;
          break_start: string;
          break_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          work_session_id: string;
          organization_id: string;
          break_start: string;
          break_end?: string | null;
        };
        Update: Partial<
          Database['public']['Tables']['work_session_breaks']['Insert']
        >;
        Relationships: [];
      };
      approvals: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          task_id: string;
          title: string;
          status: ApprovalStatus;
          requested_by: string;
          decided_by: string | null;
          decision_comment: string | null;
          target_column_id: string | null;
          decided_at: string | null;
          last_reminder_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          client_company_id: string;
          project_id: string;
          task_id: string;
          title: string;
          status?: ApprovalStatus;
          requested_by: string;
          target_column_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['approvals']['Insert']> & {
          status?: ApprovalStatus;
          decided_by?: string | null;
          decision_comment?: string | null;
          decided_at?: string | null;
          last_reminder_at?: string | null;
        };
        Relationships: [];
      };
      billing_settings: {
        Row: {
          organization_id: string;
          company_name: string | null;
          address_line1: string | null;
          address_line2: string | null;
          postal_code: string | null;
          city: string | null;
          country: string;
          vat_id: string | null;
          tax_number: string | null;
          contact_email: string | null;
          phone: string | null;
          website: string | null;
          iban: string | null;
          bic: string | null;
          bank_name: string | null;
          creditor_id: string | null;
          logo_path: string | null;
          invoice_prefix: string;
          invoice_next_number: number;
          invoice_reset_yearly: boolean;
          invoice_number_year: number | null;
          invoice_number_padding: number;
          default_tax_rate: number;
          small_business: boolean;
          payment_terms_text: string;
          invoice_footer: string | null;
          stage1_name: string;
          stage1_net_cents: number;
          stage2_name: string;
          stage2_net_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
        } & Partial<
          Omit<
            Database['public']['Tables']['billing_settings']['Row'],
            'organization_id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<
          Database['public']['Tables']['billing_settings']['Insert']
        >;
        Relationships: [];
      };
      billing_entities: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          is_default: boolean;
        } & Omit<
          Database['public']['Tables']['billing_settings']['Row'],
          'organization_id'
        >;
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          is_default?: boolean;
        } & Partial<
          Omit<
            Database['public']['Tables']['billing_settings']['Row'],
            'organization_id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<
          Database['public']['Tables']['billing_entities']['Insert']
        >;
        Relationships: [];
      };
      client_memberships: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          stage: number;
          custom_name: string | null;
          custom_net_cents: number | null;
          interval_months: number;
          billing_day: number;
          payment_method: MembershipPaymentMethod;
          status: MembershipBillingStatus;
          start_date: string;
          next_invoice_date: string | null;
          auto_send: boolean;
          mandate_reference: string | null;
          mandate_date: string | null;
          debtor_iban: string | null;
          debtor_bic: string | null;
          billing_name: string | null;
          billing_address_line1: string | null;
          billing_address_line2: string | null;
          billing_postal_code: string | null;
          billing_city: string | null;
          billing_country: string;
          billing_vat_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          client_company_id: string;
        } & Partial<
          Omit<
            Database['public']['Tables']['client_memberships']['Row'],
            'id' | 'organization_id' | 'client_company_id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<
          Database['public']['Tables']['client_memberships']['Insert']
        >;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          organization_id: string;
          client_company_id: string;
          membership_id: string | null;
          billing_entity_id: string | null;
          invoice_number: string | null;
          status: InvoiceStatus;
          issue_date: string | null;
          service_period_start: string | null;
          service_period_end: string | null;
          due_date: string | null;
          currency: string;
          net_cents: number;
          tax_rate: number;
          tax_cents: number;
          gross_cents: number;
          payment_method: MembershipPaymentMethod | null;
          pdf_path: string | null;
          notes: string | null;
          sent_at: string | null;
          paid_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          client_company_id: string;
        } & Partial<
          Omit<
            Database['public']['Tables']['invoices']['Row'],
            'id' | 'organization_id' | 'client_company_id' | 'created_at' | 'updated_at'
          >
        >;
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
        Relationships: [];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          position: number;
          description: string;
          quantity: number;
          unit_net_cents: number;
          tax_rate: number;
          net_cents: number;
        };
        Insert: {
          invoice_id: string;
          description: string;
        } & Partial<
          Omit<
            Database['public']['Tables']['invoice_items']['Row'],
            'id' | 'invoice_id' | 'description'
          >
        >;
        Update: Partial<
          Database['public']['Tables']['invoice_items']['Insert']
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      chat_unread_counts: {
        Args: Record<string, never>;
        Returns: { channel_id: string; unread: number }[];
      };
      move_task: {
        Args: {
          p_task_id: string;
          p_target_column_id: string;
          p_new_position: number;
          p_expected_lock_version: number;
        };
        Returns: undefined;
      };
      bump_counter: {
        Args: { p_key: string; p_org: string };
        Returns: undefined;
      };
      can_access_project: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      can_manage_project: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      whoami: {
        Args: Record<string, never>;
        Returns: {
          uid: string | null;
          is_super_admin: boolean;
          is_agency_staff: boolean;
          memberships: {
            organization_id: string;
            role: string;
            status: string;
          }[];
        };
      };
    };
    Enums: {
      app_role: AppRole;
      organization_type: OrganizationType;
      membership_status: MembershipStatus;
      activity_action: ActivityAction;
      project_status: ProjectStatus;
      project_member_role: ProjectMemberRole;
      task_priority: TaskPriority;
      column_key: ColumnKey;
      notification_type: NotificationType;
      membership_payment_method: MembershipPaymentMethod;
      membership_billing_status: MembershipBillingStatus;
      invoice_status: InvoiceStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
