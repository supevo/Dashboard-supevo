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
  | 'member_reactivate';

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      app_role: AppRole;
      organization_type: OrganizationType;
      membership_status: MembershipStatus;
      activity_action: ActivityAction;
    };
    CompositeTypes: Record<string, never>;
  };
}
