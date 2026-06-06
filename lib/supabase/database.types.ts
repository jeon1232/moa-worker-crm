export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string | null;
          kakao_display_name: string | null;
          role: "admin" | "sub_admin" | "worker";
          created_at: string | null;
        };
        Insert: {
          id: string;
          name?: string | null;
          kakao_display_name?: string | null;
          role?: "admin" | "sub_admin" | "worker";
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      login_allowlist: {
        Row: {
          email: string;
          name: string | null;
          role: "admin" | "sub_admin" | "worker";
          active: boolean;
          created_at: string | null;
        };
        Insert: {
          email: string;
          name?: string | null;
          role?: "admin" | "sub_admin" | "worker";
          active?: boolean;
          created_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["login_allowlist"]["Insert"]>;
        Relationships: [];
      };
      access_requests: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          requested_role: "admin" | "sub_admin" | "worker";
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          requested_role?: "admin" | "sub_admin" | "worker";
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["access_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "access_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      customers: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          business_no: string | null;
          kakao_business_id: string | null;
          kakao_business_password: string | null;
          moa_solution_id: string | null;
          moa_solution_password: string | null;
          selected_option: "tablet" | "qr" | null;
          option_tablet: boolean | null;
          option_qr: boolean | null;
          business_progress_status: "진행중" | "카카오비즈니스 채널 개설 완료" | null;
          business_auth_done: boolean | null;
          needs_tablet: boolean | null;
          tablet_shipped: boolean | null;
          tablet_shipped_at: string | null;
          tablet_billed: boolean | null;
          qr_billed: boolean | null;
          service_fee_billed: boolean | null;
          assigned_worker_id: string | null;
          status: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          business_no?: string | null;
          kakao_business_id?: string | null;
          kakao_business_password?: string | null;
          moa_solution_id?: string | null;
          moa_solution_password?: string | null;
          selected_option?: "tablet" | "qr" | null;
          option_tablet?: boolean | null;
          option_qr?: boolean | null;
          business_progress_status?: "진행중" | "카카오비즈니스 채널 개설 완료" | null;
          business_auth_done?: boolean | null;
          needs_tablet?: boolean | null;
          tablet_shipped?: boolean | null;
          tablet_shipped_at?: string | null;
          tablet_billed?: boolean | null;
          qr_billed?: boolean | null;
          service_fee_billed?: boolean | null;
          assigned_worker_id?: string | null;
          status?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customers_assigned_worker_id_fkey";
            columns: ["assigned_worker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_delete_requests: {
        Row: {
          id: string;
          customer_id: string;
          requested_by: string;
          reason: string | null;
          status: "pending" | "approved" | "rejected";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id: string;
          requested_by: string;
          reason?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customer_delete_requests"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customer_delete_requests_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_delete_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_delete_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_documents: {
        Row: {
          id: string;
          customer_id: string | null;
          document_type: "사업자등록증" | "신분증" | null;
          file_path: string;
          uploaded_by: string | null;
          uploaded_at: string | null;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          document_type?: "사업자등록증" | "신분증" | null;
          file_path: string;
          uploaded_by?: string | null;
          uploaded_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customer_documents"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      delete_customer_submission: {
        Args: { target_customer_id: string };
        Returns: string[];
      };
      request_customer_delete: {
        Args: { target_customer_id: string; request_reason?: string | null };
        Returns: void;
      };
      submit_access_request: {
        Args: { request_name?: string | null; request_role?: "admin" | "sub_admin" | "worker" };
        Returns: void;
      };
      sync_profile_from_allowlist: {
        Args: { target_email: string };
        Returns: void;
      };
      update_worker_display_name: {
        Args: { target_worker_id: string; display_name: string };
        Returns: void;
      };
      update_customer_worker_progress: {
        Args: {
          target_customer_id: string;
          customer_address?: string | null;
          kakao_id?: string | null;
          kakao_password?: string | null;
          moa_id?: string | null;
          moa_password?: string | null;
          progress_status?: "진행중" | "카카오비즈니스 채널 개설 완료";
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
