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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          avatar_url?: string | null;
          locale?: string;
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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: AppRole;
          status?: MembershipStatus;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
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
      client_companies: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          contact_email: string | null;
          notes: string | null;
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
        };
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
    };
    Views: Record<string, never>;
    Functions: {
      move_task: {
        Args: {
          p_task_id: string;
          p_target_column_id: string;
          p_new_position: number;
          p_expected_lock_version: number;
        };
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
    };
    CompositeTypes: Record<string, never>;
  };
}
