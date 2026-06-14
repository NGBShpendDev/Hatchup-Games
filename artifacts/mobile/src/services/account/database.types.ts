export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    CompositeTypes: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Tables: {
      account_settings: {
        Row: {
          analytics_enabled: boolean;
          cloud_sync_enabled: boolean;
          crash_reporting_enabled: boolean;
          created_at: string;
          health_connected: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: Partial<Database["public"]["Tables"]["account_settings"]["Row"]> & {
          user_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["account_settings"]["Row"]>;
      };
      hatchup_saves: {
        Row: {
          created_at: string;
          id: string;
          save_data: Json;
          schema_version: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          save_data: Json;
          schema_version: number;
          updated_at?: string;
          user_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["hatchup_saves"]["Insert"]>;
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          leaderboard_share_enabled: boolean;
          onboarding_status: string | null;
          privacy_consent_version: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
    };
    Views: {
      [_ in never]: never;
    };
  };
}
