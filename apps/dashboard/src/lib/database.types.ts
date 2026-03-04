export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      jobs: {
        Row: {
          id: string;
          title: string;
          company: string;
          location: string | null;
          salary_min: number | null;
          salary_max: number | null;
          job_type:
            | "full-time"
            | "part-time"
            | "contract"
            | "freelance"
            | null;
          work_mode: "remote" | "hybrid" | "on-site" | null;
          description: string | null;
          requirements: string | null;
          url: string | null;
          platform:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          posting_date: string | null;
          deadline: string | null;
          skills_required: Json;
          experience_required: number | null;
          match_score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          company: string;
          location?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          job_type?:
            | "full-time"
            | "part-time"
            | "contract"
            | "freelance"
            | null;
          work_mode?: "remote" | "hybrid" | "on-site" | null;
          description?: string | null;
          requirements?: string | null;
          url?: string | null;
          platform:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          posting_date?: string | null;
          deadline?: string | null;
          skills_required?: Json;
          experience_required?: number | null;
          match_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          company?: string;
          location?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          job_type?:
            | "full-time"
            | "part-time"
            | "contract"
            | "freelance"
            | null;
          work_mode?: "remote" | "hybrid" | "on-site" | null;
          description?: string | null;
          requirements?: string | null;
          url?: string | null;
          platform?:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          posting_date?: string | null;
          deadline?: string | null;
          skills_required?: Json;
          experience_required?: number | null;
          match_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          job_id: string | null;
          platform:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          status:
            | "interested"
            | "applied"
            | "phone_screen"
            | "interview"
            | "final"
            | "offer"
            | "hired"
            | "rejected"
            | "withdrawn";
          cover_letter: string | null;
          proposal_text: string | null;
          resume_version: string | null;
          application_date: string | null;
          last_contact_date: string | null;
          next_followup_date: string | null;
          priority: number;
          source: string | null;
          referral_contact: string | null;
          salary_expectation: number | null;
          notes: string | null;
          match_score: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id?: string | null;
          platform:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          status?:
            | "interested"
            | "applied"
            | "phone_screen"
            | "interview"
            | "final"
            | "offer"
            | "hired"
            | "rejected"
            | "withdrawn";
          cover_letter?: string | null;
          proposal_text?: string | null;
          resume_version?: string | null;
          application_date?: string | null;
          last_contact_date?: string | null;
          next_followup_date?: string | null;
          priority?: number;
          source?: string | null;
          referral_contact?: string | null;
          salary_expectation?: number | null;
          notes?: string | null;
          match_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string | null;
          platform?:
            | "linkedin"
            | "indeed"
            | "upwork"
            | "fiverr"
            | "direct"
            | "referral"
            | "other";
          status?:
            | "interested"
            | "applied"
            | "phone_screen"
            | "interview"
            | "final"
            | "offer"
            | "hired"
            | "rejected"
            | "withdrawn";
          cover_letter?: string | null;
          proposal_text?: string | null;
          resume_version?: string | null;
          application_date?: string | null;
          last_contact_date?: string | null;
          next_followup_date?: string | null;
          priority?: number;
          source?: string | null;
          referral_contact?: string | null;
          salary_expectation?: number | null;
          notes?: string | null;
          match_score?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      freelance_proposals: {
        Row: {
          id: string;
          application_id: string | null;
          platform: "upwork" | "fiverr" | "direct";
          project_title: string;
          project_url: string | null;
          client_name: string | null;
          client_country: string | null;
          budget_min: number | null;
          budget_max: number | null;
          budget_type: "fixed" | "hourly" | null;
          proposal_text: string | null;
          bid_amount: number | null;
          estimated_duration: string | null;
          status:
            | "draft"
            | "submitted"
            | "viewed"
            | "shortlisted"
            | "interview"
            | "hired"
            | "rejected"
            | "withdrawn";
          submitted_at: string | null;
          response_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          platform: "upwork" | "fiverr" | "direct";
          project_title: string;
          project_url?: string | null;
          client_name?: string | null;
          client_country?: string | null;
          budget_min?: number | null;
          budget_max?: number | null;
          budget_type?: "fixed" | "hourly" | null;
          proposal_text?: string | null;
          bid_amount?: number | null;
          estimated_duration?: string | null;
          status?:
            | "draft"
            | "submitted"
            | "viewed"
            | "shortlisted"
            | "interview"
            | "hired"
            | "rejected"
            | "withdrawn";
          submitted_at?: string | null;
          response_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          platform?: "upwork" | "fiverr" | "direct";
          project_title?: string;
          project_url?: string | null;
          client_name?: string | null;
          client_country?: string | null;
          budget_min?: number | null;
          budget_max?: number | null;
          budget_type?: "fixed" | "hourly" | null;
          proposal_text?: string | null;
          bid_amount?: number | null;
          estimated_duration?: string | null;
          status?:
            | "draft"
            | "submitted"
            | "viewed"
            | "shortlisted"
            | "interview"
            | "hired"
            | "rejected"
            | "withdrawn";
          submitted_at?: string | null;
          response_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "freelance_proposals_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          id: string;
          name: string;
          company: string | null;
          email: string | null;
          platform: "upwork" | "fiverr" | "direct" | "referral" | null;
          platform_profile_url: string | null;
          relationship_started: string | null;
          total_revenue: number;
          status: "lead" | "active" | "paused" | "completed" | "churned";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company?: string | null;
          email?: string | null;
          platform?: "upwork" | "fiverr" | "direct" | "referral" | null;
          platform_profile_url?: string | null;
          relationship_started?: string | null;
          total_revenue?: number;
          status?: "lead" | "active" | "paused" | "completed" | "churned";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company?: string | null;
          email?: string | null;
          platform?: "upwork" | "fiverr" | "direct" | "referral" | null;
          platform_profile_url?: string | null;
          relationship_started?: string | null;
          total_revenue?: number;
          status?: "lead" | "active" | "paused" | "completed" | "churned";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          position: string | null;
          linkedin_url: string | null;
          relationship:
            | "recruiter"
            | "hiring_manager"
            | "employee"
            | "referral"
            | "client"
            | "networking"
            | null;
          notes: string | null;
          last_contact_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          position?: string | null;
          linkedin_url?: string | null;
          relationship?:
            | "recruiter"
            | "hiring_manager"
            | "employee"
            | "referral"
            | "client"
            | "networking"
            | null;
          notes?: string | null;
          last_contact_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          position?: string | null;
          linkedin_url?: string | null;
          relationship?:
            | "recruiter"
            | "hiring_manager"
            | "employee"
            | "referral"
            | "client"
            | "networking"
            | null;
          notes?: string | null;
          last_contact_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_logs: {
        Row: {
          id: string;
          action_type:
            | "job_search"
            | "application_submit"
            | "proposal_submit"
            | "email_send"
            | "follow_up"
            | "profile_update"
            | "calendar_sync";
          platform: string | null;
          success: boolean;
          details: Json;
          error_message: string | null;
          execution_time_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          action_type:
            | "job_search"
            | "application_submit"
            | "proposal_submit"
            | "email_send"
            | "follow_up"
            | "profile_update"
            | "calendar_sync";
          platform?: string | null;
          success?: boolean;
          details?: Json;
          error_message?: string | null;
          execution_time_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action_type?:
            | "job_search"
            | "application_submit"
            | "proposal_submit"
            | "email_send"
            | "follow_up"
            | "profile_update"
            | "calendar_sync";
          platform?: string | null;
          success?: boolean;
          details?: Json;
          error_message?: string | null;
          execution_time_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          application_id: string | null;
          client_id: string | null;
          event_type:
            | "interview"
            | "follow_up"
            | "deadline"
            | "client_call"
            | "networking";
          title: string;
          description: string | null;
          start_time: string;
          end_time: string | null;
          location: string | null;
          meeting_url: string | null;
          cal_com_event_id: string | null;
          status: "scheduled" | "completed" | "cancelled" | "rescheduled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          client_id?: string | null;
          event_type:
            | "interview"
            | "follow_up"
            | "deadline"
            | "client_call"
            | "networking";
          title: string;
          description?: string | null;
          start_time: string;
          end_time?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          cal_com_event_id?: string | null;
          status?: "scheduled" | "completed" | "cancelled" | "rescheduled";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          client_id?: string | null;
          event_type?:
            | "interview"
            | "follow_up"
            | "deadline"
            | "client_call"
            | "networking";
          title?: string;
          description?: string | null;
          start_time?: string;
          end_time?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          cal_com_event_id?: string | null;
          status?: "scheduled" | "completed" | "cancelled" | "rescheduled";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calendar_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      outreach_sequences: {
        Row: {
          id: string;
          application_id: string | null;
          contact_id: string | null;
          sequence_type:
            | "job_followup"
            | "cold_outreach"
            | "networking"
            | "client_followup";
          current_step: number;
          max_steps: number;
          status: "active" | "paused" | "completed" | "replied" | "bounced";
          next_send_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          contact_id?: string | null;
          sequence_type:
            | "job_followup"
            | "cold_outreach"
            | "networking"
            | "client_followup";
          current_step?: number;
          max_steps?: number;
          status?: "active" | "paused" | "completed" | "replied" | "bounced";
          next_send_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          contact_id?: string | null;
          sequence_type?:
            | "job_followup"
            | "cold_outreach"
            | "networking"
            | "client_followup";
          current_step?: number;
          max_steps?: number;
          status?: "active" | "paused" | "completed" | "replied" | "bounced";
          next_send_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outreach_sequences_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "outreach_sequences_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience type aliases
export type Job = Database["public"]["Tables"]["jobs"]["Row"];
export type Application = Database["public"]["Tables"]["applications"]["Row"];
export type FreelanceProposal =
  Database["public"]["Tables"]["freelance_proposals"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type AutomationLog =
  Database["public"]["Tables"]["automation_logs"]["Row"];
export type CalendarEvent =
  Database["public"]["Tables"]["calendar_events"]["Row"];
export type OutreachSequence =
  Database["public"]["Tables"]["outreach_sequences"]["Row"];

// Application with joined job data
export type ApplicationWithJob = Application & {
  jobs: Pick<
    Job,
    "title" | "company" | "location" | "salary_min" | "salary_max" | "work_mode"
  > | null;
};
