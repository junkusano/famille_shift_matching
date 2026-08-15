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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      _tmp_restore_documents: {
        Row: {
          documents: Json
          info_id: string
        }
        Insert: {
          documents: Json
          info_id: string
        }
        Update: {
          documents?: Json
          info_id?: string
        }
        Relationships: []
      }
      alert_log: {
        Row: {
          assigned_org_id: string | null
          assigned_to: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          kaipoke_cs_id: string | null
          message: string
          result_comment: string | null
          result_comment_at: string | null
          result_comment_by: string | null
          rpa_request_id: string | null
          severity: number
          shift_id: string | null
          status: string
          status_source: string
          updated_at: string
          user_id: string | null
          visible_roles: string[]
        }
        Insert: {
          assigned_org_id?: string | null
          assigned_to?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          message: string
          result_comment?: string | null
          result_comment_at?: string | null
          result_comment_by?: string | null
          rpa_request_id?: string | null
          severity?: number
          shift_id?: string | null
          status?: string
          status_source?: string
          updated_at?: string
          user_id?: string | null
          visible_roles?: string[]
        }
        Update: {
          assigned_org_id?: string | null
          assigned_to?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          message?: string
          result_comment?: string | null
          result_comment_at?: string | null
          result_comment_by?: string | null
          rpa_request_id?: string | null
          severity?: number
          shift_id?: string | null
          status?: string
          status_source?: string
          updated_at?: string
          user_id?: string | null
          visible_roles?: string[]
        }
        Relationships: []
      }
      api_shift_coord_log: {
        Row: {
          accompany: boolean | null
          created_at: string
          error: string | null
          id: number
          path: string
          requested_by_user_id: string | null
          requester_auth_id: string | null
          shift_id: number | null
          stages: Json | null
        }
        Insert: {
          accompany?: boolean | null
          created_at?: string
          error?: string | null
          id?: number
          path: string
          requested_by_user_id?: string | null
          requester_auth_id?: string | null
          shift_id?: number | null
          stages?: Json | null
        }
        Update: {
          accompany?: boolean | null
          created_at?: string
          error?: string | null
          id?: number
          path?: string
          requested_by_user_id?: string | null
          requester_auth_id?: string | null
          shift_id?: number | null
          stages?: Json | null
        }
        Relationships: []
      }
      assessments_records: {
        Row: {
          assessed_on: string
          assessment_id: string
          author_name: string
          author_user_id: string
          client_info_id: string
          content: Json
          created_at: string
          is_deleted: boolean
          kaipoke_cs_id: string
          meeting_minutes: string | null
          meeting_minutes_meta: Json
          meeting_minutes_updated_at: string | null
          meeting_minutes_updated_by: string | null
          service_kind: string
          updated_at: string
        }
        Insert: {
          assessed_on?: string
          assessment_id?: string
          author_name: string
          author_user_id: string
          client_info_id: string
          content?: Json
          created_at?: string
          is_deleted?: boolean
          kaipoke_cs_id: string
          meeting_minutes?: string | null
          meeting_minutes_meta?: Json
          meeting_minutes_updated_at?: string | null
          meeting_minutes_updated_by?: string | null
          service_kind: string
          updated_at?: string
        }
        Update: {
          assessed_on?: string
          assessment_id?: string
          author_name?: string
          author_user_id?: string
          client_info_id?: string
          content?: Json
          created_at?: string
          is_deleted?: boolean
          kaipoke_cs_id?: string
          meeting_minutes?: string | null
          meeting_minutes_meta?: Json
          meeting_minutes_updated_at?: string | null
          meeting_minutes_updated_by?: string | null
          service_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_records_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_records_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_records_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
        ]
      }
      audit_error_log: {
        Row: {
          action: string
          created_at: string
          error_detail: string | null
          error_hint: string | null
          error_message: string
          id: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string
          error_detail?: string | null
          error_hint?: string | null
          error_message: string
          id?: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string
          error_detail?: string | null
          error_hint?: string | null
          error_message?: string
          id?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_row: Json | null
          before_row: Json | null
          change_reason: string | null
          changed_cols: string[] | null
          created_at: string
          event_type: string | null
          id: string
          penalty_level: string | null
          record_id: string | null
          request_path: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_row?: Json | null
          before_row?: Json | null
          change_reason?: string | null
          changed_cols?: string[] | null
          created_at?: string
          event_type?: string | null
          id?: string
          penalty_level?: string | null
          record_id?: string | null
          request_path?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_row?: Json | null
          before_row?: Json | null
          change_reason?: string | null
          changed_cols?: string[] | null
          created_at?: string
          event_type?: string | null
          id?: string
          penalty_level?: string | null
          record_id?: string | null
          request_path?: string | null
          table_name?: string
        }
        Relationships: []
      }
      bento_pickup_locations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      bento_survey_menus: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          survey_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          survey_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bento_survey_menus_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "bento_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_survey_responses: {
        Row: {
          id: string
          menu_id: string | null
          option_text: string | null
          pickup_location_id: string | null
          received_at: string | null
          submitted_at: string
          survey_id: string
          updated_at: string
          user_id: string
          wants_bento: boolean
        }
        Insert: {
          id?: string
          menu_id?: string | null
          option_text?: string | null
          pickup_location_id?: string | null
          received_at?: string | null
          submitted_at?: string
          survey_id: string
          updated_at?: string
          user_id: string
          wants_bento?: boolean
        }
        Update: {
          id?: string
          menu_id?: string | null
          option_text?: string | null
          pickup_location_id?: string | null
          received_at?: string | null
          submitted_at?: string
          survey_id?: string
          updated_at?: string
          user_id?: string
          wants_bento?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bento_survey_responses_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "bento_survey_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_survey_responses_pickup_location_id_fkey"
            columns: ["pickup_location_id"]
            isOneToOne: false
            referencedRelation: "bento_pickup_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bento_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "bento_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      bento_surveys: {
        Row: {
          allow_edit_after_submit: boolean
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          id: string
          is_active: boolean
          notes: string | null
          published_at: string | null
          response_deadline: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          allow_edit_after_submit?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date: string
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string | null
          response_deadline: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          allow_edit_after_submit?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          published_at?: string | null
          response_deadline?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      biz_stats_defect_sum: {
        Row: {
          avg_3m: number | null
          id: string
          meta: Json
          metric: string
          orgunitid: string
          orgunitname: string
          snapshot_at: string
          snapshot_month: string
          value: number
          year_month: string
        }
        Insert: {
          avg_3m?: number | null
          id?: string
          meta?: Json
          metric: string
          orgunitid: string
          orgunitname: string
          snapshot_at?: string
          snapshot_month: string
          value: number
          year_month: string
        }
        Update: {
          avg_3m?: number | null
          id?: string
          meta?: Json
          metric?: string
          orgunitid?: string
          orgunitname?: string
          snapshot_at?: string
          snapshot_month?: string
          value?: number
          year_month?: string
        }
        Relationships: []
      }
      biz_stats_shift_sum: {
        Row: {
          avg_3m: number | null
          id: string
          meta: Json
          metric: string
          orgunitid: string
          orgunitname: string
          snapshot_at: string
          snapshot_month: string
          value: number
          year_month: string
        }
        Insert: {
          avg_3m?: number | null
          id?: string
          meta?: Json
          metric: string
          orgunitid: string
          orgunitname: string
          snapshot_at?: string
          snapshot_month: string
          value: number
          year_month: string
        }
        Update: {
          avg_3m?: number | null
          id?: string
          meta?: Json
          metric?: string
          orgunitid?: string
          orgunitname?: string
          snapshot_at?: string
          snapshot_month?: string
          value?: number
          year_month?: string
        }
        Relationships: []
      }
      cm_alert_batch_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          run_type: string
          started_at: string
          stats: Json
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          run_type: string
          started_at?: string
          stats?: Json
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          run_type?: string
          started_at?: string
          stats?: Json
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      cm_alerts: {
        Row: {
          alert_type: string
          batch_run_id: string | null
          category: string
          client_name: string
          created_at: string
          details: Json
          id: string
          kaipoke_cs_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          updated_at: string
        }
        Insert: {
          alert_type: string
          batch_run_id?: string | null
          category: string
          client_name: string
          created_at?: string
          details?: Json
          id?: string
          kaipoke_cs_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string
        }
        Update: {
          alert_type?: string
          batch_run_id?: string | null
          category?: string
          client_name?: string
          created_at?: string
          details?: Json
          id?: string
          kaipoke_cs_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cm_contract_consents: {
        Row: {
          agent_authority: string | null
          agent_name: string | null
          agent_relationship_code: string | null
          agent_relationship_other: string | null
          consent_electronic: boolean
          consent_recording: boolean
          consented_at: string
          created_at: string
          gdrive_file_id: string | null
          gdrive_file_path: string | null
          gdrive_file_url: string | null
          guardian_confirmed: boolean | null
          guardian_notes: string | null
          guardian_type: string | null
          id: string
          ip_address: string | null
          kaipoke_cs_id: string
          scribe_name: string | null
          scribe_reason_code: string | null
          scribe_reason_other: string | null
          scribe_relationship_code: string | null
          scribe_relationship_other: string | null
          signer_type: string
          staff_id: string
          user_agent: string | null
        }
        Insert: {
          agent_authority?: string | null
          agent_name?: string | null
          agent_relationship_code?: string | null
          agent_relationship_other?: string | null
          consent_electronic?: boolean
          consent_recording?: boolean
          consented_at?: string
          created_at?: string
          gdrive_file_id?: string | null
          gdrive_file_path?: string | null
          gdrive_file_url?: string | null
          guardian_confirmed?: boolean | null
          guardian_notes?: string | null
          guardian_type?: string | null
          id?: string
          ip_address?: string | null
          kaipoke_cs_id: string
          scribe_name?: string | null
          scribe_reason_code?: string | null
          scribe_reason_other?: string | null
          scribe_relationship_code?: string | null
          scribe_relationship_other?: string | null
          signer_type: string
          staff_id: string
          user_agent?: string | null
        }
        Update: {
          agent_authority?: string | null
          agent_name?: string | null
          agent_relationship_code?: string | null
          agent_relationship_other?: string | null
          consent_electronic?: boolean
          consent_recording?: boolean
          consented_at?: string
          created_at?: string
          gdrive_file_id?: string | null
          gdrive_file_path?: string | null
          gdrive_file_url?: string | null
          guardian_confirmed?: boolean | null
          guardian_notes?: string | null
          guardian_type?: string | null
          id?: string
          ip_address?: string | null
          kaipoke_cs_id?: string
          scribe_name?: string | null
          scribe_reason_code?: string | null
          scribe_reason_other?: string | null
          scribe_relationship_code?: string | null
          scribe_relationship_other?: string | null
          signer_type?: string
          staff_id?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      cm_contract_document_signers: {
        Row: {
          created_at: string
          document_id: string
          id: string
          role: string
          signed_at: string | null
          signer_email: string | null
          signer_name: string | null
          signing_status: string
          signing_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          role: string
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signing_status?: string
          signing_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          role?: string
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signing_status?: string
          signing_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_contract_document_signers_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "cm_contract_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_contract_documents: {
        Row: {
          all_signed_at: string | null
          contract_id: string
          created_at: string
          digisigner_document_id: string | null
          digisigner_signature_request_id: string | null
          document_name: string
          document_type: string
          gdrive_file_id: string | null
          gdrive_file_path: string | null
          gdrive_file_url: string | null
          id: string
          signed_gdrive_file_id: string | null
          signed_gdrive_file_url: string | null
          signed_uploaded_at: string | null
          signing_status: string
          sort_order: number
          unsigned_gdrive_file_id: string | null
          unsigned_gdrive_file_url: string | null
          updated_at: string
        }
        Insert: {
          all_signed_at?: string | null
          contract_id: string
          created_at?: string
          digisigner_document_id?: string | null
          digisigner_signature_request_id?: string | null
          document_name: string
          document_type: string
          gdrive_file_id?: string | null
          gdrive_file_path?: string | null
          gdrive_file_url?: string | null
          id?: string
          signed_gdrive_file_id?: string | null
          signed_gdrive_file_url?: string | null
          signed_uploaded_at?: string | null
          signing_status?: string
          sort_order?: number
          unsigned_gdrive_file_id?: string | null
          unsigned_gdrive_file_url?: string | null
          updated_at?: string
        }
        Update: {
          all_signed_at?: string | null
          contract_id?: string
          created_at?: string
          digisigner_document_id?: string | null
          digisigner_signature_request_id?: string | null
          document_name?: string
          document_type?: string
          gdrive_file_id?: string | null
          gdrive_file_path?: string | null
          gdrive_file_url?: string | null
          id?: string
          signed_gdrive_file_id?: string | null
          signed_gdrive_file_url?: string | null
          signed_uploaded_at?: string | null
          signing_status?: string
          sort_order?: number
          unsigned_gdrive_file_id?: string | null
          unsigned_gdrive_file_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_cm_contract_documents_contract"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "cm_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_contract_form_data: {
        Row: {
          agent_address: string | null
          agent_authority: string | null
          agent_name: string | null
          agent_phone: string | null
          agent_relationship_code: string | null
          agent_relationship_other: string | null
          care_manager_id: string | null
          care_manager_name: string | null
          care_manager_period: string | null
          care_manager_phone: string | null
          client_address: string | null
          client_fax: string | null
          client_name: string | null
          client_phone: string | null
          contract_date: string | null
          contract_end_date: string | null
          contract_id: string
          contract_start_date: string | null
          created_at: string | null
          created_by: string | null
          emergency_phone: string | null
          guardian_confirmed: boolean | null
          guardian_document_checked: boolean | null
          guardian_notes: string | null
          guardian_type: string | null
          has_guardian: boolean | null
          id: string
          scribe_address: string | null
          scribe_name: string | null
          scribe_phone: string | null
          scribe_reason_code: string | null
          scribe_reason_other: string | null
          scribe_relationship_code: string | null
          scribe_relationship_other: string | null
          signer_type: string | null
          staff_id: string | null
          staff_name: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          agent_address?: string | null
          agent_authority?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          agent_relationship_code?: string | null
          agent_relationship_other?: string | null
          care_manager_id?: string | null
          care_manager_name?: string | null
          care_manager_period?: string | null
          care_manager_phone?: string | null
          client_address?: string | null
          client_fax?: string | null
          client_name?: string | null
          client_phone?: string | null
          contract_date?: string | null
          contract_end_date?: string | null
          contract_id: string
          contract_start_date?: string | null
          created_at?: string | null
          created_by?: string | null
          emergency_phone?: string | null
          guardian_confirmed?: boolean | null
          guardian_document_checked?: boolean | null
          guardian_notes?: string | null
          guardian_type?: string | null
          has_guardian?: boolean | null
          id?: string
          scribe_address?: string | null
          scribe_name?: string | null
          scribe_phone?: string | null
          scribe_reason_code?: string | null
          scribe_reason_other?: string | null
          scribe_relationship_code?: string | null
          scribe_relationship_other?: string | null
          signer_type?: string | null
          staff_id?: string | null
          staff_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          agent_address?: string | null
          agent_authority?: string | null
          agent_name?: string | null
          agent_phone?: string | null
          agent_relationship_code?: string | null
          agent_relationship_other?: string | null
          care_manager_id?: string | null
          care_manager_name?: string | null
          care_manager_period?: string | null
          care_manager_phone?: string | null
          client_address?: string | null
          client_fax?: string | null
          client_name?: string | null
          client_phone?: string | null
          contract_date?: string | null
          contract_end_date?: string | null
          contract_id?: string
          contract_start_date?: string | null
          created_at?: string | null
          created_by?: string | null
          emergency_phone?: string | null
          guardian_confirmed?: boolean | null
          guardian_document_checked?: boolean | null
          guardian_notes?: string | null
          guardian_type?: string | null
          has_guardian?: boolean | null
          id?: string
          scribe_address?: string | null
          scribe_name?: string | null
          scribe_phone?: string | null
          scribe_reason_code?: string | null
          scribe_reason_other?: string | null
          scribe_relationship_code?: string | null
          scribe_relationship_other?: string | null
          signer_type?: string | null
          staff_id?: string | null
          staff_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_contract_form_data_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "cm_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_contract_templates: {
        Row: {
          code: string
          created_at: string
          html_content: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          html_content: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          html_content?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      cm_contract_verification_documents: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      cm_contract_verification_methods: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      cm_contract_webhook_logs: {
        Row: {
          created_at: string
          digisigner_document_id: string | null
          digisigner_signature_request_id: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          processing_status: string
        }
        Insert: {
          created_at?: string
          digisigner_document_id?: string | null
          digisigner_signature_request_id?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
        }
        Update: {
          created_at?: string
          digisigner_document_id?: string | null
          digisigner_signature_request_id?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
        }
        Relationships: []
      }
      cm_contracts: {
        Row: {
          completed_at: string | null
          consent_record_id: string | null
          contract_date: string | null
          contract_type: string
          created_at: string
          id: string
          kaipoke_cs_id: string
          notes: string | null
          plaud_recording_id: number | null
          signed_at: string | null
          signing_method: string
          staff_id: string
          status: string
          updated_at: string
          verification_at: string | null
          verification_document_id: string | null
          verification_document_other: string | null
          verification_method_id: string | null
        }
        Insert: {
          completed_at?: string | null
          consent_record_id?: string | null
          contract_date?: string | null
          contract_type: string
          created_at?: string
          id?: string
          kaipoke_cs_id: string
          notes?: string | null
          plaud_recording_id?: number | null
          signed_at?: string | null
          signing_method?: string
          staff_id: string
          status?: string
          updated_at?: string
          verification_at?: string | null
          verification_document_id?: string | null
          verification_document_other?: string | null
          verification_method_id?: string | null
        }
        Update: {
          completed_at?: string | null
          consent_record_id?: string | null
          contract_date?: string | null
          contract_type?: string
          created_at?: string
          id?: string
          kaipoke_cs_id?: string
          notes?: string | null
          plaud_recording_id?: number | null
          signed_at?: string | null
          signing_method?: string
          staff_id?: string
          status?: string
          updated_at?: string
          verification_at?: string | null
          verification_document_id?: string | null
          verification_document_other?: string | null
          verification_method_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cm_contracts_consent"
            columns: ["consent_record_id"]
            isOneToOne: false
            referencedRelation: "cm_contract_consents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cm_contracts_verification_document"
            columns: ["verification_document_id"]
            isOneToOne: false
            referencedRelation: "cm_contract_verification_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cm_contracts_verification_method"
            columns: ["verification_method_id"]
            isOneToOne: false
            referencedRelation: "cm_contract_verification_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_document_types: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          extraction_prompt: string | null
          id: number
          is_active: boolean | null
          name: string
          ocr_skip: boolean | null
          short_name: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          extraction_prompt?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          ocr_skip?: boolean | null
          short_name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          extraction_prompt?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          ocr_skip?: boolean | null
          short_name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_fax_client_link: {
        Row: {
          created_at: string | null
          created_by: string | null
          fax_number_normalized: string
          id: number
          kaipoke_cs_id: string
          memo: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          fax_number_normalized: string
          id?: number
          kaipoke_cs_id: string
          memo?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          fax_number_normalized?: string
          id?: number
          kaipoke_cs_id?: string
          memo?: string | null
        }
        Relationships: []
      }
      cm_fax_document_clients: {
        Row: {
          client_name: string | null
          confidence: number | null
          created_at: string | null
          fax_document_id: number
          id: number
          is_primary: boolean | null
          kaipoke_cs_id: string
          source: string | null
        }
        Insert: {
          client_name?: string | null
          confidence?: number | null
          created_at?: string | null
          fax_document_id: number
          id?: number
          is_primary?: boolean | null
          kaipoke_cs_id: string
          source?: string | null
        }
        Update: {
          client_name?: string | null
          confidence?: number | null
          created_at?: string | null
          fax_document_id?: number
          id?: number
          is_primary?: boolean | null
          kaipoke_cs_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_fax_document_clients_fax_document_id_fkey"
            columns: ["fax_document_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_document_pages: {
        Row: {
          created_at: string | null
          fax_document_id: number
          fax_page_id: number
          id: number
          page_order: number
        }
        Insert: {
          created_at?: string | null
          fax_document_id: number
          fax_page_id: number
          id?: number
          page_order?: number
        }
        Update: {
          created_at?: string | null
          fax_document_id?: number
          fax_page_id?: number
          id?: number
          page_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "cm_fax_document_pages_fax_document_id_fkey"
            columns: ["fax_document_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_fax_document_pages_fax_page_id_fkey"
            columns: ["fax_page_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_documents: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          confidence_at_approval: number | null
          created_at: string | null
          document_type_id: number | null
          fax_received_id: number
          id: number
          is_advertisement: boolean | null
          is_cover_sheet: boolean | null
          note: string | null
          office_id: number | null
          requires_response: boolean | null
          response_deadline: string | null
          response_note: string | null
          response_sent_at: string | null
          sort_order: number | null
          suggested_confidence: number | null
          suggested_document_type_id: number | null
          suggested_is_ad: boolean | null
          suggested_source: string | null
          suggestion_was_correct: boolean | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          confidence_at_approval?: number | null
          created_at?: string | null
          document_type_id?: number | null
          fax_received_id: number
          id?: number
          is_advertisement?: boolean | null
          is_cover_sheet?: boolean | null
          note?: string | null
          office_id?: number | null
          requires_response?: boolean | null
          response_deadline?: string | null
          response_note?: string | null
          response_sent_at?: string | null
          sort_order?: number | null
          suggested_confidence?: number | null
          suggested_document_type_id?: number | null
          suggested_is_ad?: boolean | null
          suggested_source?: string | null
          suggestion_was_correct?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          confidence_at_approval?: number | null
          created_at?: string | null
          document_type_id?: number | null
          fax_received_id?: number
          id?: number
          is_advertisement?: boolean | null
          is_cover_sheet?: boolean | null
          note?: string | null
          office_id?: number | null
          requires_response?: boolean | null
          response_deadline?: string | null
          response_note?: string | null
          response_sent_at?: string | null
          sort_order?: number | null
          suggested_confidence?: number | null
          suggested_document_type_id?: number | null
          suggested_is_ad?: boolean | null
          suggested_source?: string | null
          suggestion_was_correct?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_fax_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_fax_documents_fax_received_id_fkey"
            columns: ["fax_received_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_fax_documents_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "cm_kaipoke_other_office"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_fax_documents_suggested_document_type_id_fkey"
            columns: ["suggested_document_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_extracted_data: {
        Row: {
          confidence_score: number | null
          extracted_at: string | null
          extracted_data: Json
          extraction_prompt_id: string | null
          fax_page_id: number
          id: number
          model_version: string | null
          requires_review: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          confidence_score?: number | null
          extracted_at?: string | null
          extracted_data: Json
          extraction_prompt_id?: string | null
          fax_page_id: number
          id?: number
          model_version?: string | null
          requires_review?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          confidence_score?: number | null
          extracted_at?: string | null
          extracted_data?: Json
          extraction_prompt_id?: string | null
          fax_page_id?: number
          id?: number
          model_version?: string | null
          requires_review?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fax_extracted_data_fax_page_id_fkey"
            columns: ["fax_page_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_ocr_results: {
        Row: {
          client_candidates: Json | null
          detected_client_confidence: number | null
          detected_client_id: string | null
          detected_client_name: string | null
          detected_doc_type_confidence: number | null
          detected_doc_type_id: number | null
          detected_text: string | null
          doc_type_candidates: Json | null
          fax_received_id: number
          id: number
          is_advertisement_guess: boolean | null
          ocr_engine: string | null
          page_number: number
          page_orientation: string | null
          processed_at: string | null
          processing_time_ms: number | null
        }
        Insert: {
          client_candidates?: Json | null
          detected_client_confidence?: number | null
          detected_client_id?: string | null
          detected_client_name?: string | null
          detected_doc_type_confidence?: number | null
          detected_doc_type_id?: number | null
          detected_text?: string | null
          doc_type_candidates?: Json | null
          fax_received_id: number
          id?: number
          is_advertisement_guess?: boolean | null
          ocr_engine?: string | null
          page_number: number
          page_orientation?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
        }
        Update: {
          client_candidates?: Json | null
          detected_client_confidence?: number | null
          detected_client_id?: string | null
          detected_client_name?: string | null
          detected_doc_type_confidence?: number | null
          detected_doc_type_id?: number | null
          detected_text?: string | null
          doc_type_candidates?: Json | null
          fax_received_id?: number
          id?: number
          is_advertisement_guess?: boolean | null
          ocr_engine?: string | null
          page_number?: number
          page_orientation?: string | null
          processed_at?: string | null
          processing_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fax_ocr_results_detected_doc_type_id_fkey"
            columns: ["detected_doc_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fax_ocr_results_fax_received_id_fkey"
            columns: ["fax_received_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_received"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_office_patterns: {
        Row: {
          ad_count: number | null
          ad_rate: number | null
          cover_sheet_count: number | null
          created_at: string | null
          doc_type_counts: Json | null
          id: number
          most_common_confidence: number | null
          most_common_doc_type_id: number | null
          office_id: number
          page_position: string
          total_count: number | null
          updated_at: string | null
        }
        Insert: {
          ad_count?: number | null
          ad_rate?: number | null
          cover_sheet_count?: number | null
          created_at?: string | null
          doc_type_counts?: Json | null
          id?: number
          most_common_confidence?: number | null
          most_common_doc_type_id?: number | null
          office_id: number
          page_position: string
          total_count?: number | null
          updated_at?: string | null
        }
        Update: {
          ad_count?: number | null
          ad_rate?: number | null
          cover_sheet_count?: number | null
          created_at?: string | null
          doc_type_counts?: Json | null
          id?: number
          most_common_confidence?: number | null
          most_common_doc_type_id?: number | null
          office_id?: number
          page_position?: string
          total_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fax_office_patterns_most_common_doc_type_id_fkey"
            columns: ["most_common_doc_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fax_office_patterns_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "cm_kaipoke_other_office"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_pages: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          client_candidates: Json | null
          confidence_at_approval: number | null
          confirmed_client_id: string | null
          created_at: string | null
          doc_type_candidates: Json | null
          document_type_id: number | null
          fax_received_id: number
          id: number
          image_url: string | null
          is_advertisement: boolean | null
          kaipoke_cs_id: string | null
          logical_order: number | null
          ocr_requested_at: string | null
          ocr_result_id: number | null
          ocr_skip_reason: string | null
          ocr_status: string | null
          ocr_was_correct: boolean | null
          page_number: number
          rotation: number | null
          rotation_confirmed: number | null
          rotation_confirmed_at: string | null
          rotation_confirmed_by: string | null
          rotation_source: string | null
          rotation_updated_at: string | null
          suggested_client_name: string | null
          suggested_confidence: number | null
          suggested_doc_type_id: number | null
          suggested_is_ad: boolean | null
          suggested_source: string | null
          suggestion_was_correct: boolean | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_candidates?: Json | null
          confidence_at_approval?: number | null
          confirmed_client_id?: string | null
          created_at?: string | null
          doc_type_candidates?: Json | null
          document_type_id?: number | null
          fax_received_id: number
          id?: number
          image_url?: string | null
          is_advertisement?: boolean | null
          kaipoke_cs_id?: string | null
          logical_order?: number | null
          ocr_requested_at?: string | null
          ocr_result_id?: number | null
          ocr_skip_reason?: string | null
          ocr_status?: string | null
          ocr_was_correct?: boolean | null
          page_number: number
          rotation?: number | null
          rotation_confirmed?: number | null
          rotation_confirmed_at?: string | null
          rotation_confirmed_by?: string | null
          rotation_source?: string | null
          rotation_updated_at?: string | null
          suggested_client_name?: string | null
          suggested_confidence?: number | null
          suggested_doc_type_id?: number | null
          suggested_is_ad?: boolean | null
          suggested_source?: string | null
          suggestion_was_correct?: boolean | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          client_candidates?: Json | null
          confidence_at_approval?: number | null
          confirmed_client_id?: string | null
          created_at?: string | null
          doc_type_candidates?: Json | null
          document_type_id?: number | null
          fax_received_id?: number
          id?: number
          image_url?: string | null
          is_advertisement?: boolean | null
          kaipoke_cs_id?: string | null
          logical_order?: number | null
          ocr_requested_at?: string | null
          ocr_result_id?: number | null
          ocr_skip_reason?: string | null
          ocr_status?: string | null
          ocr_was_correct?: boolean | null
          page_number?: number
          rotation?: number | null
          rotation_confirmed?: number | null
          rotation_confirmed_at?: string | null
          rotation_confirmed_by?: string | null
          rotation_source?: string | null
          rotation_updated_at?: string | null
          suggested_client_name?: string | null
          suggested_confidence?: number | null
          suggested_doc_type_id?: number | null
          suggested_is_ad?: boolean | null
          suggested_source?: string | null
          suggestion_was_correct?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fax_pages_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fax_pages_fax_received_id_fkey"
            columns: ["fax_received_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fax_pages_suggested_doc_type_id_fkey"
            columns: ["suggested_doc_type_id"]
            isOneToOne: false
            referencedRelation: "cm_document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_received: {
        Row: {
          candidate_clients: Json | null
          created_at: string | null
          fax_number: string | null
          file_id: string | null
          file_name: string
          file_path: string | null
          gmail_message_id: string | null
          id: number
          meta: Json | null
          office_assigned_at: string | null
          office_assigned_by: string | null
          office_id: number | null
          page_count: number | null
          processed_at: string | null
          received_at: string
          status: string | null
          suggested_office_id: number | null
          suggested_office_name: string | null
          suggested_office_source: string | null
          updated_at: string | null
        }
        Insert: {
          candidate_clients?: Json | null
          created_at?: string | null
          fax_number?: string | null
          file_id?: string | null
          file_name: string
          file_path?: string | null
          gmail_message_id?: string | null
          id?: number
          meta?: Json | null
          office_assigned_at?: string | null
          office_assigned_by?: string | null
          office_id?: number | null
          page_count?: number | null
          processed_at?: string | null
          received_at: string
          status?: string | null
          suggested_office_id?: number | null
          suggested_office_name?: string | null
          suggested_office_source?: string | null
          updated_at?: string | null
        }
        Update: {
          candidate_clients?: Json | null
          created_at?: string | null
          fax_number?: string | null
          file_id?: string | null
          file_name?: string
          file_path?: string | null
          gmail_message_id?: string | null
          id?: number
          meta?: Json | null
          office_assigned_at?: string | null
          office_assigned_by?: string | null
          office_id?: number | null
          page_count?: number | null
          processed_at?: string | null
          received_at?: string
          status?: string | null
          suggested_office_id?: number | null
          suggested_office_name?: string | null
          suggested_office_source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cm_fax_received_suggested_office"
            columns: ["suggested_office_id"]
            isOneToOne: false
            referencedRelation: "cm_kaipoke_other_office"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_received_offices: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          created_at: string | null
          fax_received_id: number
          id: number
          is_primary: boolean | null
          office_id: number
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          fax_received_id: number
          id?: number
          is_primary?: boolean | null
          office_id: number
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          created_at?: string | null
          fax_received_id?: number
          id?: number
          is_primary?: boolean | null
          office_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cm_fax_received_offices_fax_received_id_fkey"
            columns: ["fax_received_id"]
            isOneToOne: false
            referencedRelation: "cm_fax_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_fax_received_offices_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "cm_kaipoke_other_office"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_sender_patterns: {
        Row: {
          avg_page_count: number | null
          created_at: string | null
          fax_number: string
          id: number
          last_fax_received_at: string | null
          office_id: number | null
          page_order_confidence: number | null
          page_order_pattern: string | null
          page_order_sample_count: number | null
          rotation_patterns: Json | null
          rotation_sample_count: number | null
          sender_name: string | null
          total_fax_count: number | null
          updated_at: string | null
        }
        Insert: {
          avg_page_count?: number | null
          created_at?: string | null
          fax_number: string
          id?: number
          last_fax_received_at?: string | null
          office_id?: number | null
          page_order_confidence?: number | null
          page_order_pattern?: string | null
          page_order_sample_count?: number | null
          rotation_patterns?: Json | null
          rotation_sample_count?: number | null
          sender_name?: string | null
          total_fax_count?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_page_count?: number | null
          created_at?: string | null
          fax_number?: string
          id?: number
          last_fax_received_at?: string | null
          office_id?: number | null
          page_order_confidence?: number | null
          page_order_pattern?: string | null
          page_order_sample_count?: number | null
          rotation_patterns?: Json | null
          rotation_sample_count?: number | null
          sender_name?: string | null
          total_fax_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_fax_sender_patterns_office_id_fkey"
            columns: ["office_id"]
            isOneToOne: false
            referencedRelation: "cm_kaipoke_other_office"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_fax_text_patterns: {
        Row: {
          client_name: string | null
          confidence: number | null
          correct_count: number | null
          created_at: string | null
          id: number
          kaipoke_cs_id: string
          last_matched_at: string | null
          match_count: number | null
          pattern_text: string
          pattern_type: string | null
          updated_at: string | null
        }
        Insert: {
          client_name?: string | null
          confidence?: number | null
          correct_count?: number | null
          created_at?: string | null
          id?: number
          kaipoke_cs_id: string
          last_matched_at?: string | null
          match_count?: number | null
          pattern_text: string
          pattern_type?: string | null
          updated_at?: string | null
        }
        Update: {
          client_name?: string | null
          confidence?: number | null
          correct_count?: number | null
          created_at?: string | null
          id?: number
          kaipoke_cs_id?: string
          last_matched_at?: string | null
          match_count?: number | null
          pattern_text?: string
          pattern_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_job_items: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: number
          job_id: number
          processed_at: string | null
          status: string
          target_id: string
          target_name: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          job_id: number
          processed_at?: string | null
          status?: string
          target_id: string
          target_name?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          job_id?: number
          processed_at?: string | null
          status?: string
          target_id?: string
          target_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cm_active_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cm_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cm_jobs_with_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "cm_recent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_job_queues: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_job_types: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          is_scheduled: boolean | null
          name: string
          queue_code: string
          schedule_cancel_pending: boolean | null
          schedule_last_created_job_id: number | null
          schedule_last_run_at: string | null
          schedule_last_run_status: string | null
          schedule_order: number | null
          schedule_payload: Json | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          is_scheduled?: boolean | null
          name: string
          queue_code: string
          schedule_cancel_pending?: boolean | null
          schedule_last_created_job_id?: number | null
          schedule_last_run_at?: string | null
          schedule_last_run_status?: string | null
          schedule_order?: number | null
          schedule_payload?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          is_scheduled?: boolean | null
          name?: string
          queue_code?: string
          schedule_cancel_pending?: boolean | null
          schedule_last_created_job_id?: number | null
          schedule_last_run_at?: string | null
          schedule_last_run_status?: string | null
          schedule_order?: number | null
          schedule_payload?: Json | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_job_types_queue_code_fkey"
            columns: ["queue_code"]
            isOneToOne: false
            referencedRelation: "cm_job_queues"
            referencedColumns: ["code"]
          },
        ]
      }
      cm_jobs: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: number
          job_type: string
          payload: Json | null
          progress_message: string | null
          queue: string
          result: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          job_type: string
          payload?: Json | null
          progress_message?: string | null
          queue: string
          result?: Json | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          job_type?: string
          payload?: Json | null
          progress_message?: string | null
          queue?: string
          result?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_kaipoke_benefit_limit: {
        Row: {
          benefit_rate: number
          created_at: string
          id: string
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          limit_end: string | null
          limit_start: string
          updated_at: string
        }
        Insert: {
          benefit_rate: number
          created_at?: string
          id?: string
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          limit_end?: string | null
          limit_start: string
          updated_at?: string
        }
        Update: {
          benefit_rate?: number
          created_at?: string
          id?: string
          kaipoke_cs_id?: string
          kaipoke_insurance_id?: string
          limit_end?: string | null
          limit_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      cm_kaipoke_info: {
        Row: {
          biko: string | null
          birth_date: string | null
          building: string | null
          city: string | null
          client_status: string | null
          contract_date: string | null
          contract_end_date: string | null
          created_at: string
          documents: Json | null
          email: string | null
          end_at: string | null
          gender: string | null
          id: string
          is_active: boolean
          kaipoke_cs_id: string | null
          kana: string | null
          kana_mei: string | null
          kana_sei: string | null
          name: string
          notification_date: string | null
          phone_01: string | null
          phone_02: string | null
          postal_code: string | null
          prefecture: string | null
          town: string | null
          updated_at: string
        }
        Insert: {
          biko?: string | null
          birth_date?: string | null
          building?: string | null
          city?: string | null
          client_status?: string | null
          contract_date?: string | null
          contract_end_date?: string | null
          created_at?: string
          documents?: Json | null
          email?: string | null
          end_at?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          kaipoke_cs_id?: string | null
          kana?: string | null
          kana_mei?: string | null
          kana_sei?: string | null
          name: string
          notification_date?: string | null
          phone_01?: string | null
          phone_02?: string | null
          postal_code?: string | null
          prefecture?: string | null
          town?: string | null
          updated_at?: string
        }
        Update: {
          biko?: string | null
          birth_date?: string | null
          building?: string | null
          city?: string | null
          client_status?: string | null
          contract_date?: string | null
          contract_end_date?: string | null
          created_at?: string
          documents?: Json | null
          email?: string | null
          end_at?: string | null
          gender?: string | null
          id?: string
          is_active?: boolean
          kaipoke_cs_id?: string | null
          kana?: string | null
          kana_mei?: string | null
          kana_sei?: string | null
          name?: string
          notification_date?: string | null
          phone_01?: string | null
          phone_02?: string | null
          postal_code?: string | null
          prefecture?: string | null
          town?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cm_kaipoke_insurance: {
        Row: {
          care_level: string | null
          cert_status: string | null
          cert_valid_end: string | null
          cert_valid_start: string | null
          certification_date: string | null
          coverage_end: string
          coverage_start: string
          created_at: string
          id: string
          insured_number: string
          insurer_code: string
          insurer_name: string | null
          issue_date: string | null
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          limit_units: number | null
          updated_at: string
        }
        Insert: {
          care_level?: string | null
          cert_status?: string | null
          cert_valid_end?: string | null
          cert_valid_start?: string | null
          certification_date?: string | null
          coverage_end: string
          coverage_start: string
          created_at?: string
          id?: string
          insured_number: string
          insurer_code: string
          insurer_name?: string | null
          issue_date?: string | null
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          limit_units?: number | null
          updated_at?: string
        }
        Update: {
          care_level?: string | null
          cert_status?: string | null
          cert_valid_end?: string | null
          cert_valid_start?: string | null
          certification_date?: string | null
          coverage_end?: string
          coverage_start?: string
          created_at?: string
          id?: string
          insured_number?: string
          insurer_code?: string
          insurer_name?: string | null
          issue_date?: string | null
          kaipoke_cs_id?: string
          kaipoke_insurance_id?: string
          limit_units?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cm_kaipoke_other_office: {
        Row: {
          address: string | null
          created_at: string | null
          fax: string | null
          fax_normalized: string | null
          fax_proxy: string | null
          fax_proxy_normalized: string | null
          id: number
          is_satellite: boolean | null
          kaipoke_office_id: string
          office_name: string | null
          office_number: string | null
          phone: string | null
          service_type: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          fax?: string | null
          fax_normalized?: string | null
          fax_proxy?: string | null
          fax_proxy_normalized?: string | null
          id?: number
          is_satellite?: boolean | null
          kaipoke_office_id: string
          office_name?: string | null
          office_number?: string | null
          phone?: string | null
          service_type?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          fax?: string | null
          fax_normalized?: string | null
          fax_proxy?: string | null
          fax_proxy_normalized?: string | null
          id?: number
          is_satellite?: boolean | null
          kaipoke_office_id?: string
          office_name?: string | null
          office_number?: string | null
          phone?: string | null
          service_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_kaipoke_service_usage: {
        Row: {
          actual_day_01: string | null
          actual_day_02: string | null
          actual_day_03: string | null
          actual_day_04: string | null
          actual_day_05: string | null
          actual_day_06: string | null
          actual_day_07: string | null
          actual_day_08: string | null
          actual_day_09: string | null
          actual_day_10: string | null
          actual_day_11: string | null
          actual_day_12: string | null
          actual_day_13: string | null
          actual_day_14: string | null
          actual_day_15: string | null
          actual_day_16: string | null
          actual_day_17: string | null
          actual_day_18: string | null
          actual_day_19: string | null
          actual_day_20: string | null
          actual_day_21: string | null
          actual_day_22: string | null
          actual_day_23: string | null
          actual_day_24: string | null
          actual_day_25: string | null
          actual_day_26: string | null
          actual_day_27: string | null
          actual_day_28: string | null
          actual_day_29: string | null
          actual_day_30: string | null
          actual_day_31: string | null
          actual_total: number | null
          created_at: string | null
          id: number
          kaipoke_cs_id: string | null
          office_name_display: string | null
          office_number: string | null
          plan_achievement_details_id: string
          plan_day_01: string | null
          plan_day_02: string | null
          plan_day_03: string | null
          plan_day_04: string | null
          plan_day_05: string | null
          plan_day_06: string | null
          plan_day_07: string | null
          plan_day_08: string | null
          plan_day_09: string | null
          plan_day_10: string | null
          plan_day_11: string | null
          plan_day_12: string | null
          plan_day_13: string | null
          plan_day_14: string | null
          plan_day_15: string | null
          plan_day_16: string | null
          plan_day_17: string | null
          plan_day_18: string | null
          plan_day_19: string | null
          plan_day_20: string | null
          plan_day_21: string | null
          plan_day_22: string | null
          plan_day_23: string | null
          plan_day_24: string | null
          plan_day_25: string | null
          plan_day_26: string | null
          plan_day_27: string | null
          plan_day_28: string | null
          plan_day_29: string | null
          plan_day_30: string | null
          plan_day_31: string | null
          plan_total: number | null
          service_name: string | null
          service_plant_text: string | null
          service_plant_value: string | null
          service_time_end: string | null
          service_time_start: string | null
          service_year_month: string | null
          updated_at: string | null
        }
        Insert: {
          actual_day_01?: string | null
          actual_day_02?: string | null
          actual_day_03?: string | null
          actual_day_04?: string | null
          actual_day_05?: string | null
          actual_day_06?: string | null
          actual_day_07?: string | null
          actual_day_08?: string | null
          actual_day_09?: string | null
          actual_day_10?: string | null
          actual_day_11?: string | null
          actual_day_12?: string | null
          actual_day_13?: string | null
          actual_day_14?: string | null
          actual_day_15?: string | null
          actual_day_16?: string | null
          actual_day_17?: string | null
          actual_day_18?: string | null
          actual_day_19?: string | null
          actual_day_20?: string | null
          actual_day_21?: string | null
          actual_day_22?: string | null
          actual_day_23?: string | null
          actual_day_24?: string | null
          actual_day_25?: string | null
          actual_day_26?: string | null
          actual_day_27?: string | null
          actual_day_28?: string | null
          actual_day_29?: string | null
          actual_day_30?: string | null
          actual_day_31?: string | null
          actual_total?: number | null
          created_at?: string | null
          id?: number
          kaipoke_cs_id?: string | null
          office_name_display?: string | null
          office_number?: string | null
          plan_achievement_details_id: string
          plan_day_01?: string | null
          plan_day_02?: string | null
          plan_day_03?: string | null
          plan_day_04?: string | null
          plan_day_05?: string | null
          plan_day_06?: string | null
          plan_day_07?: string | null
          plan_day_08?: string | null
          plan_day_09?: string | null
          plan_day_10?: string | null
          plan_day_11?: string | null
          plan_day_12?: string | null
          plan_day_13?: string | null
          plan_day_14?: string | null
          plan_day_15?: string | null
          plan_day_16?: string | null
          plan_day_17?: string | null
          plan_day_18?: string | null
          plan_day_19?: string | null
          plan_day_20?: string | null
          plan_day_21?: string | null
          plan_day_22?: string | null
          plan_day_23?: string | null
          plan_day_24?: string | null
          plan_day_25?: string | null
          plan_day_26?: string | null
          plan_day_27?: string | null
          plan_day_28?: string | null
          plan_day_29?: string | null
          plan_day_30?: string | null
          plan_day_31?: string | null
          plan_total?: number | null
          service_name?: string | null
          service_plant_text?: string | null
          service_plant_value?: string | null
          service_time_end?: string | null
          service_time_start?: string | null
          service_year_month?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_day_01?: string | null
          actual_day_02?: string | null
          actual_day_03?: string | null
          actual_day_04?: string | null
          actual_day_05?: string | null
          actual_day_06?: string | null
          actual_day_07?: string | null
          actual_day_08?: string | null
          actual_day_09?: string | null
          actual_day_10?: string | null
          actual_day_11?: string | null
          actual_day_12?: string | null
          actual_day_13?: string | null
          actual_day_14?: string | null
          actual_day_15?: string | null
          actual_day_16?: string | null
          actual_day_17?: string | null
          actual_day_18?: string | null
          actual_day_19?: string | null
          actual_day_20?: string | null
          actual_day_21?: string | null
          actual_day_22?: string | null
          actual_day_23?: string | null
          actual_day_24?: string | null
          actual_day_25?: string | null
          actual_day_26?: string | null
          actual_day_27?: string | null
          actual_day_28?: string | null
          actual_day_29?: string | null
          actual_day_30?: string | null
          actual_day_31?: string | null
          actual_total?: number | null
          created_at?: string | null
          id?: number
          kaipoke_cs_id?: string | null
          office_name_display?: string | null
          office_number?: string | null
          plan_achievement_details_id?: string
          plan_day_01?: string | null
          plan_day_02?: string | null
          plan_day_03?: string | null
          plan_day_04?: string | null
          plan_day_05?: string | null
          plan_day_06?: string | null
          plan_day_07?: string | null
          plan_day_08?: string | null
          plan_day_09?: string | null
          plan_day_10?: string | null
          plan_day_11?: string | null
          plan_day_12?: string | null
          plan_day_13?: string | null
          plan_day_14?: string | null
          plan_day_15?: string | null
          plan_day_16?: string | null
          plan_day_17?: string | null
          plan_day_18?: string | null
          plan_day_19?: string | null
          plan_day_20?: string | null
          plan_day_21?: string | null
          plan_day_22?: string | null
          plan_day_23?: string | null
          plan_day_24?: string | null
          plan_day_25?: string | null
          plan_day_26?: string | null
          plan_day_27?: string | null
          plan_day_28?: string | null
          plan_day_29?: string | null
          plan_day_30?: string | null
          plan_day_31?: string | null
          plan_total?: number | null
          service_name?: string | null
          service_plant_text?: string | null
          service_plant_value?: string | null
          service_time_end?: string | null
          service_time_start?: string | null
          service_year_month?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_kaipoke_support_office: {
        Row: {
          apply_start: string
          care_manager_id: string | null
          care_manager_kaipoke_id: string | null
          care_manager_name: string | null
          contract_type: string | null
          created_at: string
          id: string
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          notification_date: string | null
          office_name: string | null
          support_center_name: string | null
          updated_at: string
        }
        Insert: {
          apply_start: string
          care_manager_id?: string | null
          care_manager_kaipoke_id?: string | null
          care_manager_name?: string | null
          contract_type?: string | null
          created_at?: string
          id?: string
          kaipoke_cs_id: string
          kaipoke_insurance_id: string
          notification_date?: string | null
          office_name?: string | null
          support_center_name?: string | null
          updated_at?: string
        }
        Update: {
          apply_start?: string
          care_manager_id?: string | null
          care_manager_kaipoke_id?: string | null
          care_manager_name?: string | null
          contract_type?: string | null
          created_at?: string
          id?: string
          kaipoke_cs_id?: string
          kaipoke_insurance_id?: string
          notification_date?: string | null
          office_name?: string | null
          support_center_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "audit_log_display_view"
            referencedColumns: ["actor_user_id_text"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cm_kaipoke_support_office_care_manager_id_fkey"
            columns: ["care_manager_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["user_id"]
          },
        ]
      }
      cm_local_fax_phonebook: {
        Row: {
          created_at: string | null
          fax_number: string | null
          fax_number_normalized: string | null
          id: number
          is_active: boolean | null
          name: string
          name_kana: string | null
          notes: string | null
          source_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          fax_number?: string | null
          fax_number_normalized?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          name_kana?: string | null
          notes?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          fax_number?: string | null
          fax_number_normalized?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          name_kana?: string | null
          notes?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_own_office: {
        Row: {
          address: string | null
          code: string
          corporation_name: string | null
          created_at: string | null
          created_by: string | null
          fax: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          manager_name: string | null
          name: string
          phone: string | null
          postal_code: string | null
          representative_name: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          code: string
          corporation_name?: string | null
          created_at?: string | null
          created_by?: string | null
          fax?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          manager_name?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          representative_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          corporation_name?: string | null
          created_at?: string | null
          created_by?: string | null
          fax?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          representative_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      cm_plaud_mgmt_history: {
        Row: {
          id: number
          input_text: string | null
          kaipoke_cs_id: string | null
          output_text: string
          processed_at: string | null
          processed_by: string | null
          template_id: number | null
          transcription_id: number | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          input_text?: string | null
          kaipoke_cs_id?: string | null
          output_text: string
          processed_at?: string | null
          processed_by?: string | null
          template_id?: number | null
          transcription_id?: number | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          input_text?: string | null
          kaipoke_cs_id?: string | null
          output_text?: string
          processed_at?: string | null
          processed_by?: string | null
          template_id?: number | null
          transcription_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cm_plaud_mgmt_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cm_plaud_mgmt_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cm_plaud_mgmt_history_transcription_id_fkey"
            columns: ["transcription_id"]
            isOneToOne: false
            referencedRelation: "cm_plaud_mgmt_transcriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_plaud_mgmt_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          is_active: boolean | null
          name: string
          options: Json | null
          output_format: string | null
          sort_order: number | null
          system_prompt: string | null
          updated_at: string | null
          user_prompt_template: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name: string
          options?: Json | null
          output_format?: string | null
          sort_order?: number | null
          system_prompt?: string | null
          updated_at?: string | null
          user_prompt_template: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          is_active?: boolean | null
          name?: string
          options?: Json | null
          output_format?: string | null
          sort_order?: number | null
          system_prompt?: string | null
          updated_at?: string | null
          user_prompt_template?: string
        }
        Relationships: []
      }
      cm_plaud_mgmt_transcriptions: {
        Row: {
          created_at: string | null
          id: number
          kaipoke_cs_id: string | null
          plaud_created_at: string
          plaud_uuid: string
          registered_by: string | null
          retry_count: number | null
          status: string | null
          title: string
          transcript: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          kaipoke_cs_id?: string | null
          plaud_created_at: string
          plaud_uuid: string
          registered_by?: string | null
          retry_count?: number | null
          status?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          kaipoke_cs_id?: string | null
          plaud_created_at?: string
          plaud_uuid?: string
          registered_by?: string | null
          retry_count?: number | null
          status?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_plaud_sum: {
        Row: {
          contents: string | null
          id: string
          kaipoke_cs_id: string | null
          plaud_created_at: string | null
          plaud_id: string
          plaud_updated_at: string | null
          system_created_at: string | null
          system_updated_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          contents?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          plaud_created_at?: string | null
          plaud_id: string
          plaud_updated_at?: string | null
          system_created_at?: string | null
          system_updated_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          contents?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          plaud_created_at?: string | null
          plaud_id?: string
          plaud_updated_at?: string | null
          system_created_at?: string | null
          system_updated_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cm_plaud_sum_processing: {
        Row: {
          completed_at: string | null
          created_at: string
          error_count: number
          error_message: string | null
          error_type: string | null
          id: string
          kaipoke_cs_id: string | null
          kaipoke_edit_id: string | null
          last_error_at: string | null
          max_retries: number
          original_contents: string | null
          plaud_created_at: string | null
          plaud_id: string
          plaud_sum_id: string
          process_type: string | null
          retry_count: number
          rpa_request_id: string | null
          rpa_requested_at: string | null
          status: string
          summarized_at: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_count?: number
          error_message?: string | null
          error_type?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          kaipoke_edit_id?: string | null
          last_error_at?: string | null
          max_retries?: number
          original_contents?: string | null
          plaud_created_at?: string | null
          plaud_id: string
          plaud_sum_id: string
          process_type?: string | null
          retry_count?: number
          rpa_request_id?: string | null
          rpa_requested_at?: string | null
          status?: string
          summarized_at?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_count?: number
          error_message?: string | null
          error_type?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          kaipoke_edit_id?: string | null
          last_error_at?: string | null
          max_retries?: number
          original_contents?: string | null
          plaud_created_at?: string | null
          plaud_id?: string
          plaud_sum_id?: string
          process_type?: string | null
          retry_count?: number
          rpa_request_id?: string | null
          rpa_requested_at?: string | null
          status?: string
          summarized_at?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_plaud_sum"
            columns: ["plaud_sum_id"]
            isOneToOne: true
            referencedRelation: "cm_plaud_sum"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rpa_request"
            columns: ["rpa_request_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rpa_request"
            columns: ["rpa_request_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_rpa_request"
            columns: ["rpa_request_id"]
            isOneToOne: false
            referencedRelation: "rpa_request_view"
            referencedColumns: ["request_id"]
          },
        ]
      }
      cm_plaud_transcriptions: {
        Row: {
          created_at: string | null
          id: number
          plaud_created_at: string
          plaud_uuid: string
          registered_by: string | null
          retry_count: number | null
          status: string | null
          title: string
          transcript: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          plaud_created_at: string
          plaud_uuid: string
          registered_by?: string | null
          retry_count?: number | null
          status?: string | null
          title: string
          transcript?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          plaud_created_at?: string
          plaud_uuid?: string
          registered_by?: string | null
          retry_count?: number | null
          status?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_prompt_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          max_tokens: number
          model: string
          name: string
          prompt_template: string
          temperature: number
          updated_at: string
          variables: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          max_tokens?: number
          model?: string
          name: string
          prompt_template: string
          temperature?: number
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          max_tokens?: number
          model?: string
          name?: string
          prompt_template?: string
          temperature?: number
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      cm_rpa_api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: number
          is_active: boolean | null
          key_name: string
          updated_at: string | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          key_name: string
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: number
          is_active?: boolean | null
          key_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_rpa_credentials: {
        Row: {
          created_at: string | null
          credentials: Json
          id: number
          is_active: boolean | null
          label: string | null
          service_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credentials: Json
          id?: number
          is_active?: boolean | null
          label?: string | null
          service_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credentials?: Json
          id?: number
          is_active?: boolean | null
          label?: string | null
          service_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cm_rpa_logs: {
        Row: {
          action: string | null
          context: Json | null
          created_at: string | null
          env: string
          error_message: string | null
          error_name: string | null
          error_stack: string | null
          id: number
          level: string
          message: string
          module: string
          timestamp: string
          trace_id: string | null
        }
        Insert: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          env: string
          error_message?: string | null
          error_name?: string | null
          error_stack?: string | null
          id?: number
          level: string
          message: string
          module: string
          timestamp: string
          trace_id?: string | null
        }
        Update: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          env?: string
          error_message?: string | null
          error_name?: string | null
          error_stack?: string | null
          id?: number
          level?: string
          message?: string
          module?: string
          timestamp?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      cm_scheduled_job_runs: {
        Row: {
          cancelled_job_ids: number[] | null
          created_at: string | null
          created_job_id: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          job_type_id: number
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          cancelled_job_ids?: number[] | null
          created_at?: string | null
          created_job_id?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type_id: number
          started_at?: string
          status: string
          triggered_by?: string
        }
        Update: {
          cancelled_job_ids?: number[] | null
          created_at?: string | null
          created_job_id?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type_id?: number
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "cm_scheduled_job_runs_job_type_id_fkey"
            columns: ["job_type_id"]
            isOneToOne: false
            referencedRelation: "cm_job_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cm_select_options: {
        Row: {
          category: string
          code: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          label: string
          requires_input: boolean | null
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category: string
          code: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          requires_input?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string
          code?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          requires_input?: boolean | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      cs_docs: {
        Row: {
          applicable_date: string | null
          classification_confidence: number | null
          created_at: string
          cs_documents_entry_id: string | null
          cs_kaipoke_info_id: string | null
          doc_date_raw: string | null
          doc_name: string | null
          doc_type_id: string | null
          id: string
          kaipoke_cs_id: string | null
          llm_model: string | null
          meta: Json | null
          ocr_text: string | null
          source: string
          summary: string | null
          updated_at: string
          url: string
        }
        Insert: {
          applicable_date?: string | null
          classification_confidence?: number | null
          created_at?: string
          cs_documents_entry_id?: string | null
          cs_kaipoke_info_id?: string | null
          doc_date_raw?: string | null
          doc_name?: string | null
          doc_type_id?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          llm_model?: string | null
          meta?: Json | null
          ocr_text?: string | null
          source?: string
          summary?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          applicable_date?: string | null
          classification_confidence?: number | null
          created_at?: string
          cs_documents_entry_id?: string | null
          cs_kaipoke_info_id?: string | null
          doc_date_raw?: string | null
          doc_name?: string | null
          doc_type_id?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          llm_model?: string | null
          meta?: Json | null
          ocr_text?: string | null
          source?: string
          summary?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
          {
            foreignKeyName: "cs_docs_doc_type_id_fkey"
            columns: ["doc_type_id"]
            isOneToOne: false
            referencedRelation: "user_doc_master"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_gender_request: {
        Row: {
          created_at: string | null
          female_flg: boolean
          gender_request_id: string
          gender_request_name: string
          male_flg: boolean
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          female_flg?: boolean
          gender_request_id?: string
          gender_request_name: string
          male_flg?: boolean
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          female_flg?: boolean
          gender_request_id?: string
          gender_request_name?: string
          male_flg?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      cs_kaipoke_info: {
        Row: {
          address: string | null
          asigned_jisseki_staff: string | null
          asigned_org: string | null
          biko: string | null
          birth_yyyy_mm_dd: string | null
          care_consultant: string | null
          commuting_flg: boolean | null
          documents: Json | null
          email: string | null
          end_at: string | null
          gender: string | null
          gender_request: string | null
          id: string
          ido_end_at: string | null
          ido_jukyusyasho: string | null
          ido_start_at: string | null
          is_active: boolean | null
          kaigo_end_at: string | null
          kaigo_hoken_no: string | null
          kaigo_start_at: string | null
          kaipoke_biko: string | null
          kaipoke_cs_id: string
          kana: string | null
          kodoengo_plan_link: string | null
          name: string
          name_kana: string | null
          phone_01: string | null
          phone_02: string | null
          postal_code: string | null
          pre_org_icon_id: string | null
          service_kind: string | null
          shogai_end_at: string | null
          shogai_jukyusha_no: string | null
          shogai_jukyusha_penalty_exempt: boolean
          shogai_jukyusha_penalty_exempt_at: string | null
          shogai_start_at: string | null
          standard_purpose: string | null
          standard_route: string | null
          standard_trans_ways: string | null
          time_adjustability: string | null
          time_adjustability_id: string | null
        }
        Insert: {
          address?: string | null
          asigned_jisseki_staff?: string | null
          asigned_org?: string | null
          biko?: string | null
          birth_yyyy_mm_dd?: string | null
          care_consultant?: string | null
          commuting_flg?: boolean | null
          documents?: Json | null
          email?: string | null
          end_at?: string | null
          gender?: string | null
          gender_request?: string | null
          id?: string
          ido_end_at?: string | null
          ido_jukyusyasho?: string | null
          ido_start_at?: string | null
          is_active?: boolean | null
          kaigo_end_at?: string | null
          kaigo_hoken_no?: string | null
          kaigo_start_at?: string | null
          kaipoke_biko?: string | null
          kaipoke_cs_id: string
          kana?: string | null
          kodoengo_plan_link?: string | null
          name: string
          name_kana?: string | null
          phone_01?: string | null
          phone_02?: string | null
          postal_code?: string | null
          pre_org_icon_id?: string | null
          service_kind?: string | null
          shogai_end_at?: string | null
          shogai_jukyusha_no?: string | null
          shogai_jukyusha_penalty_exempt?: boolean
          shogai_jukyusha_penalty_exempt_at?: string | null
          shogai_start_at?: string | null
          standard_purpose?: string | null
          standard_route?: string | null
          standard_trans_ways?: string | null
          time_adjustability?: string | null
          time_adjustability_id?: string | null
        }
        Update: {
          address?: string | null
          asigned_jisseki_staff?: string | null
          asigned_org?: string | null
          biko?: string | null
          birth_yyyy_mm_dd?: string | null
          care_consultant?: string | null
          commuting_flg?: boolean | null
          documents?: Json | null
          email?: string | null
          end_at?: string | null
          gender?: string | null
          gender_request?: string | null
          id?: string
          ido_end_at?: string | null
          ido_jukyusyasho?: string | null
          ido_start_at?: string | null
          is_active?: boolean | null
          kaigo_end_at?: string | null
          kaigo_hoken_no?: string | null
          kaigo_start_at?: string | null
          kaipoke_biko?: string | null
          kaipoke_cs_id?: string
          kana?: string | null
          kodoengo_plan_link?: string | null
          name?: string
          name_kana?: string | null
          phone_01?: string | null
          phone_02?: string | null
          postal_code?: string | null
          pre_org_icon_id?: string | null
          service_kind?: string | null
          shogai_end_at?: string | null
          shogai_jukyusha_no?: string | null
          shogai_jukyusha_penalty_exempt?: boolean
          shogai_jukyusha_penalty_exempt_at?: string | null
          shogai_start_at?: string | null
          standard_purpose?: string | null
          standard_route?: string | null
          standard_trans_ways?: string | null
          time_adjustability?: string | null
          time_adjustability_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_kaipoke_info_time_adjustability_id_fkey"
            columns: ["time_adjustability_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_time_adjustability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cs_gender_request"
            columns: ["gender_request"]
            isOneToOne: false
            referencedRelation: "cs_gender_request"
            referencedColumns: ["gender_request_id"]
          },
        ]
      }
      cs_kaipoke_info_documents_snapshots: {
        Row: {
          created_at: string
          documents: Json
          info_id: string
          note: string | null
          snapshot_id: string
        }
        Insert: {
          created_at?: string
          documents: Json
          info_id: string
          note?: string | null
          snapshot_id?: string
        }
        Update: {
          created_at?: string
          documents?: Json
          info_id?: string
          note?: string | null
          snapshot_id?: string
        }
        Relationships: []
      }
      cs_kaipoke_insurance_info: {
        Row: {
          benefit_rate: number | null
          care_level: string | null
          care_management_office: string | null
          care_manager_name: string | null
          certification_date: string | null
          certification_status: string | null
          community_comprehensive_center: string | null
          created_at: string | null
          id: number
          insured_person_number: string | null
          insurer_name: string | null
          insurer_number: string | null
          plan_request_date: string | null
          updated_at: string | null
          user_kana: string | null
          user_name: string
          valid_end_date: string | null
          valid_start_date: string | null
        }
        Insert: {
          benefit_rate?: number | null
          care_level?: string | null
          care_management_office?: string | null
          care_manager_name?: string | null
          certification_date?: string | null
          certification_status?: string | null
          community_comprehensive_center?: string | null
          created_at?: string | null
          id?: number
          insured_person_number?: string | null
          insurer_name?: string | null
          insurer_number?: string | null
          plan_request_date?: string | null
          updated_at?: string | null
          user_kana?: string | null
          user_name: string
          valid_end_date?: string | null
          valid_start_date?: string | null
        }
        Update: {
          benefit_rate?: number | null
          care_level?: string | null
          care_management_office?: string | null
          care_manager_name?: string | null
          certification_date?: string | null
          certification_status?: string | null
          community_comprehensive_center?: string | null
          created_at?: string | null
          id?: number
          insured_person_number?: string | null
          insurer_name?: string | null
          insurer_number?: string | null
          plan_request_date?: string | null
          updated_at?: string | null
          user_kana?: string | null
          user_name?: string
          valid_end_date?: string | null
          valid_start_date?: string | null
        }
        Relationships: []
      }
      cs_kaipoke_time_adjustability: {
        Row: {
          Advance_adjustability: number | null
          Backwoard_adjustability: number | null
          created_at: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          Advance_adjustability?: number | null
          Backwoard_adjustability?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          Advance_adjustability?: number | null
          Backwoard_adjustability?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      dialogflow_pending_shift_requests: {
        Row: {
          channel_id: string
          confirm_summary: string | null
          created_at: string
          end_time: string | null
          expires_at: string | null
          id: string
          inferred_service_code: string | null
          inferred_service_reason: string | null
          intent_name: string | null
          is_judo_ido: boolean | null
          judo_ido: string | null
          last_message: string | null
          mentioned_lw_userids: Json | null
          raw_dialogflow: Json | null
          raw_event: Json | null
          requester_lw_userid: string | null
          requester_user_id: string | null
          required_staff_count: number
          service_code: string | null
          session_key: string
          shift_date: string | null
          source_message: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean
          staff_02_role: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean
          staff_03_role: string | null
          staff_03_user_id: string | null
          start_time: string | null
          status: string
          support_type: string | null
          target_kaipoke_cs_id: string | null
          target_shift_id: number | null
          two_person_work_flg: boolean
          updated_at: string
        }
        Insert: {
          channel_id: string
          confirm_summary?: string | null
          created_at?: string
          end_time?: string | null
          expires_at?: string | null
          id?: string
          inferred_service_code?: string | null
          inferred_service_reason?: string | null
          intent_name?: string | null
          is_judo_ido?: boolean | null
          judo_ido?: string | null
          last_message?: string | null
          mentioned_lw_userids?: Json | null
          raw_dialogflow?: Json | null
          raw_event?: Json | null
          requester_lw_userid?: string | null
          requester_user_id?: string | null
          required_staff_count?: number
          service_code?: string | null
          session_key: string
          shift_date?: string | null
          source_message?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean
          staff_02_role?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean
          staff_03_role?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          status?: string
          support_type?: string | null
          target_kaipoke_cs_id?: string | null
          target_shift_id?: number | null
          two_person_work_flg?: boolean
          updated_at?: string
        }
        Update: {
          channel_id?: string
          confirm_summary?: string | null
          created_at?: string
          end_time?: string | null
          expires_at?: string | null
          id?: string
          inferred_service_code?: string | null
          inferred_service_reason?: string | null
          intent_name?: string | null
          is_judo_ido?: boolean | null
          judo_ido?: string | null
          last_message?: string | null
          mentioned_lw_userids?: Json | null
          raw_dialogflow?: Json | null
          raw_event?: Json | null
          requester_lw_userid?: string | null
          requester_user_id?: string | null
          required_staff_count?: number
          service_code?: string | null
          session_key?: string
          shift_date?: string | null
          source_message?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean
          staff_02_role?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean
          staff_03_role?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          status?: string
          support_type?: string | null
          target_kaipoke_cs_id?: string | null
          target_shift_id?: number | null
          two_person_work_flg?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      disability_check: {
        Row: {
          application_check: boolean | null
          asigned_jisseki_staff: string | null
          id: string
          is_checked: boolean
          kaipoke_cs_id: string
          kaipoke_servicek: string
          year_month: string
        }
        Insert: {
          application_check?: boolean | null
          asigned_jisseki_staff?: string | null
          id?: string
          is_checked?: boolean
          kaipoke_cs_id: string
          kaipoke_servicek: string
          year_month: string
        }
        Update: {
          application_check?: boolean | null
          asigned_jisseki_staff?: string | null
          id?: string
          is_checked?: boolean
          kaipoke_cs_id?: string
          kaipoke_servicek?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "disability_check_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "disability_check_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "disability_check_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "disability_check_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "disability_check_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      employee_training_goals: {
        Row: {
          category: string | null
          created_at: string
          entry_id: string
          goal_key: string
          goal_title: string
          group_code: string | null
          id: string
          remark: string | null
          row_type: string
          selected: boolean
          sort_order: number
          target_condition: string | null
          training_goal: string | null
          updated_at: string
          user_id: string | null
          video_url: string | null
          watched: boolean
        }
        Insert: {
          category?: string | null
          created_at?: string
          entry_id: string
          goal_key: string
          goal_title: string
          group_code?: string | null
          id?: string
          remark?: string | null
          row_type?: string
          selected?: boolean
          sort_order?: number
          target_condition?: string | null
          training_goal?: string | null
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
          watched?: boolean
        }
        Update: {
          category?: string | null
          created_at?: string
          entry_id?: string
          goal_key?: string
          goal_title?: string
          group_code?: string | null
          id?: string
          remark?: string | null
          row_type?: string
          selected?: boolean
          sort_order?: number
          target_condition?: string | null
          training_goal?: string | null
          updated_at?: string
          user_id?: string | null
          video_url?: string | null
          watched?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_ordered"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "taimee_employees_with_entry"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "employee_training_goals_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["form_entries_id"]
          },
        ]
      }
      end_at: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      entry_attachments: {
        Row: {
          created_at: string
          drive_file_id: string | null
          drive_web_view_link: string | null
          entry_id: string | null
          error_code: string | null
          id: string
          mime_type: string | null
          original_filename: string
          slot: string
          status: string
          submission_id: string
          updated_at: string
          upload_token: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          drive_web_view_link?: string | null
          entry_id?: string | null
          error_code?: string | null
          id?: string
          mime_type?: string | null
          original_filename: string
          slot: string
          status?: string
          submission_id: string
          updated_at?: string
          upload_token?: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          drive_web_view_link?: string | null
          entry_id?: string | null
          error_code?: string | null
          id?: string
          mime_type?: string | null
          original_filename?: string
          slot?: string
          status?: string
          submission_id?: string
          updated_at?: string
          upload_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_ordered"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "form_entries_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "taimee_employees_with_entry"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "entry_attachments_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["form_entries_id"]
          },
        ]
      }
      env_variables: {
        Row: {
          created_at: string | null
          expires_at: string | null
          group_key: string
          id: string
          key_name: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          group_key: string
          id?: string
          key_name: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          group_key?: string
          id?: string
          key_name?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      event_task_required_docs: {
        Row: {
          checked_at: string | null
          checked_by_user_id: string | null
          created_at: string
          doc_type_id: string
          event_task_id: string
          id: string
          memo: string | null
          result_doc_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          checked_at?: string | null
          checked_by_user_id?: string | null
          created_at?: string
          doc_type_id: string
          event_task_id: string
          id?: string
          memo?: string | null
          result_doc_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          checked_at?: string | null
          checked_by_user_id?: string | null
          created_at?: string
          doc_type_id?: string
          event_task_id?: string
          id?: string
          memo?: string | null
          result_doc_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_task_required_docs_doc_type"
            columns: ["doc_type_id"]
            isOneToOne: false
            referencedRelation: "user_doc_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_task_required_docs_result_doc"
            columns: ["result_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_task_required_docs_result_doc"
            columns: ["result_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs_extract_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_task_required_docs_task"
            columns: ["event_task_id"]
            isOneToOne: false
            referencedRelation: "event_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          closed_at: string | null
          created_at: string
          due_date: string
          id: string
          kaipoke_cs_id: string
          memo: string | null
          orgunitid: string | null
          status: string
          template_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          due_date: string
          id?: string
          kaipoke_cs_id: string
          memo?: string | null
          orgunitid?: string | null
          status?: string
          template_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          due_date?: string
          id?: string
          kaipoke_cs_id?: string
          memo?: string | null
          orgunitid?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_tasks_cs"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_event_tasks_cs"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_event_tasks_cs"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_event_tasks_cs"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_event_tasks_cs"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_event_tasks_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_template"
            referencedColumns: ["id"]
          },
        ]
      }
      event_template: {
        Row: {
          created_at: string
          due_offset_days: number
          due_rule_json: Json
          due_rule_type: string
          id: string
          is_active: boolean
          overview: string | null
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_offset_days?: number
          due_rule_json?: Json
          due_rule_type?: string
          id?: string
          is_active?: boolean
          overview?: string | null
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_offset_days?: number
          due_rule_json?: Json
          due_rule_type?: string
          id?: string
          is_active?: boolean
          overview?: string | null
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_template_required_docs: {
        Row: {
          check_source: string
          created_at: string
          doc_type_id: string
          id: string
          memo: string | null
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          check_source?: string
          created_at?: string
          doc_type_id: string
          id?: string
          memo?: string | null
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          check_source?: string
          created_at?: string
          doc_type_id?: string
          id?: string
          memo?: string | null
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_event_template_required_docs_doc_type"
            columns: ["doc_type_id"]
            isOneToOne: false
            referencedRelation: "user_doc_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_event_template_required_docs_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "event_template"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reimbursements: {
        Row: {
          account_number: string | null
          bank_account_name_kana: string | null
          bank_name: string | null
          bank_symbol: string | null
          branch_name: string | null
          branch_number: string | null
          created_at: string
          expense_amount: number
          expense_detail: string | null
          id: string
          notified_at: string | null
          receipt_photo_url: string | null
          service_date: string
          service_end_time: string | null
          service_start_time: string
          staff_name: string
        }
        Insert: {
          account_number?: string | null
          bank_account_name_kana?: string | null
          bank_name?: string | null
          bank_symbol?: string | null
          branch_name?: string | null
          branch_number?: string | null
          created_at?: string
          expense_amount: number
          expense_detail?: string | null
          id?: string
          notified_at?: string | null
          receipt_photo_url?: string | null
          service_date: string
          service_end_time?: string | null
          service_start_time: string
          staff_name: string
        }
        Update: {
          account_number?: string | null
          bank_account_name_kana?: string | null
          bank_name?: string | null
          bank_symbol?: string | null
          branch_name?: string | null
          branch_number?: string | null
          created_at?: string
          expense_amount?: number
          expense_detail?: string | null
          id?: string
          notified_at?: string | null
          receipt_photo_url?: string | null
          service_date?: string
          service_end_time?: string | null
          service_start_time?: string
          staff_name?: string
        }
        Relationships: []
      }
      external_expense_claims: {
        Row: {
          account_holder: string
          account_number: string
          account_type: string
          approved_at: string | null
          approved_by: string | null
          bank_name: string
          branch_name: string
          created_at: string
          email: string | null
          expense1_amount: number | null
          expense1_description: string | null
          expense2_amount: number | null
          expense2_description: string | null
          expense3_amount: number | null
          expense3_description: string | null
          expense4_amount: number | null
          expense4_description: string | null
          expense5_amount: number | null
          expense5_description: string | null
          id: string
          name: string
          paid_at: string | null
          paid_by: string | null
          phone: string
          receipt_files: Json | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          total_amount: number
          updated_at: string
          work_date: string
        }
        Insert: {
          account_holder: string
          account_number: string
          account_type: string
          approved_at?: string | null
          approved_by?: string | null
          bank_name: string
          branch_name: string
          created_at?: string
          email?: string | null
          expense1_amount?: number | null
          expense1_description?: string | null
          expense2_amount?: number | null
          expense2_description?: string | null
          expense3_amount?: number | null
          expense3_description?: string | null
          expense4_amount?: number | null
          expense4_description?: string | null
          expense5_amount?: number | null
          expense5_description?: string | null
          id?: string
          name: string
          paid_at?: string | null
          paid_by?: string | null
          phone: string
          receipt_files?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          work_date: string
        }
        Update: {
          account_holder?: string
          account_number?: string
          account_type?: string
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string
          branch_name?: string
          created_at?: string
          email?: string | null
          expense1_amount?: number | null
          expense1_description?: string | null
          expense2_amount?: number | null
          expense2_description?: string | null
          expense3_amount?: number | null
          expense3_description?: string | null
          expense4_amount?: number | null
          expense4_description?: string | null
          expense5_amount?: number | null
          expense5_description?: string | null
          id?: string
          name?: string
          paid_at?: string | null
          paid_by?: string | null
          phone?: string
          receipt_files?: Json | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          work_date?: string
        }
        Relationships: []
      }
      fax: {
        Row: {
          email: string | null
          fax: string
          id: string
          office_name: string | null
          postal_code: string | null
          registration_number: string | null
          service_kind: string | null
          service_kind_id: string | null
        }
        Insert: {
          email?: string | null
          fax: string
          id?: string
          office_name?: string | null
          postal_code?: string | null
          registration_number?: string | null
          service_kind?: string | null
          service_kind_id?: string | null
        }
        Update: {
          email?: string | null
          fax?: string
          id?: string
          office_name?: string | null
          postal_code?: string | null
          registration_number?: string | null
          service_kind?: string | null
          service_kind_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fax_service_kind_fk"
            columns: ["service_kind_id"]
            isOneToOne: false
            referencedRelation: "service_kinds"
            referencedColumns: ["id"]
          },
        ]
      }
      fax_log: {
        Row: {
          accepted_at: string | null
          batch_id: string
          created_at: string
          fax_master_id: string | null
          fax_number: string
          faximo_request_id: string | null
          faximo_result_code: string | null
          file_count: number
          file_names: string[] | null
          id: string
          mail_to: string | null
          office_name: string | null
          page_name: string | null
          process_key: string | null
          recipient_count: number
          requester_user_id: string | null
          requester_user_name: string | null
          result_mail_body: string | null
          result_mail_message_id: string | null
          result_mail_received_at: string | null
          result_mail_subject: string | null
          retry_count: number | null
          status: string
          status_message: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          batch_id: string
          created_at?: string
          fax_master_id?: string | null
          fax_number: string
          faximo_request_id?: string | null
          faximo_result_code?: string | null
          file_count?: number
          file_names?: string[] | null
          id?: string
          mail_to?: string | null
          office_name?: string | null
          page_name?: string | null
          process_key?: string | null
          recipient_count?: number
          requester_user_id?: string | null
          requester_user_name?: string | null
          result_mail_body?: string | null
          result_mail_message_id?: string | null
          result_mail_received_at?: string | null
          result_mail_subject?: string | null
          retry_count?: number | null
          status?: string
          status_message?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          batch_id?: string
          created_at?: string
          fax_master_id?: string | null
          fax_number?: string
          faximo_request_id?: string | null
          faximo_result_code?: string | null
          file_count?: number
          file_names?: string[] | null
          id?: string
          mail_to?: string | null
          office_name?: string | null
          page_name?: string | null
          process_key?: string | null
          recipient_count?: number
          requester_user_id?: string | null
          requester_user_name?: string | null
          result_mail_body?: string | null
          result_mail_message_id?: string | null
          result_mail_received_at?: string | null
          result_mail_subject?: string | null
          retry_count?: number | null
          status?: string
          status_message?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      form_entries: {
        Row: {
          address: string | null
          agreed_at: string | null
          agreed_privacy: boolean | null
          agreed_terms: boolean | null
          attachments: Json | null
          auth_uid: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          commute_options: string[] | null
          consent_snapshot: Json | null
          created_at: string | null
          email: string | null
          first_name_kana: string | null
          first_name_kanji: string
          gender: string | null
          health_condition: string | null
          id: string
          last_name_kana: string | null
          last_name_kanji: string
          license_back_url: string | null
          license_files: Json | null
          license_front_url: string | null
          manager_note: string | null
          motivation: string | null
          normalized_email: string | null
          period_from_1: string | null
          period_from_2: string | null
          period_from_3: string | null
          period_to_1: string | null
          period_to_2: string | null
          period_to_3: string | null
          phone: string | null
          photo_url: string | null
          postal_code: string | null
          reapply_requested_at: string | null
          reentry_blacklisted: boolean
          residence_card_url: string | null
          submission_id: string | null
          work_styles: string[] | null
          workplace_1: string | null
          workplace_2: string | null
          workplace_3: string | null
          workstyle_other: string | null
        }
        Insert: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          attachments?: Json | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji: string
          gender?: string | null
          health_condition?: string | null
          id?: string
          last_name_kana?: string | null
          last_name_kanji: string
          license_back_url?: string | null
          license_files?: Json | null
          license_front_url?: string | null
          manager_note?: string | null
          motivation?: string | null
          normalized_email?: string | null
          period_from_1?: string | null
          period_from_2?: string | null
          period_from_3?: string | null
          period_to_1?: string | null
          period_to_2?: string | null
          period_to_3?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          reapply_requested_at?: string | null
          reentry_blacklisted?: boolean
          residence_card_url?: string | null
          submission_id?: string | null
          work_styles?: string[] | null
          workplace_1?: string | null
          workplace_2?: string | null
          workplace_3?: string | null
          workstyle_other?: string | null
        }
        Update: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          attachments?: Json | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji?: string
          gender?: string | null
          health_condition?: string | null
          id?: string
          last_name_kana?: string | null
          last_name_kanji?: string
          license_back_url?: string | null
          license_files?: Json | null
          license_front_url?: string | null
          manager_note?: string | null
          motivation?: string | null
          normalized_email?: string | null
          period_from_1?: string | null
          period_from_2?: string | null
          period_from_3?: string | null
          period_to_1?: string | null
          period_to_2?: string | null
          period_to_3?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          reapply_requested_at?: string | null
          reentry_blacklisted?: boolean
          residence_card_url?: string | null
          submission_id?: string | null
          work_styles?: string[] | null
          workplace_1?: string | null
          workplace_2?: string | null
          workplace_3?: string | null
          workstyle_other?: string | null
        }
        Relationships: []
      }
      google_calendar_events: {
        Row: {
          created_at: string
          description: string | null
          editable_in_myfamille: boolean
          end_at: string
          google_calendar_id: string
          google_etag: string | null
          google_event_id: string
          google_status: string | null
          google_updated_at: string | null
          id: string
          is_all_day: boolean
          is_deleted: boolean
          location: string | null
          start_at: string
          synced_at: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          editable_in_myfamille?: boolean
          end_at: string
          google_calendar_id: string
          google_etag?: string | null
          google_event_id: string
          google_status?: string | null
          google_updated_at?: string | null
          id?: string
          is_all_day?: boolean
          is_deleted?: boolean
          location?: string | null
          start_at: string
          synced_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          editable_in_myfamille?: boolean
          end_at?: string
          google_calendar_id?: string
          google_etag?: string | null
          google_event_id?: string
          google_status?: string | null
          google_updated_at?: string | null
          id?: string
          is_all_day?: boolean
          is_deleted?: boolean
          location?: string | null
          start_at?: string
          synced_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      google_calendar_user_links: {
        Row: {
          access_role: string | null
          calendar_name: string | null
          created_at: string
          google_calendar_id: string
          id: string
          last_synced_at: string | null
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          access_role?: string | null
          calendar_name?: string | null
          created_at?: string
          google_calendar_id: string
          id?: string
          last_synced_at?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          access_role?: string | null
          calendar_name?: string | null
          created_at?: string
          google_calendar_id?: string
          id?: string
          last_synced_at?: string | null
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      group_lw_channel_info: {
        Row: {
          channel_id: string
          channel_id_secondary: string | null
          fetched_at: string | null
          group_id: string
          id: string
        }
        Insert: {
          channel_id: string
          channel_id_secondary?: string | null
          fetched_at?: string | null
          group_id: string
          id?: string
        }
        Update: {
          channel_id?: string
          channel_id_secondary?: string | null
          fetched_at?: string | null
          group_id?: string
          id?: string
        }
        Relationships: []
      }
      groups_lw: {
        Row: {
          client_code: string | null
          group_account: string | null
          group_account_secondary: string | null
          group_id: string
          group_name: string
          group_type: string | null
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          client_code?: string | null
          group_account?: string | null
          group_account_secondary?: string | null
          group_id: string
          group_name: string
          group_type?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          client_code?: string | null
          group_account?: string | null
          group_account_secondary?: string | null
          group_id?: string
          group_name?: string
          group_type?: string | null
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      groups_lw_temp: {
        Row: {
          client_code: string | null
          created_at: string | null
          group_account: string | null
          group_id: string
          group_name: string | null
          raw_group_name: string | null
          source: string | null
        }
        Insert: {
          client_code?: string | null
          created_at?: string | null
          group_account?: string | null
          group_id: string
          group_name?: string | null
          raw_group_name?: string | null
          source?: string | null
        }
        Update: {
          client_code?: string | null
          created_at?: string | null
          group_account?: string | null
          group_id?: string
          group_name?: string | null
          raw_group_name?: string | null
          source?: string | null
        }
        Relationships: []
      }
      insurance_unit_amount: {
        Row: {
          cal_hour: number | null
          cs_pay: string | null
          id: string
          insurance_kind: string | null
          insurer: string | null
          internal_service_code: number | null
          internala_service_name: string | null
          service_unit_amount: string | null
        }
        Insert: {
          cal_hour?: number | null
          cs_pay?: string | null
          id?: string
          insurance_kind?: string | null
          insurer?: string | null
          internal_service_code?: number | null
          internala_service_name?: string | null
          service_unit_amount?: string | null
        }
        Update: {
          cal_hour?: number | null
          cs_pay?: string | null
          id?: string
          insurance_kind?: string | null
          insurer?: string | null
          internal_service_code?: number | null
          internala_service_name?: string | null
          service_unit_amount?: string | null
        }
        Relationships: []
      }
      jisseki_forms: {
        Row: {
          created_at: string | null
          form_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          form_name: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          form_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      levels: {
        Row: {
          description: string | null
          id: string
          name: string | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          id: string
          name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          name?: string | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      levels_temp: {
        Row: {
          created_at: string | null
          display_order: number
          executive: boolean
          id: string
          level_external_key: string | null
          level_id: string
          level_name: string
        }
        Insert: {
          created_at?: string | null
          display_order: number
          executive: boolean
          id?: string
          level_external_key?: string | null
          level_id: string
          level_name: string
        }
        Update: {
          created_at?: string | null
          display_order?: number
          executive?: boolean
          id?: string
          level_external_key?: string | null
          level_id?: string
          level_name?: string
        }
        Relationships: []
      }
      login_lineworks_otp: {
        Row: {
          auth_user_id: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
        }
        Insert: {
          auth_user_id: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
        }
        Update: {
          auth_user_id?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      login_trusted_devices: {
        Row: {
          auth_user_id: string
          created_at: string
          device_name: string | null
          expires_at: string
          id: string
          last_ip: string | null
          last_used_at: string
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          device_name?: string | null
          expires_at: string
          id?: string
          last_ip?: string | null
          last_used_at?: string
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          device_name?: string | null
          expires_at?: string
          id?: string
          last_ip?: string | null
          last_used_at?: string
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      lw_channels: {
        Row: {
          channel_code: string
          channel_id: string
          channel_name: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          channel_code: string
          channel_id: string
          channel_name: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          channel_code?: string
          channel_id?: string
          channel_name?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      monthly_meeting_attendance: {
        Row: {
          attended_extra: boolean
          attended_regular: boolean
          checked_extra: boolean
          checked_regular: boolean
          created_at: string
          manager_checked: boolean | null
          manager_checked_at: string | null
          manager_checked_by: string | null
          meeting_date: string | null
          minutes_url: string | null
          required: boolean
          staff_comment: string | null
          target_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attended_extra?: boolean
          attended_regular?: boolean
          checked_extra?: boolean
          checked_regular?: boolean
          created_at?: string
          manager_checked?: boolean | null
          manager_checked_at?: string | null
          manager_checked_by?: string | null
          meeting_date?: string | null
          minutes_url?: string | null
          required?: boolean
          staff_comment?: string | null
          target_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attended_extra?: boolean
          attended_regular?: boolean
          checked_extra?: boolean
          checked_regular?: boolean
          created_at?: string
          manager_checked?: boolean | null
          manager_checked_at?: string | null
          manager_checked_by?: string | null
          meeting_date?: string | null
          minutes_url?: string | null
          required?: boolean
          staff_comment?: string | null
          target_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "audit_log_display_view"
            referencedColumns: ["actor_user_id_text"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_manager_checked_by_fkey"
            columns: ["manager_checked_by"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "audit_log_display_view"
            referencedColumns: ["actor_user_id_text"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["manager_user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_entry_united_view_single_career"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "monthly_meeting_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["user_id"]
          },
        ]
      }
      msg_lw_analysis_log: {
        Row: {
          channel_id: string
          created_at: string | null
          id: number
          reason: string
          text: string
          timestamp: string
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: number
          reason: string
          text: string
          timestamp: string
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: number
          reason?: string
          text?: string
          timestamp?: string
        }
        Relationships: []
      }
      msg_lw_log: {
        Row: {
          channel_id: string
          domain_id: string
          event_type: string
          file_id: string | null
          id: number
          members: Json | null
          mention_lw_userids: Json | null
          message: string | null
          raw_event: Json | null
          status: number | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          channel_id: string
          domain_id: string
          event_type: string
          file_id?: string | null
          id?: number
          members?: Json | null
          mention_lw_userids?: Json | null
          message?: string | null
          raw_event?: Json | null
          status?: number | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          channel_id?: string
          domain_id?: string
          event_type?: string
          file_id?: string | null
          id?: number
          members?: Json | null
          mention_lw_userids?: Json | null
          message?: string | null
          raw_event?: Json | null
          status?: number | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_msg_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "msg_lw_status"
            referencedColumns: ["id"]
          },
        ]
      }
      msg_lw_status: {
        Row: {
          description: string | null
          id: number
          label: string
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          id: number
          label: string
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          id?: number
          label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      org_icons: {
        Row: {
          category: string
          file_id: string
          file_name: string
          file_size: number
          id: string
          org_id: string
          updated_at: string | null
          uploaded: boolean | null
        }
        Insert: {
          category: string
          file_id: string
          file_name: string
          file_size: number
          id?: string
          org_id: string
          updated_at?: string | null
          uploaded?: boolean | null
        }
        Update: {
          category?: string
          file_id?: string
          file_name?: string
          file_size?: number
          id?: string
          org_id?: string
          updated_at?: string | null
          uploaded?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_org_icons_category"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "org_icons_category"
            referencedColumns: ["id"]
          },
        ]
      }
      org_icons_category: {
        Row: {
          description: string | null
          id: string
          label: string
          service_kind: string | null
          sort_order: number
        }
        Insert: {
          description?: string | null
          id: string
          label: string
          service_kind?: string | null
          sort_order: number
        }
        Update: {
          description?: string | null
          id?: string
          label?: string
          service_kind?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      orgs: {
        Row: {
          description: string | null
          displaylevel: number | null
          displayorder: number | null
          meeting_must: boolean
          mgr_user_id: string | null
          orgunitid: string
          orgunitname: string
          parentorgunitid: string | null
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          displaylevel?: number | null
          displayorder?: number | null
          meeting_must?: boolean
          mgr_user_id?: string | null
          orgunitid: string
          orgunitname: string
          parentorgunitid?: string | null
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          displaylevel?: number | null
          displayorder?: number | null
          meeting_must?: boolean
          mgr_user_id?: string | null
          orgunitid?: string
          orgunitname?: string
          parentorgunitid?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      orgs_temp: {
        Row: {
          aliasemails: Json | null
          canreceiveexternalmail: boolean | null
          description: string | null
          displaylevel: number | null
          displayorder: number | null
          email: string | null
          membersallowedtouseorgunitemailasrecipient: Json | null
          membersallowedtouseorgunitemailassender: Json | null
          orgunitexternalkey: string | null
          orgunitid: string
          orgunitname: string
          parentexternalkey: string | null
          parentorgunitid: string | null
          usecalendar: boolean | null
          usefolder: boolean | null
          usemessage: boolean | null
          usenote: boolean | null
          useservicenotification: boolean | null
          usetask: boolean | null
          visible: boolean | null
        }
        Insert: {
          aliasemails?: Json | null
          canreceiveexternalmail?: boolean | null
          description?: string | null
          displaylevel?: number | null
          displayorder?: number | null
          email?: string | null
          membersallowedtouseorgunitemailasrecipient?: Json | null
          membersallowedtouseorgunitemailassender?: Json | null
          orgunitexternalkey?: string | null
          orgunitid: string
          orgunitname: string
          parentexternalkey?: string | null
          parentorgunitid?: string | null
          usecalendar?: boolean | null
          usefolder?: boolean | null
          usemessage?: boolean | null
          usenote?: boolean | null
          useservicenotification?: boolean | null
          usetask?: boolean | null
          visible?: boolean | null
        }
        Update: {
          aliasemails?: Json | null
          canreceiveexternalmail?: boolean | null
          description?: string | null
          displaylevel?: number | null
          displayorder?: number | null
          email?: string | null
          membersallowedtouseorgunitemailasrecipient?: Json | null
          membersallowedtouseorgunitemailassender?: Json | null
          orgunitexternalkey?: string | null
          orgunitid?: string
          orgunitname?: string
          parentexternalkey?: string | null
          parentorgunitid?: string | null
          usecalendar?: boolean | null
          usefolder?: boolean | null
          usemessage?: boolean | null
          usenote?: boolean | null
          useservicenotification?: boolean | null
          usetask?: boolean | null
          visible?: boolean | null
        }
        Relationships: []
      }
      parking_cs_places: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          kaipoke_cs_id: string
          label: string
          location_link: string | null
          parking_orientation: string | null
          permit_required: boolean | null
          picture1_url: string | null
          picture2_url: string | null
          police_station_place_id: string | null
          remarks: string | null
          serial: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          kaipoke_cs_id: string
          label: string
          location_link?: string | null
          parking_orientation?: string | null
          permit_required?: boolean | null
          picture1_url?: string | null
          picture2_url?: string | null
          police_station_place_id?: string | null
          remarks?: string | null
          serial: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          kaipoke_cs_id?: string
          label?: string
          location_link?: string | null
          parking_orientation?: string | null
          permit_required?: boolean | null
          picture1_url?: string | null
          picture2_url?: string | null
          police_station_place_id?: string | null
          remarks?: string | null
          serial?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      phone: {
        Row: {
          name: string | null
          phone: string
        }
        Insert: {
          name?: string | null
          phone: string
        }
        Update: {
          name?: string | null
          phone?: string
        }
        Relationships: []
      }
      plan_long_term_goals: {
        Row: {
          achievement_level: string | null
          active: boolean
          created_at: string
          display_order: number
          effectiveness_satisfaction: string | null
          generation_meta: Json
          goal_end_date: string | null
          goal_start_date: string | null
          goal_text: string | null
          plan_id: string
          plan_long_term_goal_id: string
          source_cs_doc_id: string | null
          source_goal_key: string | null
          source_goal_text: string | null
          source_snapshot: Json
          updated_at: string
        }
        Insert: {
          achievement_level?: string | null
          active?: boolean
          created_at?: string
          display_order?: number
          effectiveness_satisfaction?: string | null
          generation_meta?: Json
          goal_end_date?: string | null
          goal_start_date?: string | null
          goal_text?: string | null
          plan_id: string
          plan_long_term_goal_id?: string
          source_cs_doc_id?: string | null
          source_goal_key?: string | null
          source_goal_text?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Update: {
          achievement_level?: string | null
          active?: boolean
          created_at?: string
          display_order?: number
          effectiveness_satisfaction?: string | null
          generation_meta?: Json
          goal_end_date?: string | null
          goal_start_date?: string | null
          goal_text?: string | null
          plan_id?: string
          plan_long_term_goal_id?: string
          source_cs_doc_id?: string | null
          source_goal_key?: string | null
          source_goal_text?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_long_term_goals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_goal_tree_view"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_long_term_goals_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_long_term_goals_source_cs_doc_id_fkey"
            columns: ["source_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_long_term_goals_source_cs_doc_id_fkey"
            columns: ["source_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs_extract_target"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_service_short_term_goals: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          generation_meta: Json
          plan_service_id: string
          plan_service_short_term_goal_id: string
          plan_short_term_goal_id: string
          relation_note: string | null
          source_snapshot: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          generation_meta?: Json
          plan_service_id: string
          plan_service_short_term_goal_id?: string
          plan_short_term_goal_id: string
          relation_note?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          generation_meta?: Json
          plan_service_id?: string
          plan_service_short_term_goal_id?: string
          plan_short_term_goal_id?: string
          relation_note?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_service_short_term_goals_goal_fkey"
            columns: ["plan_short_term_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goal_tree_view"
            referencedColumns: ["plan_short_term_goal_id"]
          },
          {
            foreignKeyName: "plan_service_short_term_goals_goal_fkey"
            columns: ["plan_short_term_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_short_term_goals"
            referencedColumns: ["plan_short_term_goal_id"]
          },
          {
            foreignKeyName: "plan_service_short_term_goals_service_fkey"
            columns: ["plan_service_id"]
            isOneToOne: false
            referencedRelation: "plan_services"
            referencedColumns: ["plan_service_id"]
          },
          {
            foreignKeyName: "plan_service_short_term_goals_service_fkey"
            columns: ["plan_service_id"]
            isOneToOne: false
            referencedRelation: "plan_services_view"
            referencedColumns: ["plan_service_id"]
          },
        ]
      }
      plan_services: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          duration_minutes: number | null
          end_time: string | null
          family_action: string | null
          generation_meta: Json
          is_biweekly: boolean | null
          monthly_hours: number | null
          monthly_minutes: number | null
          monthly_occurrence_factor: number | null
          nth_weeks: number[] | null
          observation_points: string | null
          plan_document_kind: string
          plan_id: string
          plan_service_category: string | null
          plan_service_id: string
          procedure_notes: string | null
          required_staff_count: number | null
          schedule_note: string | null
          service_code: string | null
          service_detail: string | null
          service_no: number
          service_title: string | null
          shift_service_code_id: string | null
          source_snapshot: Json
          start_time: string | null
          template_id: number | null
          two_person_work_flg: boolean
          updated_at: string
          weekday: number | null
          weekday_jp: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          end_time?: string | null
          family_action?: string | null
          generation_meta?: Json
          is_biweekly?: boolean | null
          monthly_hours?: number | null
          monthly_minutes?: number | null
          monthly_occurrence_factor?: number | null
          nth_weeks?: number[] | null
          observation_points?: string | null
          plan_document_kind: string
          plan_id: string
          plan_service_category?: string | null
          plan_service_id?: string
          procedure_notes?: string | null
          required_staff_count?: number | null
          schedule_note?: string | null
          service_code?: string | null
          service_detail?: string | null
          service_no?: number
          service_title?: string | null
          shift_service_code_id?: string | null
          source_snapshot?: Json
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean
          updated_at?: string
          weekday?: number | null
          weekday_jp?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          duration_minutes?: number | null
          end_time?: string | null
          family_action?: string | null
          generation_meta?: Json
          is_biweekly?: boolean | null
          monthly_hours?: number | null
          monthly_minutes?: number | null
          monthly_occurrence_factor?: number | null
          nth_weeks?: number[] | null
          observation_points?: string | null
          plan_document_kind?: string
          plan_id?: string
          plan_service_category?: string | null
          plan_service_id?: string
          procedure_notes?: string | null
          required_staff_count?: number | null
          schedule_note?: string | null
          service_code?: string | null
          service_detail?: string | null
          service_no?: number
          service_title?: string | null
          shift_service_code_id?: string | null
          source_snapshot?: Json
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean
          updated_at?: string
          weekday?: number | null
          weekday_jp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_goal_tree_view"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_services_shift_service_code_id_fkey"
            columns: ["shift_service_code_id"]
            isOneToOne: false
            referencedRelation: "plan_generation_source_view"
            referencedColumns: ["shift_service_code_id"]
          },
          {
            foreignKeyName: "plan_services_shift_service_code_id_fkey"
            columns: ["shift_service_code_id"]
            isOneToOne: false
            referencedRelation: "shift_service_code"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_generation_source_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_weekly_template"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_weekly_template_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shit_weekly_template_view"
            referencedColumns: ["template_id"]
          },
        ]
      }
      plan_short_term_goals: {
        Row: {
          achievement_level: string | null
          active: boolean
          created_at: string
          display_order: number
          effectiveness_satisfaction: string | null
          generation_meta: Json
          goal_end_date: string | null
          goal_start_date: string | null
          goal_text: string | null
          plan_long_term_goal_id: string
          plan_short_term_goal_id: string
          source_cs_doc_id: string | null
          source_goal_key: string | null
          source_goal_text: string | null
          source_snapshot: Json
          updated_at: string
        }
        Insert: {
          achievement_level?: string | null
          active?: boolean
          created_at?: string
          display_order?: number
          effectiveness_satisfaction?: string | null
          generation_meta?: Json
          goal_end_date?: string | null
          goal_start_date?: string | null
          goal_text?: string | null
          plan_long_term_goal_id: string
          plan_short_term_goal_id?: string
          source_cs_doc_id?: string | null
          source_goal_key?: string | null
          source_goal_text?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Update: {
          achievement_level?: string | null
          active?: boolean
          created_at?: string
          display_order?: number
          effectiveness_satisfaction?: string | null
          generation_meta?: Json
          goal_end_date?: string | null
          goal_start_date?: string | null
          goal_text?: string | null
          plan_long_term_goal_id?: string
          plan_short_term_goal_id?: string
          source_cs_doc_id?: string | null
          source_goal_key?: string | null
          source_goal_text?: string | null
          source_snapshot?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_short_term_goals_long_term_goal_id_fkey"
            columns: ["plan_long_term_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_goal_tree_view"
            referencedColumns: ["plan_long_term_goal_id"]
          },
          {
            foreignKeyName: "plan_short_term_goals_long_term_goal_id_fkey"
            columns: ["plan_long_term_goal_id"]
            isOneToOne: false
            referencedRelation: "plan_long_term_goals"
            referencedColumns: ["plan_long_term_goal_id"]
          },
          {
            foreignKeyName: "plan_short_term_goals_source_cs_doc_id_fkey"
            columns: ["source_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_short_term_goals_source_cs_doc_id_fkey"
            columns: ["source_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs_extract_target"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          assessment_id: string
          assistance_goal: string | null
          author_name: string | null
          author_user_id: string | null
          base_care_plan_cs_doc_id: string | null
          care_service_history: string | null
          client_info_id: string | null
          content: Json
          created_at: string
          digisign_completed_at: string | null
          digisign_document_id: string | null
          digisign_sent_at: string | null
          digisign_sign_url: string | null
          digisign_signature_request_id: string | null
          digisign_status: string | null
          generation_meta: Json
          health_status: string | null
          home_activity_participation: string | null
          identified_needs: string | null
          is_deleted: boolean
          issued_on: string | null
          kaipoke_cs_id: string
          lineworks_message_id: string | null
          lineworks_sent_at: string | null
          medical_care_risks: string | null
          monthly_summary: Json
          pdf_file_url: string | null
          pdf_generated_at: string | null
          person_family_hope: string | null
          plan_document_kind: string
          plan_end_date: string | null
          plan_id: string
          plan_start_date: string | null
          remarks: string | null
          status: string
          title: string
          updated_at: string
          version_no: number
          weekly_plan_comment: string | null
        }
        Insert: {
          assessment_id: string
          assistance_goal?: string | null
          author_name?: string | null
          author_user_id?: string | null
          base_care_plan_cs_doc_id?: string | null
          care_service_history?: string | null
          client_info_id?: string | null
          content?: Json
          created_at?: string
          digisign_completed_at?: string | null
          digisign_document_id?: string | null
          digisign_sent_at?: string | null
          digisign_sign_url?: string | null
          digisign_signature_request_id?: string | null
          digisign_status?: string | null
          generation_meta?: Json
          health_status?: string | null
          home_activity_participation?: string | null
          identified_needs?: string | null
          is_deleted?: boolean
          issued_on?: string | null
          kaipoke_cs_id: string
          lineworks_message_id?: string | null
          lineworks_sent_at?: string | null
          medical_care_risks?: string | null
          monthly_summary?: Json
          pdf_file_url?: string | null
          pdf_generated_at?: string | null
          person_family_hope?: string | null
          plan_document_kind: string
          plan_end_date?: string | null
          plan_id?: string
          plan_start_date?: string | null
          remarks?: string | null
          status?: string
          title: string
          updated_at?: string
          version_no?: number
          weekly_plan_comment?: string | null
        }
        Update: {
          assessment_id?: string
          assistance_goal?: string | null
          author_name?: string | null
          author_user_id?: string | null
          base_care_plan_cs_doc_id?: string | null
          care_service_history?: string | null
          client_info_id?: string | null
          content?: Json
          created_at?: string
          digisign_completed_at?: string | null
          digisign_document_id?: string | null
          digisign_sent_at?: string | null
          digisign_sign_url?: string | null
          digisign_signature_request_id?: string | null
          digisign_status?: string | null
          generation_meta?: Json
          health_status?: string | null
          home_activity_participation?: string | null
          identified_needs?: string | null
          is_deleted?: boolean
          issued_on?: string | null
          kaipoke_cs_id?: string
          lineworks_message_id?: string | null
          lineworks_sent_at?: string | null
          medical_care_risks?: string | null
          monthly_summary?: Json
          pdf_file_url?: string | null
          pdf_generated_at?: string | null
          person_family_hope?: string | null
          plan_document_kind?: string
          plan_end_date?: string | null
          plan_id?: string
          plan_start_date?: string | null
          remarks?: string | null
          status?: string
          title?: string
          updated_at?: string
          version_no?: number
          weekly_plan_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments_records"
            referencedColumns: ["assessment_id"]
          },
          {
            foreignKeyName: "plans_base_care_plan_cs_doc_id_fkey"
            columns: ["base_care_plan_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_base_care_plan_cs_doc_id_fkey"
            columns: ["base_care_plan_cs_doc_id"]
            isOneToOne: false
            referencedRelation: "cs_docs_extract_target"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
        ]
      }
      positions: {
        Row: {
          description: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          description?: string | null
          id: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      positions_temp: {
        Row: {
          display_order: number
          position_external_key: string | null
          position_id: string
          position_name: string
        }
        Insert: {
          display_order: number
          position_external_key?: string | null
          position_id: string
          position_name: string
        }
        Update: {
          display_order?: number
          position_external_key?: string | null
          position_id?: string
          position_name?: string
        }
        Relationships: []
      }
      postal_district: {
        Row: {
          district: string | null
          dsp_short: string | null
          postal_code_3: string
          transport_fee_per_service: number
        }
        Insert: {
          district?: string | null
          dsp_short?: string | null
          postal_code_3: string
          transport_fee_per_service?: number
        }
        Update: {
          district?: string | null
          dsp_short?: string | null
          postal_code_3?: string
          transport_fee_per_service?: number
        }
        Relationships: []
      }
      reentry_campaign_recipients: {
        Row: {
          campaign_key: string
          created_at: string
          email: string | null
          email_attempted_at: string | null
          email_error: string | null
          email_status: string | null
          id: string
          phone: string | null
          sms_error: string | null
          sms_fallback_sent_at: string | null
          sms_message_sid: string | null
          sms_status: string | null
          staff_id: string
          successful_at: string | null
          updated_at: string
        }
        Insert: {
          campaign_key: string
          created_at?: string
          email?: string | null
          email_attempted_at?: string | null
          email_error?: string | null
          email_status?: string | null
          id?: string
          phone?: string | null
          sms_error?: string | null
          sms_fallback_sent_at?: string | null
          sms_message_sid?: string | null
          sms_status?: string | null
          staff_id: string
          successful_at?: string | null
          updated_at?: string
        }
        Update: {
          campaign_key?: string
          created_at?: string
          email?: string | null
          email_attempted_at?: string | null
          email_error?: string | null
          email_status?: string | null
          id?: string
          phone?: string | null
          sms_error?: string | null
          sms_fallback_sent_at?: string | null
          sms_message_sid?: string | null
          sms_status?: string | null
          staff_id?: string
          successful_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_ordered"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "taimee_employees_with_entry"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "reentry_campaign_recipients_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["form_entries_id"]
          },
        ]
      }
      reentry_recruitment_settings: {
        Row: {
          email_body: string
          email_subject: string
          id: boolean
          sms_body: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          email_body: string
          email_subject: string
          id?: boolean
          sms_body: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          email_body?: string
          email_subject?: string
          id?: boolean
          sms_body?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      rpa_command_args: {
        Row: {
          created_at: string | null
          id: string
          key: string
          label: string
          required: boolean
          sort_order: number
          template_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          label: string
          required?: boolean
          sort_order?: number
          template_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          label?: string
          required?: boolean
          sort_order?: number
          template_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "fk_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rpa_command_args_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "rpa_command_args_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rpa_command_kind: {
        Row: {
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      rpa_command_request_status: {
        Row: {
          created_at: string | null
          description: string | null
          id: number
          label: string
          rpa_process_order: number | null
          sort_order: number | null
          status_code: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: number
          label: string
          rpa_process_order?: number | null
          sort_order?: number | null
          status_code: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: number
          label?: string
          rpa_process_order?: number | null
          sort_order?: number | null
          status_code?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rpa_command_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          created_at: string | null
          end_at: string | null
          id: string
          processed_at: string | null
          request_details: Json
          requested_at: string | null
          requester_id: string
          result_details: Json | null
          result_summary: string | null
          start_at: string | null
          status: string
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string | null
          end_at?: string | null
          id?: string
          processed_at?: string | null
          request_details: Json
          requested_at?: string | null
          requester_id: string
          result_details?: Json | null
          result_summary?: string | null
          start_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string | null
          end_at?: string | null
          id?: string
          processed_at?: string | null
          request_details?: Json
          requested_at?: string | null
          requester_id?: string
          result_details?: Json | null
          result_summary?: string | null
          start_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rpa_command_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "rpa_command_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rpa_command_templates: {
        Row: {
          arg_labels: Json
          created_at: string | null
          description: string | null
          id: string
          kind_id: string | null
          name: string
          result_labels: Json
          updated_at: string | null
        }
        Insert: {
          arg_labels?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          kind_id?: string | null
          name: string
          result_labels?: Json
          updated_at?: string | null
        }
        Update: {
          arg_labels?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          kind_id?: string | null
          name?: string
          result_labels?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_kind"
            columns: ["kind_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_kind"
            referencedColumns: ["id"]
          },
        ]
      }
      rpa_command_type: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_kinds: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      shift: {
        Row: {
          created_at: string
          head_shift_id: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          required_staff_count: number
          service_code: string | null
          shift_end_date: string | null
          shift_end_time: string | null
          shift_id: number
          shift_start_date: string | null
          shift_start_time: string | null
          shift_timerange: unknown
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean
          update_at: string | null
        }
        Insert: {
          created_at?: string
          head_shift_id?: string | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          required_staff_count?: number
          service_code?: string | null
          shift_end_date?: string | null
          shift_end_time?: string | null
          shift_id?: number
          shift_start_date?: string | null
          shift_start_time?: string | null
          shift_timerange?: unknown
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          tokutei_comment?: string | null
          two_person_work_flg?: boolean
          update_at?: string | null
        }
        Update: {
          created_at?: string
          head_shift_id?: string | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          required_staff_count?: number
          service_code?: string | null
          shift_end_date?: string | null
          shift_end_time?: string | null
          shift_id?: number
          shift_start_date?: string | null
          shift_start_time?: string | null
          shift_timerange?: unknown
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          tokutei_comment?: string | null
          two_person_work_flg?: boolean
          update_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_assign_log: {
        Row: {
          accompany: boolean
          candidate_idx: number | null
          created_at: string
          decision: string | null
          empty_idx: number | null
          id: number
          lowest_sort: number | null
          message: string | null
          requested_user_id: string
          required_staff_count: number | null
          shift_id: number
          staff_01_level_sort: number | null
          staff_01_user_id: string | null
          staff_02_level_sort: number | null
          staff_02_user_id: string | null
          staff_03_level_sort: number | null
          staff_03_user_id: string | null
          status: string | null
        }
        Insert: {
          accompany: boolean
          candidate_idx?: number | null
          created_at?: string
          decision?: string | null
          empty_idx?: number | null
          id?: number
          lowest_sort?: number | null
          message?: string | null
          requested_user_id: string
          required_staff_count?: number | null
          shift_id: number
          staff_01_level_sort?: number | null
          staff_01_user_id?: string | null
          staff_02_level_sort?: number | null
          staff_02_user_id?: string | null
          staff_03_level_sort?: number | null
          staff_03_user_id?: string | null
          status?: string | null
        }
        Update: {
          accompany?: boolean
          candidate_idx?: number | null
          created_at?: string
          decision?: string | null
          empty_idx?: number | null
          id?: number
          lowest_sort?: number | null
          message?: string | null
          requested_user_id?: string
          required_staff_count?: number | null
          shift_id?: number
          staff_01_level_sort?: number | null
          staff_01_user_id?: string | null
          staff_02_level_sort?: number | null
          staff_02_user_id?: string | null
          staff_03_level_sort?: number | null
          staff_03_user_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      shift_record_category_l: {
        Row: {
          active: boolean
          code: string
          id: string
          name: string
          rules_json: Json | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          name: string
          rules_json?: Json | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          name?: string
          rules_json?: Json | null
          sort_order?: number
        }
        Relationships: []
      }
      shift_record_category_s: {
        Row: {
          active: boolean
          code: string
          id: string
          l_id: string
          name: string
          rules_json: Json | null
          sort_order: number
        }
        Insert: {
          active?: boolean
          code: string
          id?: string
          l_id: string
          name: string
          rules_json?: Json | null
          sort_order?: number
        }
        Update: {
          active?: boolean
          code?: string
          id?: string
          l_id?: string
          name?: string
          rules_json?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_record_category_s_l_id_fkey"
            columns: ["l_id"]
            isOneToOne: false
            referencedRelation: "shift_record_category_l"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_record_item_defs: {
        Row: {
          active: boolean
          code: string
          default_value: string | null
          id: string
          input_type: string
          l_id: string | null
          label: string
          meta_json: Json
          options: Json
          required: boolean
          rules_json: Json
          s_id: string | null
          sort_order: number
          unit: string | null
        }
        Insert: {
          active?: boolean
          code: string
          default_value?: string | null
          id?: string
          input_type: string
          l_id?: string | null
          label: string
          meta_json?: Json
          options?: Json
          required?: boolean
          rules_json?: Json
          s_id?: string | null
          sort_order?: number
          unit?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          default_value?: string | null
          id?: string
          input_type?: string
          l_id?: string | null
          label?: string
          meta_json?: Json
          options?: Json
          required?: boolean
          rules_json?: Json
          s_id?: string | null
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_record_item_defs_l_id_fkey"
            columns: ["l_id"]
            isOneToOne: false
            referencedRelation: "shift_record_category_l"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_record_item_defs_s_id_fkey"
            columns: ["s_id"]
            isOneToOne: false
            referencedRelation: "shift_record_category_s"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_record_items: {
        Row: {
          created_at: string
          id: string
          item_def_id: string
          note: string | null
          record_id: string
          updated_at: string
          value_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_def_id: string
          note?: string | null
          record_id: string
          updated_at?: string
          value_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_def_id?: string
          note?: string | null
          record_id?: string
          updated_at?: string
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_record_items_item_def_id_fkey"
            columns: ["item_def_id"]
            isOneToOne: false
            referencedRelation: "shift_record_item_defs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_record_items_record_fk"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_record_items_record_fk"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_shift_record_view"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "shift_record_items_record_fk"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_shift_record_view2"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "shift_record_items_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_record_items_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_shift_record_view"
            referencedColumns: ["record_id"]
          },
          {
            foreignKeyName: "shift_record_items_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "shift_shift_record_view2"
            referencedColumns: ["record_id"]
          },
        ]
      }
      shift_records: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          shift_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          shift_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          shift_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_service_code: {
        Row: {
          additional_hourly_wage: number
          contract_requrired: string | null
          created_at: string | null
          id: string
          idou_f: boolean | null
          jisseki_form: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          per_service_amount: number
          plan_display_name: string | null
          plan_document_kind: string | null
          plan_required: string | null
          plan_service_category: string | null
          require_doc_group: string | null
          service_code: string | null
          summary_flg: string | null
          updated_at: string | null
        }
        Insert: {
          additional_hourly_wage?: number
          contract_requrired?: string | null
          created_at?: string | null
          id?: string
          idou_f?: boolean | null
          jisseki_form?: string | null
          kaipoke_servicecode?: string | null
          kaipoke_servicek?: string | null
          per_service_amount?: number
          plan_display_name?: string | null
          plan_document_kind?: string | null
          plan_required?: string | null
          plan_service_category?: string | null
          require_doc_group?: string | null
          service_code?: string | null
          summary_flg?: string | null
          updated_at?: string | null
        }
        Update: {
          additional_hourly_wage?: number
          contract_requrired?: string | null
          created_at?: string | null
          id?: string
          idou_f?: boolean | null
          jisseki_form?: string | null
          kaipoke_servicecode?: string | null
          kaipoke_servicek?: string | null
          per_service_amount?: number
          plan_display_name?: string | null
          plan_document_kind?: string | null
          plan_required?: string | null
          plan_service_category?: string | null
          require_doc_group?: string | null
          service_code?: string | null
          summary_flg?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_service_code_jisseki_form_fkey"
            columns: ["jisseki_form"]
            isOneToOne: false
            referencedRelation: "jisseki_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_temp: {
        Row: {
          created_at: string | null
          head_shift_id: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          required_staff_count: number | null
          service_code: string | null
          shift_end_date: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
          update_at: string | null
        }
        Insert: {
          created_at?: string | null
          head_shift_id?: string | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          required_staff_count?: number | null
          service_code?: string | null
          shift_end_date?: string | null
          shift_end_time?: string | null
          shift_id?: number | null
          shift_start_date?: string | null
          shift_start_time?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          tokutei_comment?: string | null
          two_person_work_flg?: boolean | null
          update_at?: string | null
        }
        Update: {
          created_at?: string | null
          head_shift_id?: string | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          required_staff_count?: number | null
          service_code?: string | null
          shift_end_date?: string | null
          shift_end_time?: string | null
          shift_id?: number | null
          shift_start_date?: string | null
          shift_start_time?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          tokutei_comment?: string | null
          two_person_work_flg?: boolean | null
          update_at?: string | null
        }
        Relationships: []
      }
      shift_weekly_template: {
        Row: {
          active: boolean
          effective_from: string | null
          effective_to: string | null
          end_time: string
          is_biweekly: boolean | null
          judo_ido: string | null
          kaipoke_cs_id: string
          nth_weeks: number[] | null
          required_staff_count: number
          service_code: string
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          start_time: string
          template_id: number
          two_person_work_flg: boolean
          weekday: number
        }
        Insert: {
          active?: boolean
          effective_from?: string | null
          effective_to?: string | null
          end_time: string
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id: string
          nth_weeks?: number[] | null
          required_staff_count?: number
          service_code: string
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time: string
          template_id?: number
          two_person_work_flg?: boolean
          weekday: number
        }
        Update: {
          active?: boolean
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id?: string
          nth_weeks?: number[] | null
          required_staff_count?: number
          service_code?: string
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time?: string
          template_id?: number
          two_person_work_flg?: boolean
          weekday?: number
        }
        Relationships: []
      }
      shift_wishes: {
        Row: {
          created_at: string | null
          id: number
          postal_area_json: Json | null
          preferred_date: Json | null
          preferred_weekday: Json | null
          request_type: string | null
          time_end_hour: number
          time_start_hour: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          postal_area_json?: Json | null
          preferred_date?: Json | null
          preferred_weekday?: Json | null
          request_type?: string | null
          time_end_hour: number
          time_start_hour: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          postal_area_json?: Json | null
          preferred_date?: Json | null
          preferred_weekday?: Json | null
          request_type?: string | null
          time_end_hour?: number
          time_start_hour?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sms_send_logs: {
        Row: {
          created_at: string
          id: string
          kaipoke_cs_id: string
          message_body: string
          recipient_phone: string
          sent_by_auth_user_id: string | null
          shift_id: string
          twilio_message_sid: string | null
          twilio_status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kaipoke_cs_id: string
          message_body: string
          recipient_phone: string
          sent_by_auth_user_id?: string | null
          shift_id: string
          twilio_message_sid?: string | null
          twilio_status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kaipoke_cs_id?: string
          message_body?: string
          recipient_phone?: string
          sent_by_auth_user_id?: string | null
          shift_id?: string
          twilio_message_sid?: string | null
          twilio_status?: string | null
        }
        Relationships: []
      }
      spot_offer_request_table: {
        Row: {
          applicant_control_url: string | null
          applicant_name: string | null
          applicant_sex: string | null
          commute_fee: number | null
          core_id: string | null
          created_at: string | null
          end_at: string | null
          id: string
          kaipoke_cs_id: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          start_at: string | null
          status: string
          taimee_job_id: string | null
          template_title: string | null
          unit_amount: number | null
          updated_at: string | null
        }
        Insert: {
          applicant_control_url?: string | null
          applicant_name?: string | null
          applicant_sex?: string | null
          commute_fee?: number | null
          core_id?: string | null
          created_at?: string | null
          end_at?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          shift_end_time?: string | null
          shift_id?: number | null
          shift_start_date?: string | null
          shift_start_time?: string | null
          start_at?: string | null
          status?: string
          taimee_job_id?: string | null
          template_title?: string | null
          unit_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          applicant_control_url?: string | null
          applicant_name?: string | null
          applicant_sex?: string | null
          commute_fee?: number | null
          core_id?: string | null
          created_at?: string | null
          end_at?: string | null
          id?: string
          kaipoke_cs_id?: string | null
          shift_end_time?: string | null
          shift_id?: number | null
          shift_start_date?: string | null
          shift_start_time?: string | null
          start_at?: string | null
          status?: string
          taimee_job_id?: string | null
          template_title?: string | null
          unit_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      spot_offer_template_unified: {
        Row: {
          auto_message: string | null
          belongings: string[] | null
          benefits: string[] | null
          cautions: string | null
          commute_fee: number | null
          core_id: string
          created_at: string
          emergency_phone: string | null
          end_at: string | null
          fare: string | null
          internal_label: string | null
          kaipoke_cs_id: string | null
          kaiteku_offer_id: string | null
          kaiteku_scraped_at: string | null
          matching_msg: string | null
          matching_place_name: string | null
          meeting_place: string | null
          meeting_place_banchi: string | null
          meeting_yuubinn: string | null
          photo_urls: string[] | null
          required_licenses: string[] | null
          requires_license: boolean | null
          salary: string | null
          send_msg_flg: boolean | null
          shift_id: Json | null
          smoking_area_work: boolean | null
          smoking_policy: string | null
          start_at: string | null
          status: string | null
          template_title: string | null
          timee_offer_id: string | null
          timee_scraped_at: string | null
          ucare_offer_id: string | null
          ucare_scraped_at: string | null
          unit_amount: number | null
          updated_at: string
          work_address: string | null
          work_description: string | null
        }
        Insert: {
          auto_message?: string | null
          belongings?: string[] | null
          benefits?: string[] | null
          cautions?: string | null
          commute_fee?: number | null
          core_id?: string
          created_at?: string
          emergency_phone?: string | null
          end_at?: string | null
          fare?: string | null
          internal_label?: string | null
          kaipoke_cs_id?: string | null
          kaiteku_offer_id?: string | null
          kaiteku_scraped_at?: string | null
          matching_msg?: string | null
          matching_place_name?: string | null
          meeting_place?: string | null
          meeting_place_banchi?: string | null
          meeting_yuubinn?: string | null
          photo_urls?: string[] | null
          required_licenses?: string[] | null
          requires_license?: boolean | null
          salary?: string | null
          send_msg_flg?: boolean | null
          shift_id?: Json | null
          smoking_area_work?: boolean | null
          smoking_policy?: string | null
          start_at?: string | null
          status?: string | null
          template_title?: string | null
          timee_offer_id?: string | null
          timee_scraped_at?: string | null
          ucare_offer_id?: string | null
          ucare_scraped_at?: string | null
          unit_amount?: number | null
          updated_at?: string
          work_address?: string | null
          work_description?: string | null
        }
        Update: {
          auto_message?: string | null
          belongings?: string[] | null
          benefits?: string[] | null
          cautions?: string | null
          commute_fee?: number | null
          core_id?: string
          created_at?: string
          emergency_phone?: string | null
          end_at?: string | null
          fare?: string | null
          internal_label?: string | null
          kaipoke_cs_id?: string | null
          kaiteku_offer_id?: string | null
          kaiteku_scraped_at?: string | null
          matching_msg?: string | null
          matching_place_name?: string | null
          meeting_place?: string | null
          meeting_place_banchi?: string | null
          meeting_yuubinn?: string | null
          photo_urls?: string[] | null
          required_licenses?: string[] | null
          requires_license?: boolean | null
          salary?: string | null
          send_msg_flg?: boolean | null
          shift_id?: Json | null
          smoking_area_work?: boolean | null
          smoking_policy?: string | null
          start_at?: string | null
          status?: string | null
          template_title?: string | null
          timee_offer_id?: string | null
          timee_scraped_at?: string | null
          ucare_offer_id?: string | null
          ucare_scraped_at?: string | null
          unit_amount?: number | null
          updated_at?: string
          work_address?: string | null
          work_description?: string | null
        }
        Relationships: []
      }
      staff_log: {
        Row: {
          action_at: string
          action_detail: string | null
          created_at: string
          id: number
          registered_by: string
          staff_id: string
        }
        Insert: {
          action_at: string
          action_detail?: string | null
          created_at?: string
          id?: number
          registered_by: string
          staff_id: string
        }
        Update: {
          action_at?: string
          action_detail?: string | null
          created_at?: string
          id?: number
          registered_by?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_ordered"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "form_entries_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "reentry_recruitment_candidates"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "taimee_employees_with_entry"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "fk_staff_log_form_entries"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "users_personal_group_view"
            referencedColumns: ["form_entries_id"]
          },
        ]
      }
      staff_monthly_score_summaries: {
        Row: {
          created_at: string
          entry_id: string | null
          health_check_done: boolean
          houmon_late_done_count: number
          houmon_same_day_done_count: number
          id: string
          individual_score: number
          jisseki_past_incomplete_count: number
          jisseki_previous_month_done_count: number
          jisseki_previous_month_total_count: number
          jisseki_team_bonus_score: number
          jisseki_team_collection_rate: number
          jisseki_team_done_count: number
          jisseki_team_total_count: number
          medal_rank: string
          meeting_past_attended: boolean | null
          meeting_previous_month_attended: boolean
          official_total_score: number
          projected_medal_rank: string
          projected_total_score: number
          rank_no: number | null
          service_hours: number
          shift_decline_3days_count: number
          shift_decline_6hours_count: number
          shift_decline_penalty_score: number
          staff_name: string | null
          target_month: string
          team_orgunitid: string | null
          team_score: number
          total_score: number
          training_goal_selected_count: number
          updated_at: string
          user_id: string
          visit_record_current_month_incomplete_count: number
          visit_record_deadline_miss_count: number
          visit_record_past_incomplete_count: number
          visit_record_total_count: number
        }
        Insert: {
          created_at?: string
          entry_id?: string | null
          health_check_done?: boolean
          houmon_late_done_count?: number
          houmon_same_day_done_count?: number
          id?: string
          individual_score?: number
          jisseki_past_incomplete_count?: number
          jisseki_previous_month_done_count?: number
          jisseki_previous_month_total_count?: number
          jisseki_team_bonus_score?: number
          jisseki_team_collection_rate?: number
          jisseki_team_done_count?: number
          jisseki_team_total_count?: number
          medal_rank?: string
          meeting_past_attended?: boolean | null
          meeting_previous_month_attended?: boolean
          official_total_score?: number
          projected_medal_rank?: string
          projected_total_score?: number
          rank_no?: number | null
          service_hours?: number
          shift_decline_3days_count?: number
          shift_decline_6hours_count?: number
          shift_decline_penalty_score?: number
          staff_name?: string | null
          target_month: string
          team_orgunitid?: string | null
          team_score?: number
          total_score?: number
          training_goal_selected_count?: number
          updated_at?: string
          user_id: string
          visit_record_current_month_incomplete_count?: number
          visit_record_deadline_miss_count?: number
          visit_record_past_incomplete_count?: number
          visit_record_total_count?: number
        }
        Update: {
          created_at?: string
          entry_id?: string | null
          health_check_done?: boolean
          houmon_late_done_count?: number
          houmon_same_day_done_count?: number
          id?: string
          individual_score?: number
          jisseki_past_incomplete_count?: number
          jisseki_previous_month_done_count?: number
          jisseki_previous_month_total_count?: number
          jisseki_team_bonus_score?: number
          jisseki_team_collection_rate?: number
          jisseki_team_done_count?: number
          jisseki_team_total_count?: number
          medal_rank?: string
          meeting_past_attended?: boolean | null
          meeting_previous_month_attended?: boolean
          official_total_score?: number
          projected_medal_rank?: string
          projected_total_score?: number
          rank_no?: number | null
          service_hours?: number
          shift_decline_3days_count?: number
          shift_decline_6hours_count?: number
          shift_decline_penalty_score?: number
          staff_name?: string | null
          target_month?: string
          team_orgunitid?: string | null
          team_score?: number
          total_score?: number
          training_goal_selected_count?: number
          updated_at?: string
          user_id?: string
          visit_record_current_month_incomplete_count?: number
          visit_record_deadline_miss_count?: number
          visit_record_past_incomplete_count?: number
          visit_record_total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "staff_monthly_score_summaries_team_orgunitid_fkey"
            columns: ["team_orgunitid"]
            isOneToOne: false
            referencedRelation: "org_manager_view"
            referencedColumns: ["orgunitid"]
          },
          {
            foreignKeyName: "staff_monthly_score_summaries_team_orgunitid_fkey"
            columns: ["team_orgunitid"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["orgunitid"]
          },
          {
            foreignKeyName: "staff_monthly_score_summaries_team_orgunitid_fkey"
            columns: ["team_orgunitid"]
            isOneToOne: false
            referencedRelation: "orgs_sort"
            referencedColumns: ["orgunitid"]
          },
        ]
      }
      staff_monthly_stats: {
        Row: {
          active_count: number
          calculated_at: string
          created_at: string
          fulltime_count: number
          hired_count: number
          month: string
          other_count: number
          retired_count: number
          updated_at: string
          working_count: number
        }
        Insert: {
          active_count?: number
          calculated_at?: string
          created_at?: string
          fulltime_count?: number
          hired_count?: number
          month: string
          other_count?: number
          retired_count?: number
          updated_at?: string
          working_count?: number
        }
        Update: {
          active_count?: number
          calculated_at?: string
          created_at?: string
          fulltime_count?: number
          hired_count?: number
          month?: string
          other_count?: number
          retired_count?: number
          updated_at?: string
          working_count?: number
        }
        Relationships: []
      }
      system_role_master: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string | null
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id: string
          label?: string | null
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      taimee_applicant_documents: {
        Row: {
          applicant_id: string
          created_at: string
          document_name: string
          document_type: string
          expiration_date: string | null
          fetched_at: string
          file_size: number | null
          id: string
          issued_date: string | null
          job_id: string | null
          mime_type: string | null
          qualification_name: string | null
          source_url: string | null
          storage_bucket: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          document_name: string
          document_type: string
          expiration_date?: string | null
          fetched_at?: string
          file_size?: number | null
          id?: string
          issued_date?: string | null
          job_id?: string | null
          mime_type?: string | null
          qualification_name?: string | null
          source_url?: string | null
          storage_bucket?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          document_name?: string
          document_type?: string
          expiration_date?: string | null
          fetched_at?: string
          file_size?: number | null
          id?: string
          issued_date?: string | null
          job_id?: string | null
          mime_type?: string | null
          qualification_name?: string | null
          source_url?: string | null
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taimee_applicant_documents_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taimee_applicant_documents_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicants_with_entry"
            referencedColumns: ["applicant_id"]
          },
          {
            foreignKeyName: "taimee_applicant_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicant_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taimee_applicant_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicants_with_entry"
            referencedColumns: ["latest_applicant_job_id"]
          },
        ]
      }
      taimee_applicant_jobs: {
        Row: {
          applicant_control_url: string | null
          applicant_id: string
          application_status: string | null
          created_at: string
          end_time: string | null
          first_detected_at: string
          id: string
          job_name: string | null
          last_detected_at: string
          period_month: string | null
          shift_id: string | null
          start_time: string | null
          taimee_job_id: string | null
          updated_at: string
          work_date: string | null
        }
        Insert: {
          applicant_control_url?: string | null
          applicant_id: string
          application_status?: string | null
          created_at?: string
          end_time?: string | null
          first_detected_at?: string
          id?: string
          job_name?: string | null
          last_detected_at?: string
          period_month?: string | null
          shift_id?: string | null
          start_time?: string | null
          taimee_job_id?: string | null
          updated_at?: string
          work_date?: string | null
        }
        Update: {
          applicant_control_url?: string | null
          applicant_id?: string
          application_status?: string | null
          created_at?: string
          end_time?: string | null
          first_detected_at?: string
          id?: string
          job_name?: string | null
          last_detected_at?: string
          period_month?: string | null
          shift_id?: string | null
          start_time?: string | null
          taimee_job_id?: string | null
          updated_at?: string
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taimee_applicant_jobs_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taimee_applicant_jobs_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "taimee_applicants_with_entry"
            referencedColumns: ["applicant_id"]
          },
        ]
      }
      taimee_applicants: {
        Row: {
          address: string | null
          applicant_control_url: string | null
          black_list: boolean
          created_at: string
          entry_id: string | null
          fetch_error: string | null
          fetch_status: string
          first_name: string | null
          first_name_kana: string | null
          gender: string | null
          id: string
          last_fetched_at: string | null
          last_name: string | null
          last_name_kana: string | null
          last_sent_at: string | null
          link_status: string
          memo: string | null
          normalized_phone: string | null
          phone: string | null
          send_disabled: boolean
          taimee_user_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          applicant_control_url?: string | null
          black_list?: boolean
          created_at?: string
          entry_id?: string | null
          fetch_error?: string | null
          fetch_status?: string
          first_name?: string | null
          first_name_kana?: string | null
          gender?: string | null
          id?: string
          last_fetched_at?: string | null
          last_name?: string | null
          last_name_kana?: string | null
          last_sent_at?: string | null
          link_status?: string
          memo?: string | null
          normalized_phone?: string | null
          phone?: string | null
          send_disabled?: boolean
          taimee_user_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          applicant_control_url?: string | null
          black_list?: boolean
          created_at?: string
          entry_id?: string | null
          fetch_error?: string | null
          fetch_status?: string
          first_name?: string | null
          first_name_kana?: string | null
          gender?: string | null
          id?: string
          last_fetched_at?: string | null
          last_name?: string | null
          last_name_kana?: string | null
          last_sent_at?: string | null
          link_status?: string
          memo?: string | null
          normalized_phone?: string | null
          phone?: string | null
          send_disabled?: boolean
          taimee_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      taimee_employees_monthly: {
        Row: {
          black_list: boolean | null
          last_sent_at: string | null
          memo: string | null
          normalized_phone: string | null
          period_month: string
          send_disabled: boolean | null
          source_filename: string
          taimee_user_id: string | null
          uploaded_at: string
          "ユーザーID（ユーザーによって一意な値）": string
          住所: string | null
          最終稼働日: string | null
          初回稼働日: string | null
          名: string | null
          姓: string | null
          性別: string | null
          生年月日: string | null
          累計交通費支払額: string | null
          累計実働時間: string | null
          累計法定外割増時間: string | null
          累計深夜労働時間: string | null
          累計源泉徴収額: string | null
          累計稼働回数: string | null
          累計給与支払額: string | null
          累計通常勤務時間: string | null
          電話番号: string | null
        }
        Insert: {
          black_list?: boolean | null
          last_sent_at?: string | null
          memo?: string | null
          normalized_phone?: string | null
          period_month: string
          send_disabled?: boolean | null
          source_filename: string
          taimee_user_id?: string | null
          uploaded_at?: string
          "ユーザーID（ユーザーによって一意な値）": string
          住所?: string | null
          最終稼働日?: string | null
          初回稼働日?: string | null
          名?: string | null
          姓?: string | null
          性別?: string | null
          生年月日?: string | null
          累計交通費支払額?: string | null
          累計実働時間?: string | null
          累計法定外割増時間?: string | null
          累計深夜労働時間?: string | null
          累計源泉徴収額?: string | null
          累計稼働回数?: string | null
          累計給与支払額?: string | null
          累計通常勤務時間?: string | null
          電話番号?: string | null
        }
        Update: {
          black_list?: boolean | null
          last_sent_at?: string | null
          memo?: string | null
          normalized_phone?: string | null
          period_month?: string
          send_disabled?: boolean | null
          source_filename?: string
          taimee_user_id?: string | null
          uploaded_at?: string
          "ユーザーID（ユーザーによって一意な値）"?: string
          住所?: string | null
          最終稼働日?: string | null
          初回稼働日?: string | null
          名?: string | null
          姓?: string | null
          性別?: string | null
          生年月日?: string | null
          累計交通費支払額?: string | null
          累計実働時間?: string | null
          累計法定外割増時間?: string | null
          累計深夜労働時間?: string | null
          累計源泉徴収額?: string | null
          累計稼働回数?: string | null
          累計給与支払額?: string | null
          累計通常勤務時間?: string | null
          電話番号?: string | null
        }
        Relationships: []
      }
      taimee_job_schedules: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          job_setting_id: string
          open_time: string
          open_weekday: number
          schedule_name: string
          updated_at: string
          work_weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          job_setting_id: string
          open_time: string
          open_weekday: number
          schedule_name: string
          updated_at?: string
          work_weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          job_setting_id?: string
          open_time?: string
          open_weekday?: number
          schedule_name?: string
          updated_at?: string
          work_weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "taimee_job_schedules_job_setting_id_fkey"
            columns: ["job_setting_id"]
            isOneToOne: false
            referencedRelation: "taimee_job_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      taimee_job_settings: {
        Row: {
          created_at: string
          environment: string
          headcount: number
          hourly_wage: number
          id: string
          is_enabled: boolean
          offer_id: string
          open_time: string
          open_weekday: number
          setting_key: string
          setting_name: string
          updated_at: string
          work_end_time: string
          work_start_time: string
          work_weekday: number
        }
        Insert: {
          created_at?: string
          environment?: string
          headcount?: number
          hourly_wage: number
          id?: string
          is_enabled?: boolean
          offer_id: string
          open_time: string
          open_weekday: number
          setting_key: string
          setting_name: string
          updated_at?: string
          work_end_time: string
          work_start_time: string
          work_weekday: number
        }
        Update: {
          created_at?: string
          environment?: string
          headcount?: number
          hourly_wage?: number
          id?: string
          is_enabled?: boolean
          offer_id?: string
          open_time?: string
          open_weekday?: number
          setting_key?: string
          setting_name?: string
          updated_at?: string
          work_end_time?: string
          work_start_time?: string
          work_weekday?: number
        }
        Relationships: []
      }
      team_monthly_score_summaries: {
        Row: {
          created_at: string
          id: string
          jisseki_incomplete_count: number
          jisseki_incomplete_details: Json
          jisseki_score: number
          jisseki_submission_rate: number
          jisseki_submitted_count: number
          jisseki_target_count: number
          jisseki_total_count: number
          meeting_attended_count: number
          meeting_incomplete_count: number
          meeting_incomplete_details: Json
          meeting_member_count: number
          meeting_score: number
          member_count: number
          orgunitid: string
          orgunitname: string
          previous_month_service_hours: number
          rank_no: number | null
          service_hours: number
          service_hours_base_score: number
          service_hours_current: number
          service_hours_growth: number
          service_hours_growth_score: number
          service_hours_previous: number
          service_hours_score: number
          target_month: string
          team_name: string | null
          team_score: number
          total_score: number
          updated_at: string
          visit_record_deadline_miss_count: number
          visit_record_deadline_miss_details: Json
          visit_record_incomplete_details: Json
          visit_record_same_day_count: number
          visit_record_score: number
          visit_record_submission_rate: number
          visit_record_target_count: number
          visit_record_total_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          jisseki_incomplete_count?: number
          jisseki_incomplete_details?: Json
          jisseki_score?: number
          jisseki_submission_rate?: number
          jisseki_submitted_count?: number
          jisseki_target_count?: number
          jisseki_total_count?: number
          meeting_attended_count?: number
          meeting_incomplete_count?: number
          meeting_incomplete_details?: Json
          meeting_member_count?: number
          meeting_score?: number
          member_count?: number
          orgunitid: string
          orgunitname: string
          previous_month_service_hours?: number
          rank_no?: number | null
          service_hours?: number
          service_hours_base_score?: number
          service_hours_current?: number
          service_hours_growth?: number
          service_hours_growth_score?: number
          service_hours_previous?: number
          service_hours_score?: number
          target_month: string
          team_name?: string | null
          team_score?: number
          total_score?: number
          updated_at?: string
          visit_record_deadline_miss_count?: number
          visit_record_deadline_miss_details?: Json
          visit_record_incomplete_details?: Json
          visit_record_same_day_count?: number
          visit_record_score?: number
          visit_record_submission_rate?: number
          visit_record_target_count?: number
          visit_record_total_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          jisseki_incomplete_count?: number
          jisseki_incomplete_details?: Json
          jisseki_score?: number
          jisseki_submission_rate?: number
          jisseki_submitted_count?: number
          jisseki_target_count?: number
          jisseki_total_count?: number
          meeting_attended_count?: number
          meeting_incomplete_count?: number
          meeting_incomplete_details?: Json
          meeting_member_count?: number
          meeting_score?: number
          member_count?: number
          orgunitid?: string
          orgunitname?: string
          previous_month_service_hours?: number
          rank_no?: number | null
          service_hours?: number
          service_hours_base_score?: number
          service_hours_current?: number
          service_hours_growth?: number
          service_hours_growth_score?: number
          service_hours_previous?: number
          service_hours_score?: number
          target_month?: string
          team_name?: string | null
          team_score?: number
          total_score?: number
          updated_at?: string
          visit_record_deadline_miss_count?: number
          visit_record_deadline_miss_details?: Json
          visit_record_incomplete_details?: Json
          visit_record_same_day_count?: number
          visit_record_score?: number
          visit_record_submission_rate?: number
          visit_record_target_count?: number
          visit_record_total_count?: number
        }
        Relationships: []
      }
      training_goal_catalog: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          target_group: string | null
          target_role: string | null
          training_code: string
          training_goal: string | null
          training_key: string
          training_month: number | null
          training_title: string
          training_type: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_group?: string | null
          target_role?: string | null
          training_code: string
          training_goal?: string | null
          training_key: string
          training_month?: number | null
          training_title: string
          training_type: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_group?: string | null
          target_role?: string | null
          training_code?: string
          training_goal?: string | null
          training_key?: string
          training_month?: number | null
          training_title?: string
          training_type?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      training_goal_master: {
        Row: {
          category: string
          created_at: string
          group_code: string
          id: string
          is_active: boolean
          sort_order: number
          target_condition: string | null
          training_goal: string | null
          training_title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category: string
          created_at?: string
          group_code: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_condition?: string | null
          training_goal?: string | null
          training_title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          group_code?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          target_condition?: string | null
          training_goal?: string | null
          training_title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      user_advance_payment_applications: {
        Row: {
          amount: number
          application_no: string
          approved_at: string | null
          approved_by: string | null
          available_amount: number
          base_amount: number
          created_at: string
          deduction_rate: number
          deduction_reasons: string[]
          department: string | null
          desired_payment_date: string
          employee_name: string
          id: number
          paid_at: string | null
          reason: string
          rejected_reason: string | null
          remarks: string | null
          shift_ids: string[]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          application_no: string
          approved_at?: string | null
          approved_by?: string | null
          available_amount?: number
          base_amount?: number
          created_at?: string
          deduction_rate?: number
          deduction_reasons?: string[]
          department?: string | null
          desired_payment_date: string
          employee_name: string
          id?: never
          paid_at?: string | null
          reason: string
          rejected_reason?: string | null
          remarks?: string | null
          shift_ids?: string[]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          application_no?: string
          approved_at?: string | null
          approved_by?: string | null
          available_amount?: number
          base_amount?: number
          created_at?: string
          deduction_rate?: number
          deduction_reasons?: string[]
          department?: string | null
          desired_payment_date?: string
          employee_name?: string
          id?: never
          paid_at?: string | null
          reason?: string
          rejected_reason?: string | null
          remarks?: string | null
          shift_ids?: string[]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_doc_master: {
        Row: {
          category: string
          created_at: string
          doc_group: string | null
          id: string
          is_active: boolean
          judge_logics: Json | null
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          doc_group?: string | null
          id?: string
          is_active?: boolean
          judge_logics?: Json | null
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          doc_group?: string | null
          id?: string
          is_active?: boolean
          judge_logics?: Json | null
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_notification_determination: {
        Row: {
          "変更前　ケアマネ手当": number | null
          "変更前　スキル加算手当": number | null
          "変更前　合計": number | null
          "変更前　基本給": number | null
          "変更前　私有車業務使用手当": number | null
          "変更前　職級": string | null
          "変更前　職級手当": number | null
          "変更後　ケアマネ手当": number | null
          "変更後　スキル加算手当": number | null
          "変更後　合計": number | null
          "変更後　基本給": number | null
          "変更後　私有車業務使用手当": number | null
          "変更後　職級": string | null
          "変更後　職級手当": number | null
          変更日: string | null
          従業員番号: string | null
          氏名: string | null
        }
        Insert: {
          "変更前　ケアマネ手当"?: number | null
          "変更前　スキル加算手当"?: number | null
          "変更前　合計"?: number | null
          "変更前　基本給"?: number | null
          "変更前　私有車業務使用手当"?: number | null
          "変更前　職級"?: string | null
          "変更前　職級手当"?: number | null
          "変更後　ケアマネ手当"?: number | null
          "変更後　スキル加算手当"?: number | null
          "変更後　合計"?: number | null
          "変更後　基本給"?: number | null
          "変更後　私有車業務使用手当"?: number | null
          "変更後　職級"?: string | null
          "変更後　職級手当"?: number | null
          変更日?: string | null
          従業員番号?: string | null
          氏名?: string | null
        }
        Update: {
          "変更前　ケアマネ手当"?: number | null
          "変更前　スキル加算手当"?: number | null
          "変更前　合計"?: number | null
          "変更前　基本給"?: number | null
          "変更前　私有車業務使用手当"?: number | null
          "変更前　職級"?: string | null
          "変更前　職級手当"?: number | null
          "変更後　ケアマネ手当"?: number | null
          "変更後　スキル加算手当"?: number | null
          "変更後　合計"?: number | null
          "変更後　基本給"?: number | null
          "変更後　私有車業務使用手当"?: number | null
          "変更後　職級"?: string | null
          "変更後　職級手当"?: number | null
          変更日?: string | null
          従業員番号?: string | null
          氏名?: string | null
        }
        Relationships: []
      }
      user_ojt_record: {
        Row: {
          create_ad: string
          date: string
          id: string
          kaipoke_cs_id: string | null
          memo: string | null
          start_time: string | null
          trainer_user_id: string | null
          update_ad: string
          user_id: string
        }
        Insert: {
          create_ad?: string
          date: string
          id?: string
          kaipoke_cs_id?: string | null
          memo?: string | null
          start_time?: string | null
          trainer_user_id?: string | null
          update_ad?: string
          user_id: string
        }
        Update: {
          create_ad?: string
          date?: string
          id?: string
          kaipoke_cs_id?: string | null
          memo?: string | null
          start_time?: string | null
          trainer_user_id?: string | null
          update_ad?: string
          user_id?: string
        }
        Relationships: []
      }
      user_org_exception: {
        Row: {
          org_mgr_phone: string | null
          orgunitid: string
          user_id: string
        }
        Insert: {
          org_mgr_phone?: string | null
          orgunitid: string
          user_id: string
        }
        Update: {
          org_mgr_phone?: string | null
          orgunitid?: string
          user_id?: string
        }
        Relationships: []
      }
      user_salary_monthly: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          キャンセル回数: number | null
          "キャンセル手当(支給)": number | null
          "グループ介助手当(支給)": number | null
          グループ介助時間: string | null
          "ケアマネ手当(支給)": number | null
          サービス回数: number | null
          "スキル加算（処遇改善加算）(支給)": number | null
          "スキル加算手当(支給)": number | null
          "その他手当(支給)": number | null
          "その他精算額(控除)": number | null
          "タイミー等先払控除(控除)": number | null
          "テザリング手当(支給)": number | null
          "不就労(控除)": number | null
          "介護保険料(控除)": number | null
          "住民税(控除)": number | null
          "健康保険料(控除)": number | null
          備考: string | null
          "先払給与精算(控除)": number | null
          処遇改善加算: number | null
          "処遇改善加算(支給)": number | null
          "出勤日数（平日）": number | null
          "出勤日数（所定休日）": number | null
          "厚生年金保険料(控除)": number | null
          "同行援護研修手当(支給)": number | null
          "基本給(支給)": number | null
          "子ども・子育て支援金(会社)": number | null
          "子ども・子育て支援金(控除)": number | null
          差引支給合計: number | null
          年末年始出勤時間: string | null
          "年末年始加算(支給)": number | null
          "年調過不足税額(控除)": number | null
          "役割基準手当(支給)": number | null
          "役員報酬(支給)": number | null
          "役職手当(支給)": number | null
          従業員: string | null
          従業員番号: string
          "所定休日手当(支給)": number | null
          "所定時間（平日）": string | null
          "所得税(控除)": number | null
          振込支給額合計: number | null
          控除合計: number | null
          支給合計: number | null
          支給日: string
          "時給加算(支給)": number | null
          時給加算時間: string | null
          "月次報酬(支給)": number | null
          有休付与日数: number | null
          有休取得日数: number | null
          有休残日数: number | null
          "有給手当(支給)": number | null
          "欠勤控除(支給)": number | null
          "欠勤日数（平日）": number | null
          "残業手当(支給)": number | null
          "法定外時間（平日）": string | null
          "深夜出勤代(支給)": number | null
          "深夜所定時間（平日）": string | null
          "深夜残業手当(支給)": number | null
          "特別勤務手当(支給)": number | null
          "特定処遇改善加算(支給)": number | null
          "研修奨励手当(支給)": number | null
          "研修手当(支給)": number | null
          研修時間: string | null
          "研修費補助返金(控除)": number | null
          "研修費貸付金(控除)": number | null
          社会保険料合計: number | null
          "社宅費/車代/駐車場代(控除)": number | null
          "福利厚生費(支給)": number | null
          "私有車業務使用手当(支給)": number | null
          "移動加算（片道支援）(支給)": number | null
          移動回数: number | null
          "管理スパン手当(支給)": number | null
          "紹介手当(支給)": number | null
          "経費精算等(支給)": number | null
          "総労働時間（平日）": string | null
          "職級手当(支給)": number | null
          "資格手当(支給)": number | null
          "身体・同行・行動加算(支給)": number | null
          "身体・同行・行動時間": string | null
          "通勤手当（その他）(支給)": number | null
          "通勤手当(支給)": number | null
          "通勤手当（月額）(支給)": number | null
          "通院介助等（身体なし）(支給)": number | null
          "通院等介助（身体なし）(支給)": number | null
          "通院等介助（身体なし）時間": string | null
          "重訪移動加算(支給)": number | null
          重訪移動時間: string | null
          "雇用保険料(控除)": number | null
          "食事加算(支給)": number | null
          食事回数: number | null
          "食事手当(支給)": number | null
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          キャンセル回数?: number | null
          "キャンセル手当(支給)"?: number | null
          "グループ介助手当(支給)"?: number | null
          グループ介助時間?: string | null
          "ケアマネ手当(支給)"?: number | null
          サービス回数?: number | null
          "スキル加算（処遇改善加算）(支給)"?: number | null
          "スキル加算手当(支給)"?: number | null
          "その他手当(支給)"?: number | null
          "その他精算額(控除)"?: number | null
          "タイミー等先払控除(控除)"?: number | null
          "テザリング手当(支給)"?: number | null
          "不就労(控除)"?: number | null
          "介護保険料(控除)"?: number | null
          "住民税(控除)"?: number | null
          "健康保険料(控除)"?: number | null
          備考?: string | null
          "先払給与精算(控除)"?: number | null
          処遇改善加算?: number | null
          "処遇改善加算(支給)"?: number | null
          "出勤日数（平日）"?: number | null
          "出勤日数（所定休日）"?: number | null
          "厚生年金保険料(控除)"?: number | null
          "同行援護研修手当(支給)"?: number | null
          "基本給(支給)"?: number | null
          "子ども・子育て支援金(会社)"?: number | null
          "子ども・子育て支援金(控除)"?: number | null
          差引支給合計?: number | null
          年末年始出勤時間?: string | null
          "年末年始加算(支給)"?: number | null
          "年調過不足税額(控除)"?: number | null
          "役割基準手当(支給)"?: number | null
          "役員報酬(支給)"?: number | null
          "役職手当(支給)"?: number | null
          従業員?: string | null
          従業員番号: string
          "所定休日手当(支給)"?: number | null
          "所定時間（平日）"?: string | null
          "所得税(控除)"?: number | null
          振込支給額合計?: number | null
          控除合計?: number | null
          支給合計?: number | null
          支給日: string
          "時給加算(支給)"?: number | null
          時給加算時間?: string | null
          "月次報酬(支給)"?: number | null
          有休付与日数?: number | null
          有休取得日数?: number | null
          有休残日数?: number | null
          "有給手当(支給)"?: number | null
          "欠勤控除(支給)"?: number | null
          "欠勤日数（平日）"?: number | null
          "残業手当(支給)"?: number | null
          "法定外時間（平日）"?: string | null
          "深夜出勤代(支給)"?: number | null
          "深夜所定時間（平日）"?: string | null
          "深夜残業手当(支給)"?: number | null
          "特別勤務手当(支給)"?: number | null
          "特定処遇改善加算(支給)"?: number | null
          "研修奨励手当(支給)"?: number | null
          "研修手当(支給)"?: number | null
          研修時間?: string | null
          "研修費補助返金(控除)"?: number | null
          "研修費貸付金(控除)"?: number | null
          社会保険料合計?: number | null
          "社宅費/車代/駐車場代(控除)"?: number | null
          "福利厚生費(支給)"?: number | null
          "私有車業務使用手当(支給)"?: number | null
          "移動加算（片道支援）(支給)"?: number | null
          移動回数?: number | null
          "管理スパン手当(支給)"?: number | null
          "紹介手当(支給)"?: number | null
          "経費精算等(支給)"?: number | null
          "総労働時間（平日）"?: string | null
          "職級手当(支給)"?: number | null
          "資格手当(支給)"?: number | null
          "身体・同行・行動加算(支給)"?: number | null
          "身体・同行・行動時間"?: string | null
          "通勤手当（その他）(支給)"?: number | null
          "通勤手当(支給)"?: number | null
          "通勤手当（月額）(支給)"?: number | null
          "通院介助等（身体なし）(支給)"?: number | null
          "通院等介助（身体なし）(支給)"?: number | null
          "通院等介助（身体なし）時間"?: string | null
          "重訪移動加算(支給)"?: number | null
          重訪移動時間?: string | null
          "雇用保険料(控除)"?: number | null
          "食事加算(支給)"?: number | null
          食事回数?: number | null
          "食事手当(支給)"?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          キャンセル回数?: number | null
          "キャンセル手当(支給)"?: number | null
          "グループ介助手当(支給)"?: number | null
          グループ介助時間?: string | null
          "ケアマネ手当(支給)"?: number | null
          サービス回数?: number | null
          "スキル加算（処遇改善加算）(支給)"?: number | null
          "スキル加算手当(支給)"?: number | null
          "その他手当(支給)"?: number | null
          "その他精算額(控除)"?: number | null
          "タイミー等先払控除(控除)"?: number | null
          "テザリング手当(支給)"?: number | null
          "不就労(控除)"?: number | null
          "介護保険料(控除)"?: number | null
          "住民税(控除)"?: number | null
          "健康保険料(控除)"?: number | null
          備考?: string | null
          "先払給与精算(控除)"?: number | null
          処遇改善加算?: number | null
          "処遇改善加算(支給)"?: number | null
          "出勤日数（平日）"?: number | null
          "出勤日数（所定休日）"?: number | null
          "厚生年金保険料(控除)"?: number | null
          "同行援護研修手当(支給)"?: number | null
          "基本給(支給)"?: number | null
          "子ども・子育て支援金(会社)"?: number | null
          "子ども・子育て支援金(控除)"?: number | null
          差引支給合計?: number | null
          年末年始出勤時間?: string | null
          "年末年始加算(支給)"?: number | null
          "年調過不足税額(控除)"?: number | null
          "役割基準手当(支給)"?: number | null
          "役員報酬(支給)"?: number | null
          "役職手当(支給)"?: number | null
          従業員?: string | null
          従業員番号?: string
          "所定休日手当(支給)"?: number | null
          "所定時間（平日）"?: string | null
          "所得税(控除)"?: number | null
          振込支給額合計?: number | null
          控除合計?: number | null
          支給合計?: number | null
          支給日?: string
          "時給加算(支給)"?: number | null
          時給加算時間?: string | null
          "月次報酬(支給)"?: number | null
          有休付与日数?: number | null
          有休取得日数?: number | null
          有休残日数?: number | null
          "有給手当(支給)"?: number | null
          "欠勤控除(支給)"?: number | null
          "欠勤日数（平日）"?: number | null
          "残業手当(支給)"?: number | null
          "法定外時間（平日）"?: string | null
          "深夜出勤代(支給)"?: number | null
          "深夜所定時間（平日）"?: string | null
          "深夜残業手当(支給)"?: number | null
          "特別勤務手当(支給)"?: number | null
          "特定処遇改善加算(支給)"?: number | null
          "研修奨励手当(支給)"?: number | null
          "研修手当(支給)"?: number | null
          研修時間?: string | null
          "研修費補助返金(控除)"?: number | null
          "研修費貸付金(控除)"?: number | null
          社会保険料合計?: number | null
          "社宅費/車代/駐車場代(控除)"?: number | null
          "福利厚生費(支給)"?: number | null
          "私有車業務使用手当(支給)"?: number | null
          "移動加算（片道支援）(支給)"?: number | null
          移動回数?: number | null
          "管理スパン手当(支給)"?: number | null
          "紹介手当(支給)"?: number | null
          "経費精算等(支給)"?: number | null
          "総労働時間（平日）"?: string | null
          "職級手当(支給)"?: number | null
          "資格手当(支給)"?: number | null
          "身体・同行・行動加算(支給)"?: number | null
          "身体・同行・行動時間"?: string | null
          "通勤手当（その他）(支給)"?: number | null
          "通勤手当(支給)"?: number | null
          "通勤手当（月額）(支給)"?: number | null
          "通院介助等（身体なし）(支給)"?: number | null
          "通院等介助（身体なし）(支給)"?: number | null
          "通院等介助（身体なし）時間"?: string | null
          "重訪移動加算(支給)"?: number | null
          重訪移動時間?: string | null
          "雇用保険料(控除)"?: number | null
          "食事加算(支給)"?: number | null
          食事回数?: number | null
          "食事手当(支給)"?: number | null
        }
        Relationships: []
      }
      user_status_master: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          label: string | null
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id: string
          label?: string | null
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          label?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          end_at: string | null
          entry_date_latest: string | null
          entry_date_original: string | null
          entry_id: string | null
          google_calendar_id: string | null
          google_calendar_last_synced_at: string | null
          google_calendar_sync: boolean
          has_employee_loan: boolean
          has_employment_insurance: boolean
          has_social_insurance: boolean
          kaipoke_user_id: string | null
          level_id: string | null
          lw_userid: string | null
          myfamille_id: string | null
          org_unit_id: string | null
          position_id: string | null
          resign_date_latest: string | null
          role: string | null
          roster_sort: string | null
          service_type: string | null
          shift_coordinate_custom_filter: Json | null
          status: string | null
          system_role: string | null
          temp_password: string | null
          use_shift_coordinate_custom_filter: boolean
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          end_at?: string | null
          entry_date_latest?: string | null
          entry_date_original?: string | null
          entry_id?: string | null
          google_calendar_id?: string | null
          google_calendar_last_synced_at?: string | null
          google_calendar_sync?: boolean
          has_employee_loan?: boolean
          has_employment_insurance?: boolean
          has_social_insurance?: boolean
          kaipoke_user_id?: string | null
          level_id?: string | null
          lw_userid?: string | null
          myfamille_id?: string | null
          org_unit_id?: string | null
          position_id?: string | null
          resign_date_latest?: string | null
          role?: string | null
          roster_sort?: string | null
          service_type?: string | null
          shift_coordinate_custom_filter?: Json | null
          status?: string | null
          system_role?: string | null
          temp_password?: string | null
          use_shift_coordinate_custom_filter?: boolean
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          end_at?: string | null
          entry_date_latest?: string | null
          entry_date_original?: string | null
          entry_id?: string | null
          google_calendar_id?: string | null
          google_calendar_last_synced_at?: string | null
          google_calendar_sync?: boolean
          has_employee_loan?: boolean
          has_employment_insurance?: boolean
          has_social_insurance?: boolean
          kaipoke_user_id?: string | null
          level_id?: string | null
          lw_userid?: string | null
          myfamille_id?: string | null
          org_unit_id?: string | null
          position_id?: string | null
          resign_date_latest?: string | null
          role?: string | null
          roster_sort?: string | null
          service_type?: string | null
          shift_coordinate_custom_filter?: Json | null
          status?: string | null
          system_role?: string | null
          temp_password?: string | null
          use_shift_coordinate_custom_filter?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_role"
            columns: ["system_role"]
            isOneToOne: false
            referencedRelation: "system_role_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "user_status_master"
            referencedColumns: ["id"]
          },
        ]
      }
      users_lw_temp: {
        Row: {
          activation_date: string | null
          birthday: string | null
          birthday_calendar_type: string | null
          cell_phone: string | null
          custom_fields: Json | null
          department: string | null
          domain_id: number | null
          email: string | null
          employee_number: string | null
          employment_type_external_key: string | null
          employment_type_id: string | null
          employment_type_name: string | null
          executive: boolean | null
          first_name: string | null
          full_name: string | null
          hired_date: string | null
          id: string
          is_administrator: boolean | null
          is_awaiting: boolean | null
          is_deleted: boolean | null
          is_leave_of_absence: boolean | null
          is_manager: boolean | null
          is_pending: boolean | null
          is_primary: boolean | null
          is_suspended: boolean | null
          last_name: string | null
          leave_end_time: string | null
          leave_start_time: string | null
          level: string | null
          level_external_key: string | null
          level_id: string | null
          level_name: string | null
          loa_end_time: string | null
          loa_start_time: string | null
          locale: string | null
          location: string | null
          lw_userid: string | null
          messenger_id: string | null
          messenger_protocol: string | null
          nick_name: string | null
          nickname: string | null
          org_email: string | null
          org_unit_email: string | null
          org_unit_id: string | null
          org_unit_name: string | null
          org_unit_primary: boolean | null
          organization_name: string | null
          phonetic_first_name: string | null
          phonetic_last_name: string | null
          position: string | null
          position_id: string | null
          position_name: string | null
          private_email: string | null
          relations: Json | null
          searchable: boolean | null
          suspended_reason: string | null
          task: string | null
          telephone: string | null
          time_zone: string | null
          updated_at: string | null
          use_team_feature: boolean | null
          user_external_key: string | null
          user_id: string
          user_type_code: string | null
          user_type_external_key: string | null
          user_type_id: string | null
          user_type_name: string | null
          visible: boolean | null
        }
        Insert: {
          activation_date?: string | null
          birthday?: string | null
          birthday_calendar_type?: string | null
          cell_phone?: string | null
          custom_fields?: Json | null
          department?: string | null
          domain_id?: number | null
          email?: string | null
          employee_number?: string | null
          employment_type_external_key?: string | null
          employment_type_id?: string | null
          employment_type_name?: string | null
          executive?: boolean | null
          first_name?: string | null
          full_name?: string | null
          hired_date?: string | null
          id?: string
          is_administrator?: boolean | null
          is_awaiting?: boolean | null
          is_deleted?: boolean | null
          is_leave_of_absence?: boolean | null
          is_manager?: boolean | null
          is_pending?: boolean | null
          is_primary?: boolean | null
          is_suspended?: boolean | null
          last_name?: string | null
          leave_end_time?: string | null
          leave_start_time?: string | null
          level?: string | null
          level_external_key?: string | null
          level_id?: string | null
          level_name?: string | null
          loa_end_time?: string | null
          loa_start_time?: string | null
          locale?: string | null
          location?: string | null
          lw_userid?: string | null
          messenger_id?: string | null
          messenger_protocol?: string | null
          nick_name?: string | null
          nickname?: string | null
          org_email?: string | null
          org_unit_email?: string | null
          org_unit_id?: string | null
          org_unit_name?: string | null
          org_unit_primary?: boolean | null
          organization_name?: string | null
          phonetic_first_name?: string | null
          phonetic_last_name?: string | null
          position?: string | null
          position_id?: string | null
          position_name?: string | null
          private_email?: string | null
          relations?: Json | null
          searchable?: boolean | null
          suspended_reason?: string | null
          task?: string | null
          telephone?: string | null
          time_zone?: string | null
          updated_at?: string | null
          use_team_feature?: boolean | null
          user_external_key?: string | null
          user_id: string
          user_type_code?: string | null
          user_type_external_key?: string | null
          user_type_id?: string | null
          user_type_name?: string | null
          visible?: boolean | null
        }
        Update: {
          activation_date?: string | null
          birthday?: string | null
          birthday_calendar_type?: string | null
          cell_phone?: string | null
          custom_fields?: Json | null
          department?: string | null
          domain_id?: number | null
          email?: string | null
          employee_number?: string | null
          employment_type_external_key?: string | null
          employment_type_id?: string | null
          employment_type_name?: string | null
          executive?: boolean | null
          first_name?: string | null
          full_name?: string | null
          hired_date?: string | null
          id?: string
          is_administrator?: boolean | null
          is_awaiting?: boolean | null
          is_deleted?: boolean | null
          is_leave_of_absence?: boolean | null
          is_manager?: boolean | null
          is_pending?: boolean | null
          is_primary?: boolean | null
          is_suspended?: boolean | null
          last_name?: string | null
          leave_end_time?: string | null
          leave_start_time?: string | null
          level?: string | null
          level_external_key?: string | null
          level_id?: string | null
          level_name?: string | null
          loa_end_time?: string | null
          loa_start_time?: string | null
          locale?: string | null
          location?: string | null
          lw_userid?: string | null
          messenger_id?: string | null
          messenger_protocol?: string | null
          nick_name?: string | null
          nickname?: string | null
          org_email?: string | null
          org_unit_email?: string | null
          org_unit_id?: string | null
          org_unit_name?: string | null
          org_unit_primary?: boolean | null
          organization_name?: string | null
          phonetic_first_name?: string | null
          phonetic_last_name?: string | null
          position?: string | null
          position_id?: string | null
          position_name?: string | null
          private_email?: string | null
          relations?: Json | null
          searchable?: boolean | null
          suspended_reason?: string | null
          task?: string | null
          telephone?: string | null
          time_zone?: string | null
          updated_at?: string | null
          use_team_feature?: boolean | null
          user_external_key?: string | null
          user_id?: string
          user_type_code?: string | null
          user_type_external_key?: string | null
          user_type_id?: string | null
          user_type_name?: string | null
          visible?: boolean | null
        }
        Relationships: []
      }
      visit_record_daily_reminder_logs: {
        Row: {
          attempted_at: string
          reminder_date: string
          sent_at: string | null
        }
        Insert: {
          attempted_at?: string
          reminder_date: string
          sent_at?: string | null
        }
        Update: {
          attempted_at?: string
          reminder_date?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      wf_approval_step: {
        Row: {
          acted_at: string | null
          action_comment: string | null
          applicant_user_id: string | null
          approver_user_id: string
          created_at: string
          id: string
          request_id: string
          status: string
          step_no: number
        }
        Insert: {
          acted_at?: string | null
          action_comment?: string | null
          applicant_user_id?: string | null
          approver_user_id: string
          created_at?: string
          id?: string
          request_id: string
          status?: string
          step_no: number
        }
        Update: {
          acted_at?: string | null
          action_comment?: string | null
          applicant_user_id?: string | null
          approver_user_id?: string
          created_at?: string
          id?: string
          request_id?: string
          status?: string
          step_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "wf_approval_step_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "wf_request"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_request: {
        Row: {
          applicant_user_id: string
          approved_at: string | null
          body: string | null
          completed_at: string | null
          created_at: string
          health_check_doctor_comment: string | null
          id: string
          payload: Json
          request_type_id: string
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          applicant_user_id: string
          approved_at?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          health_check_doctor_comment?: string | null
          id?: string
          payload?: Json
          request_type_id: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          applicant_user_id?: string
          approved_at?: string | null
          body?: string | null
          completed_at?: string | null
          created_at?: string
          health_check_doctor_comment?: string | null
          id?: string
          payload?: Json
          request_type_id?: string
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_request_request_type_id_fkey"
            columns: ["request_type_id"]
            isOneToOne: false
            referencedRelation: "wf_request_type"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_request_attachment: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          kind: string
          mime_type: string | null
          request_id: string
          uploaded_by_user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          request_id: string
          uploaded_by_user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          request_id?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wf_request_attachment_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "wf_request"
            referencedColumns: ["id"]
          },
        ]
      }
      wf_request_type: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_general: boolean
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_general?: boolean
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_general?: boolean
          label?: string
        }
        Relationships: []
      }
      xxxtest_spot_offer_template_unified: {
        Row: {
          core_id: string
          created_at: string
          end_at: string | null
          fare: string | null
          kaipoke_cs_id: string | null
          kaiteku_offer_id: string | null
          resttime: string | null
          salary: string | null
          start_at: string | null
          status: string | null
          timee_offer_id: string | null
          ucare_offer_id: string | null
          updated_at: string
          work_address: string | null
        }
        Insert: {
          core_id?: string
          created_at?: string
          end_at?: string | null
          fare?: string | null
          kaipoke_cs_id?: string | null
          kaiteku_offer_id?: string | null
          resttime?: string | null
          salary?: string | null
          start_at?: string | null
          status?: string | null
          timee_offer_id?: string | null
          ucare_offer_id?: string | null
          updated_at?: string
          work_address?: string | null
        }
        Update: {
          core_id?: string
          created_at?: string
          end_at?: string | null
          fare?: string | null
          kaipoke_cs_id?: string | null
          kaiteku_offer_id?: string | null
          resttime?: string | null
          salary?: string | null
          start_at?: string | null
          status?: string | null
          timee_offer_id?: string | null
          ucare_offer_id?: string | null
          updated_at?: string
          work_address?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      _table_definition: {
        Row: {
          ddl_text: string | null
        }
        Relationships: []
      }
      _table_definition_full: {
        Row: {
          column_default: string | null
          column_name: unknown
          constraint_type: string | null
          data_type: string | null
          is_nullable: string | null
          ordinal_position: number | null
          table_name: unknown
        }
        Relationships: []
      }
      audit_log_display_view: {
        Row: {
          action: string | null
          actor_first_name_kanji: string | null
          actor_last_name_kanji: string | null
          actor_user_id: string | null
          actor_user_id_text: string | null
          after_row: Json | null
          audit_id: string | null
          before_row: Json | null
          change_reason: string | null
          changed_cols: string[] | null
          created_at: string | null
          cs_name: string | null
          event_type: string | null
          kaipoke_cs_id: string | null
          penalty_level: string | null
          record_id: string | null
          request_path: string | null
          service_code: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_user_id: string | null
          staff_02_user_id: string | null
          staff_03_user_id: string | null
          table_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      biz_stats_defect_rate_view: {
        Row: {
          defect_avg_3m: number | null
          defect_count: number | null
          defect_rate: number | null
          defect_rate_avg_3m: number | null
          displaylevel: number | null
          orgunitid: string | null
          orgunitname: string | null
          service_avg_3m: number | null
          service_hours: number | null
          snapshot_month: string | null
          sort_lv2_order: number | null
          sort_lv3_order: number | null
          year_month: string | null
        }
        Relationships: []
      }
      biz_stats_defect_sum_display_view: {
        Row: {
          avg_3m: number | null
          displaylevel: number | null
          meta: Json | null
          metric: string | null
          orgunitid: string | null
          orgunitname: string | null
          snapshot_at: string | null
          snapshot_month: string | null
          sort_lv2_order: number | null
          sort_lv3_order: number | null
          value: number | null
          year_month: string | null
        }
        Relationships: []
      }
      biz_stats_shift_sum_display_view: {
        Row: {
          avg_3m: number | null
          displaylevel: number | null
          displayorder: number | null
          id: string | null
          lv2_id: string | null
          lv2_name: string | null
          meta: Json | null
          metric: string | null
          orgunitid: string | null
          orgunitname: string | null
          snapshot_at: string | null
          snapshot_month: string | null
          sort_lv2_order: number | null
          sort_lv3_order: number | null
          value: number | null
          year_month: string | null
        }
        Relationships: []
      }
      cm_active_jobs: {
        Row: {
          completed_items: number | null
          created_at: string | null
          error_message: string | null
          failed_items: number | null
          id: number | null
          job_type: string | null
          payload: Json | null
          pending_items: number | null
          progress_message: string | null
          progress_percent: number | null
          queue: string | null
          result: Json | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      cm_jobs_with_progress: {
        Row: {
          completed_items: number | null
          created_at: string | null
          error_message: string | null
          failed_items: number | null
          id: number | null
          job_type: string | null
          payload: Json | null
          pending_items: number | null
          progress_message: string | null
          progress_percent: number | null
          queue: string | null
          result: Json | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      cm_office_contacts_view: {
        Row: {
          address: string | null
          fax_number: string | null
          fax_number_normalized: string | null
          fax_proxy: string | null
          fax_proxy_normalized: string | null
          fax_send_to: string | null
          is_from_kaipoke: boolean | null
          name: string | null
          name_kana: string | null
          office_number: string | null
          phone: string | null
          service_type: string | null
          source: string | null
          source_id: string | null
          source_label: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      cm_recent_jobs: {
        Row: {
          completed_items: number | null
          created_at: string | null
          error_message: string | null
          failed_items: number | null
          id: number | null
          job_type: string | null
          payload: Json | null
          pending_items: number | null
          progress_message: string | null
          progress_percent: number | null
          queue: string | null
          result: Json | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      cs_docs_extract_target: {
        Row: {
          applicable_date: string | null
          classification_confidence: number | null
          created_at: string | null
          cs_documents_entry_id: string | null
          cs_kaipoke_info_id: string | null
          doc_date_raw: string | null
          doc_name: string | null
          doc_type_id: string | null
          extracted_support_goal: string | null
          id: string | null
          kaipoke_cs_id: string | null
          llm_model: string | null
          meta: Json | null
          ocr_text: string | null
          source: string | null
          summary: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          applicable_date?: string | null
          classification_confidence?: number | null
          created_at?: string | null
          cs_documents_entry_id?: string | null
          cs_kaipoke_info_id?: string | null
          doc_date_raw?: string | null
          doc_name?: string | null
          doc_type_id?: string | null
          extracted_support_goal?: never
          id?: string | null
          kaipoke_cs_id?: string | null
          llm_model?: string | null
          meta?: Json | null
          ocr_text?: string | null
          source?: string | null
          summary?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          applicable_date?: string | null
          classification_confidence?: number | null
          created_at?: string | null
          cs_documents_entry_id?: string | null
          cs_kaipoke_info_id?: string | null
          doc_date_raw?: string | null
          doc_name?: string | null
          doc_type_id?: string | null
          extracted_support_goal?: never
          id?: string | null
          kaipoke_cs_id?: string | null
          llm_model?: string | null
          meta?: Json | null
          ocr_text?: string | null
          source?: string | null
          summary?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_docs_cs_kaipoke_info_id_fkey"
            columns: ["cs_kaipoke_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
          {
            foreignKeyName: "cs_docs_doc_type_id_fkey"
            columns: ["doc_type_id"]
            isOneToOne: false
            referencedRelation: "user_doc_master"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_kaipoke_fax_email_view: {
        Row: {
          care_consultant: string | null
          email: string | null
          fax: string | null
          kaipoke_cs_id: string | null
          name: string | null
        }
        Relationships: []
      }
      cs_kaipoke_info_shift_detail_view: {
        Row: {
          address: string | null
          asigned_jisseki_staff: string | null
          asigned_org: string | null
          biko: string | null
          birth_yyyy_mm_dd: string | null
          care_consultant: string | null
          commuting_flg: boolean | null
          document_summary: string | null
          documents: Json | null
          email: string | null
          end_at: string | null
          gender: string | null
          gender_request: string | null
          id: string | null
          ido_end_at: string | null
          ido_jukyusyasho: string | null
          ido_start_at: string | null
          is_active: boolean | null
          kaigo_end_at: string | null
          kaigo_hoken_no: string | null
          kaigo_start_at: string | null
          kaipoke_biko: string | null
          kaipoke_cs_id: string | null
          kana: string | null
          kodoengo_plan_link: string | null
          name: string | null
          name_kana: string | null
          phone_01: string | null
          phone_02: string | null
          postal_code: string | null
          pre_org_icon_id: string | null
          service_kind: string | null
          shift_detail_information: string | null
          shogai_end_at: string | null
          shogai_jukyusha_no: string | null
          shogai_start_at: string | null
          standard_purpose: string | null
          standard_route: string | null
          standard_trans_ways: string | null
          time_adjustability: string | null
          time_adjustability_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_kaipoke_info_time_adjustability_id_fkey"
            columns: ["time_adjustability_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_time_adjustability"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cs_gender_request"
            columns: ["gender_request"]
            isOneToOne: false
            referencedRelation: "cs_gender_request"
            referencedColumns: ["gender_request_id"]
          },
        ]
      }
      dashboard_service_time_qualification_breakdown_view: {
        Row: {
          category_order: number | null
          qualified_ratio: number | null
          qualified_service_hours: number | null
          service_category: string | null
          threshold_status: string | null
          total_service_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      dashboard_service_time_qualification_monthly_view: {
        Row: {
          qualified_ratio: number | null
          qualified_service_hours: number | null
          threshold_status: string | null
          total_service_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      dashboard_service_time_qualification_staff_detail_view: {
        Row: {
          qualification_from: string | null
          qualification_status: string | null
          qualifications: string | null
          qualified_ratio: number | null
          qualified_service_hours: number | null
          service_category: string | null
          staff_name: string | null
          staff_user_id: string | null
          total_service_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      disability_check_view: {
        Row: {
          application_check: boolean | null
          asigned_jisseki_staff_id: string | null
          asigned_jisseki_staff_name: string | null
          asigned_org_id: string | null
          asigned_org_name: string | null
          client_name: string | null
          district: string | null
          ido_jukyusyasho: string | null
          is_checked: boolean | null
          kaipoke_cs_id: string | null
          kaipoke_servicek: string | null
          year_month: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      form_entries_ordered: {
        Row: {
          address: string | null
          agreed_at: string | null
          agreed_privacy: boolean | null
          agreed_terms: boolean | null
          auth_uid: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          commute_options: string[] | null
          consent_snapshot: Json | null
          created_at: string | null
          email: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          health_condition: string | null
          id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          license_back_url: string | null
          license_front_url: string | null
          motivation: string | null
          phone: string | null
          photo_url: string | null
          postal_code: string | null
          residence_card_url: string | null
          workstyle_other: string | null
        }
        Insert: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji?: string | null
          health_condition?: string | null
          id?: string | null
          last_name_kana?: string | null
          last_name_kanji?: string | null
          license_back_url?: string | null
          license_front_url?: string | null
          motivation?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          residence_card_url?: string | null
          workstyle_other?: string | null
        }
        Update: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji?: string | null
          health_condition?: string | null
          id?: string | null
          last_name_kana?: string | null
          last_name_kanji?: string | null
          license_back_url?: string | null
          license_front_url?: string | null
          motivation?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          residence_card_url?: string | null
          workstyle_other?: string | null
        }
        Relationships: []
      }
      form_entries_view: {
        Row: {
          address: string | null
          agreed_at: string | null
          agreed_privacy: boolean | null
          agreed_terms: boolean | null
          auth_uid: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          commute_options: string[] | null
          consent_snapshot: Json | null
          created_at: string | null
          email: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          health_condition: string | null
          id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          license_back_url: string | null
          license_front_url: string | null
          motivation: string | null
          period_from_1: string | null
          period_from_2: string | null
          period_from_3: string | null
          period_to_1: string | null
          period_to_2: string | null
          period_to_3: string | null
          phone: string | null
          photo_url: string | null
          postal_code: string | null
          residence_card_url: string | null
          workplace_1: string | null
          workplace_2: string | null
          workplace_3: string | null
          workstyle_other: string | null
        }
        Insert: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji?: string | null
          health_condition?: string | null
          id?: string | null
          last_name_kana?: string | null
          last_name_kanji?: string | null
          license_back_url?: string | null
          license_front_url?: string | null
          motivation?: string | null
          period_from_1?: string | null
          period_from_2?: string | null
          period_from_3?: string | null
          period_to_1?: string | null
          period_to_2?: string | null
          period_to_3?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          residence_card_url?: string | null
          workplace_1?: string | null
          workplace_2?: string | null
          workplace_3?: string | null
          workstyle_other?: string | null
        }
        Update: {
          address?: string | null
          agreed_at?: string | null
          agreed_privacy?: boolean | null
          agreed_terms?: boolean | null
          auth_uid?: string | null
          birth_day?: number | null
          birth_month?: number | null
          birth_year?: number | null
          certifications?: Json | null
          commute_options?: string[] | null
          consent_snapshot?: Json | null
          created_at?: string | null
          email?: string | null
          first_name_kana?: string | null
          first_name_kanji?: string | null
          health_condition?: string | null
          id?: string | null
          last_name_kana?: string | null
          last_name_kanji?: string | null
          license_back_url?: string | null
          license_front_url?: string | null
          motivation?: string | null
          period_from_1?: string | null
          period_from_2?: string | null
          period_from_3?: string | null
          period_to_1?: string | null
          period_to_2?: string | null
          period_to_3?: string | null
          phone?: string | null
          photo_url?: string | null
          postal_code?: string | null
          residence_card_url?: string | null
          workplace_1?: string | null
          workplace_2?: string | null
          workplace_3?: string | null
          workstyle_other?: string | null
        }
        Relationships: []
      }
      form_entries_with_status: {
        Row: {
          address: string | null
          agreed_at: string | null
          agreed_privacy: boolean | null
          agreed_terms: boolean | null
          attachments: Json | null
          auth_uid: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          commute_options: string[] | null
          consent_snapshot: Json | null
          created_at: string | null
          email: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          gender: string | null
          health_condition: string | null
          id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          level_id: string | null
          level_label: string | null
          level_sort: number | null
          license_back_url: string | null
          license_files: Json | null
          license_front_url: string | null
          manager_note: string | null
          motivation: string | null
          period_from_1: string | null
          period_from_2: string | null
          period_from_3: string | null
          period_to_1: string | null
          period_to_2: string | null
          period_to_3: string | null
          phone: string | null
          photo_url: string | null
          postal_code: string | null
          residence_card_url: string | null
          status: string | null
          status_label: string | null
          work_styles: string[] | null
          workplace_1: string | null
          workplace_2: string | null
          workplace_3: string | null
          workstyle_other: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "user_status_master"
            referencedColumns: ["id"]
          },
        ]
      }
      group_lw_channel_view: {
        Row: {
          channel_id: string | null
          group_account: string | null
          group_id: string | null
          group_name: string | null
          group_type: string | null
        }
        Relationships: []
      }
      manager_monthly_distance_index_view: {
        Row: {
          monthly_distance_index: number | null
          movement_segment_count: number | null
          staff_name: string | null
          target_month: string | null
          user_id: string | null
          work_day_count: number | null
        }
        Relationships: []
      }
      msg_lw_log_with_group_account: {
        Row: {
          channel_id: string | null
          domain_id: string | null
          event_type: string | null
          file_id: string | null
          group_account: string | null
          group_id: string | null
          group_name: string | null
          group_type: string | null
          id: number | null
          is_numeric_group_account: boolean | null
          members: Json | null
          message: string | null
          status: number | null
          timestamp: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_msg_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "msg_lw_status"
            referencedColumns: ["id"]
          },
        ]
      }
      org_assigned_icon: {
        Row: {
          asigned_org: string | null
          cs_id: string | null
          expected_category: string | null
          expected_category_label: string | null
          expected_icon_id: string | null
          file_url: string | null
          kaipoke_cs_id: string | null
          mgr_user_id: string | null
          name: string | null
          orgunitname: string | null
          pre_org_icon_id: string | null
          service_kind: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_org_icons_category"
            columns: ["expected_category"]
            isOneToOne: false
            referencedRelation: "org_icons_category"
            referencedColumns: ["id"]
          },
        ]
      }
      org_manager_view: {
        Row: {
          description: string | null
          displaylevel: number | null
          displayorder: number | null
          mgr_auth_user_id: string | null
          mgr_email: string | null
          mgr_entry_id: string | null
          mgr_first_name_kanji: string | null
          mgr_full_name: string | null
          mgr_last_name_kanji: string | null
          mgr_phone: string | null
          mgr_user_id: string | null
          orgunitid: string | null
          orgunitname: string | null
          parentorgunitid: string | null
        }
        Relationships: []
      }
      orgs_sort: {
        Row: {
          description: string | null
          displaylevel: number | null
          displayorder: number | null
          lv2_id: string | null
          lv2_name: string | null
          lv2_order: number | null
          orgunitid: string | null
          orgunitname: string | null
          parentorgunitid: string | null
          sort_lv2_order: number | null
          sort_lv3_order: number | null
        }
        Relationships: []
      }
      parking_cs_places_admin_view: {
        Row: {
          client_address: string | null
          client_name: string | null
          created_at: string | null
          first_shift_date: string | null
          id: string | null
          kaipoke_cs_id: string | null
          label: string | null
          location_link: string | null
          next_shift_date: string | null
          parking_orientation: string | null
          permit_required: boolean | null
          picture1_url: string | null
          picture2_url: string | null
          police_station_place_id: string | null
          remarks: string | null
          serial: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "parking_cs_places_kaipoke_cs_id_fkey"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      plan_generation_source_view: {
        Row: {
          active: boolean | null
          duration_minutes: number | null
          effective_from: string | null
          effective_to: string | null
          end_time: string | null
          invalid_time: boolean | null
          is_biweekly: boolean | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          nth_weeks: number[] | null
          overlaps_same_weekday: boolean | null
          plan_display_name: string | null
          plan_document_kind: string | null
          plan_service_category: string | null
          required_staff_count: number | null
          service_code: string | null
          shift_service_code_id: string | null
          start_time: string | null
          template_id: number | null
          two_person_work_flg: boolean | null
          weekday: number | null
          weekday_jp: string | null
        }
        Relationships: []
      }
      plan_goal_tree_view: {
        Row: {
          assessment_id: string | null
          client_info_id: string | null
          kaipoke_cs_id: string | null
          long_term_achievement_level: string | null
          long_term_display_order: number | null
          long_term_effectiveness_satisfaction: string | null
          long_term_end_date: string | null
          long_term_goal_text: string | null
          long_term_start_date: string | null
          plan_document_kind: string | null
          plan_id: string | null
          plan_long_term_goal_id: string | null
          plan_short_term_goal_id: string | null
          plan_status: string | null
          plan_title: string | null
          short_term_achievement_level: string | null
          short_term_display_order: number | null
          short_term_effectiveness_satisfaction: string | null
          short_term_end_date: string | null
          short_term_goal_text: string | null
          short_term_start_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments_records"
            referencedColumns: ["assessment_id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
        ]
      }
      plan_services_view: {
        Row: {
          active: boolean | null
          assessment_id: string | null
          client_info_id: string | null
          created_at: string | null
          display_order: number | null
          duration_minutes: number | null
          end_time: string | null
          family_action: string | null
          generation_meta: Json | null
          is_biweekly: boolean | null
          kaipoke_cs_id: string | null
          monthly_hours: number | null
          monthly_minutes: number | null
          monthly_occurrence_factor: number | null
          nth_weeks: number[] | null
          observation_points: string | null
          parent_plan_document_kind: string | null
          plan_document_kind: string | null
          plan_id: string | null
          plan_service_category: string | null
          plan_service_id: string | null
          plan_status: string | null
          plan_title: string | null
          procedure_notes: string | null
          required_staff_count: number | null
          schedule_note: string | null
          service_code: string | null
          service_detail: string | null
          service_no: number | null
          service_title: string | null
          shift_service_code_id: string | null
          source_snapshot: Json | null
          start_time: string | null
          template_id: number | null
          two_person_work_flg: boolean | null
          updated_at: string | null
          weekday: number | null
          weekday_jp: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan_goal_tree_view"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_services_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "plan_services_shift_service_code_id_fkey"
            columns: ["shift_service_code_id"]
            isOneToOne: false
            referencedRelation: "plan_generation_source_view"
            referencedColumns: ["shift_service_code_id"]
          },
          {
            foreignKeyName: "plan_services_shift_service_code_id_fkey"
            columns: ["shift_service_code_id"]
            isOneToOne: false
            referencedRelation: "shift_service_code"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "plan_generation_source_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_weekly_template"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shift_weekly_template_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plan_services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "shit_weekly_template_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "plans_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments_records"
            referencedColumns: ["assessment_id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_client_info_id_fkey"
            columns: ["client_info_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["cs_id"]
          },
        ]
      }
      postal_distinct_fax_link_status: {
        Row: {
          district: string | null
          dsp_short: string | null
          fax_record_count: number | null
          link_status: string | null
          postal_code_3: string | null
          transport_fee_per_service: number | null
        }
        Relationships: []
      }
      reentry_recruitment_candidates: {
        Row: {
          address: string | null
          email: string | null
          entry_created_at: string | null
          last_reentry_invitation_at: string | null
          phone: string | null
          reentry_blacklisted: boolean | null
          retirement_date: string | null
          staff_id: string | null
          staff_kind: string | null
          staff_name: string | null
          user_id: string | null
        }
        Relationships: []
      }
      rpa_command_requests_view: {
        Row: {
          approver_id: string | null
          approver_name: string | null
          created_at: string | null
          id: string | null
          kind_name: string | null
          request_details: Json | null
          requester_id: string | null
          requester_name: string | null
          result_details: Json | null
          result_summary: string | null
          status: string | null
          status_label: string | null
          template_id: string | null
          template_name: string | null
        }
        Relationships: []
      }
      rpa_request_view: {
        Row: {
          kind_name: string | null
          kind_sort_order: number | null
          request_details: Json | null
          request_id: string | null
          requested_at: string | null
          status: string | null
          template_arg_labels: Json | null
          template_description: string | null
          template_id: string | null
          template_kind_id: string | null
          template_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_kind"
            columns: ["template_kind_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_kind"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rpa_command_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_requests_view"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "rpa_command_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "rpa_command_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_add_status_view: {
        Row: {
          cancel_value: string | null
          created_at: string | null
          head_shift_id: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          required_staff_count: number | null
          service_code: string | null
          shift_end_date: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          shift_timerange: unknown
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          status: string | null
          summary_flg: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
          update_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_csinfo_postalname_view: {
        Row: {
          district: string | null
          dsp_short: string | null
          female_flg: boolean | null
          gender_request_name: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          level_sort_order: number | null
          male_flg: boolean | null
          name: string | null
          postal_code: string | null
          postal_code_3: string | null
          require_doc_group: string | null
          required_staff_count: number | null
          roster_sort: string | null
          service_code: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_kaipoke_user_id: string | null
          staff_01_level_sort: number | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_kaipoke_user_id: string | null
          staff_02_level_sort: number | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_kaipoke_user_id: string | null
          staff_03_level_sort: number | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_csinfo_postalname_view2: {
        Row: {
          district: string | null
          dsp_short: string | null
          female_flg: boolean | null
          gender_request_name: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          level_sort_order: number | null
          male_flg: boolean | null
          name: string | null
          offer_created_at: string | null
          offer_updated_at: string | null
          postal_code: string | null
          postal_code_3: string | null
          require_doc_group: string | null
          required_staff_count: number | null
          roster_sort: string | null
          service_code: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_kaipoke_user_id: string | null
          staff_01_level_sort: number | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_kaipoke_user_id: string | null
          staff_02_level_sort: number | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_kaipoke_user_id: string | null
          staff_03_level_sort: number | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          status: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_csinfo_roster_view: {
        Row: {
          client_name: string | null
          dsp_short: string | null
          end_at: string | null
          female_flg: boolean | null
          gender_request_name: string | null
          kaipoke_cs_id: string | null
          male_flg: boolean | null
          service_code: string | null
          service_name: string | null
          shift_date: string | null
          shift_id: number | null
          staff_id_1: string | null
          staff_id_2: string | null
          staff_id_3: string | null
          start_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_daily_dialog_view: {
        Row: {
          address: string | null
          client_name: string | null
          cs_note: string | null
          dsp_short: string | null
          end_at: string | null
          female_flg: boolean | null
          gender_request: string | null
          gender_request_name: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          male_flg: boolean | null
          map_url: string | null
          postal_code: string | null
          required_staff_count: number | null
          service_code: string | null
          service_name: string | null
          shift_date: string | null
          shift_id: number | null
          staff_02_attend_flg: boolean | null
          staff_03_attend_flg: boolean | null
          staff_id_1: string | null
          staff_id_2: string | null
          staff_id_3: string | null
          start_at: string | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cs_gender_request"
            columns: ["gender_request"]
            isOneToOne: false
            referencedRelation: "cs_gender_request"
            referencedColumns: ["gender_request_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_daily_dialog_view2: {
        Row: {
          address: string | null
          client_name: string | null
          cs_note: string | null
          dsp_short: string | null
          end_at: string | null
          female_flg: boolean | null
          gender_request: string | null
          gender_request_name: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          male_flg: boolean | null
          map_url: string | null
          offer_created_at: string | null
          offer_updated_at: string | null
          postal_code: string | null
          required_staff_count: number | null
          service_code: string | null
          service_name: string | null
          shift_date: string | null
          shift_id: number | null
          staff_02_attend_flg: boolean | null
          staff_03_attend_flg: boolean | null
          staff_id_1: string | null
          staff_id_2: string | null
          staff_id_3: string | null
          start_at: string | null
          status: string | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cs_gender_request"
            columns: ["gender_request"]
            isOneToOne: false
            referencedRelation: "cs_gender_request"
            referencedColumns: ["gender_request_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_daily_dialog_view3: {
        Row: {
          address: string | null
          client_document_summaries: Json | null
          client_name: string | null
          cs_note: string | null
          dsp_short: string | null
          end_at: string | null
          female_flg: boolean | null
          gender_request: string | null
          gender_request_name: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          male_flg: boolean | null
          map_url: string | null
          postal_code: string | null
          required_staff_count: number | null
          service_code: string | null
          service_name: string | null
          shift_date: string | null
          shift_id: number | null
          staff_02_attend_flg: boolean | null
          staff_03_attend_flg: boolean | null
          staff_id_1: string | null
          staff_id_2: string | null
          staff_id_3: string | null
          start_at: string | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cs_gender_request"
            columns: ["gender_request"]
            isOneToOne: false
            referencedRelation: "cs_gender_request"
            referencedColumns: ["gender_request_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_mfcloud_payroll_monthly: {
        Row: {
          target_month: string | null
          Version: number | null
          キャンセル回数: number | null
          サービス回数: number | null
          事業所名: string | null
          処遇改善加算: string | null
          "出勤日数（平日）": number | null
          名: string | null
          契約種別: string | null
          姓: string | null
          年末年始出勤時間: string | null
          従業員番号: string | null
          従業員識別子: string | null
          "所定時間（平日）": string | null
          有休取得日数: string | null
          "深夜所定時間（平日）": string | null
          特定処遇改善加算: string | null
          独自回数: string | null
          移動回数: number | null
          職種名: string | null
          "身体・同行・行動時間": string | null
          部門名: string | null
          重訪移動時間: string | null
          食事回数: string | null
        }
        Relationships: []
      }
      shift_mfcloud_payroll_monthly_plus_tsuin: {
        Row: {
          target_month: string | null
          Version: number | null
          キャンセル回数: number | null
          サービス回数: number | null
          事業所名: string | null
          処遇改善加算: string | null
          "出勤日数（平日）": number | null
          名: string | null
          契約種別: string | null
          姓: string | null
          年末年始出勤時間: string | null
          従業員番号: string | null
          従業員識別子: string | null
          "所定時間（平日）": string | null
          有休取得日数: string | null
          "深夜所定時間（平日）": string | null
          特定処遇改善加算: string | null
          独自回数: string | null
          移動回数: number | null
          職種名: string | null
          "身体・同行・行動時間": string | null
          "通院等介助（身体なし）時間": string | null
          部門名: string | null
          重訪移動時間: string | null
          食事回数: string | null
        }
        Relationships: []
      }
      shift_mfcloud_payroll_monthly_plus_yearend: {
        Row: {
          target_month: string | null
          Version: number | null
          キャンセル回数: number | null
          サービス回数: number | null
          事業所名: string | null
          処遇改善加算: string | null
          "出勤日数（平日）": number | null
          名: string | null
          契約種別: string | null
          姓: string | null
          年末年始出勤時間: string | null
          従業員番号: string | null
          従業員識別子: string | null
          "所定時間（平日）": string | null
          有休取得日数: string | null
          "深夜所定時間（平日）": string | null
          特定処遇改善加算: string | null
          独自回数: string | null
          移動回数: number | null
          職種名: string | null
          "身体・同行・行動時間": string | null
          "通院等介助（身体なし）時間": string | null
          部門名: string | null
          重訪移動時間: string | null
          食事回数: string | null
        }
        Relationships: []
      }
      shift_rpa_status_view: {
        Row: {
          has_rpa_request: boolean | null
          shift_id: number | null
        }
        Relationships: []
      }
      shift_self_coordinate_card_view: {
        Row: {
          additional_hourly_wage: number | null
          address: string | null
          base_hourly_wage: number | null
          district: string | null
          dsp_short: string | null
          estimated_pay_amount: number | null
          female_flg: boolean | null
          gender_request_name: string | null
          hourly_total_wage: number | null
          judo_ido: string | null
          judo_ido_hours: number | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          level_sort_order: number | null
          male_flg: boolean | null
          name: string | null
          normal_hours: number | null
          per_service_amount: number | null
          postal_code: string | null
          postal_code_3: string | null
          premium_hours: number | null
          require_doc_group: string | null
          required_staff_count: number | null
          roster_sort: string | null
          service_code: string | null
          service_hours: number | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_kaipoke_user_id: string | null
          staff_01_level_sort: number | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_kaipoke_user_id: string | null
          staff_02_level_sort: number | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_kaipoke_user_id: string | null
          staff_03_level_sort: number | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          transport_fee_per_service: number | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_self_coordinate_card_view2: {
        Row: {
          additional_hourly_wage: number | null
          address: string | null
          applicant_control_url: string | null
          applicant_name: string | null
          applicant_sex: string | null
          base_hourly_wage: number | null
          district: string | null
          dsp_short: string | null
          estimated_pay_amount: number | null
          female_flg: boolean | null
          gender_request_name: string | null
          hourly_total_wage: number | null
          judo_ido: string | null
          judo_ido_hours: number | null
          kaipoke_cs_id: string | null
          kaipoke_servicecode: string | null
          kaipoke_servicek: string | null
          level_sort_order: number | null
          male_flg: boolean | null
          name: string | null
          normal_hours: number | null
          per_service_amount: number | null
          postal_code: string | null
          postal_code_3: string | null
          premium_hours: number | null
          require_doc_group: string | null
          required_staff_count: number | null
          roster_sort: string | null
          service_code: string | null
          service_hours: number | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          spot_offer_status: string | null
          staff_01_kaipoke_user_id: string | null
          staff_01_level_sort: number | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_kaipoke_user_id: string | null
          staff_02_level_sort: number | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_kaipoke_user_id: string | null
          staff_03_level_sort: number | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          transport_fee_per_service: number | null
          two_person_work_flg: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_shift_record_view: {
        Row: {
          client_name: string | null
          created_at: string | null
          head_shift_id: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          record_created_at: string | null
          record_created_by: string | null
          record_id: string | null
          record_status: string | null
          required_staff_count: number | null
          service_code: string | null
          shift_end_date: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
          update_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_shift_record_view2: {
        Row: {
          applicant_control_url: string | null
          applicant_name: string | null
          applicant_sex: string | null
          client_name: string | null
          created_at: string | null
          head_shift_id: string | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          record_created_at: string | null
          record_created_by: string | null
          record_id: string | null
          record_status: string | null
          required_staff_count: number | null
          service_code: string | null
          shift_end_date: string | null
          shift_end_time: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          status: string | null
          tokutei_comment: string | null
          two_person_work_flg: boolean | null
          update_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      shift_summary_monthly_cs_view: {
        Row: {
          cs_name: string | null
          diff_hours: number | null
          kaipoke_cs_id: string | null
          month_start: string | null
          prev_month_hours: number | null
          this_month_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      shift_summary_monthly_team_view: {
        Row: {
          avg_3m_hours: number | null
          month_start: string | null
          orgunitid: string | null
          orgunitname: string | null
          total_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      shift_summary_monthly_view: {
        Row: {
          month_start: string | null
          total_hours: number | null
          year_month: string | null
        }
        Relationships: []
      }
      shift_weekly_template_view: {
        Row: {
          active: boolean | null
          duration_minutes: number | null
          effective_from: string | null
          effective_to: string | null
          end_time: string | null
          invalid_time: boolean | null
          is_biweekly: boolean | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          nth_weeks: number[] | null
          overlaps_same_weekday: boolean | null
          required_staff_count: number | null
          service_code: string | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          start_time: string | null
          template_id: number | null
          two_person_work_flg: boolean | null
          weekday: number | null
          weekday_jp: string | null
        }
        Insert: {
          active?: boolean | null
          duration_minutes?: never
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          invalid_time?: never
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          nth_weeks?: number[] | null
          overlaps_same_weekday?: never
          required_staff_count?: number | null
          service_code?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean | null
          weekday?: number | null
          weekday_jp?: never
        }
        Update: {
          active?: boolean | null
          duration_minutes?: never
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          invalid_time?: never
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          nth_weeks?: number[] | null
          overlaps_same_weekday?: never
          required_staff_count?: number | null
          service_code?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean | null
          weekday?: number | null
          weekday_jp?: never
        }
        Relationships: []
      }
      shift_wish_portal_view: {
        Row: {
          area_text: string | null
          created_at: string | null
          fax_name_masked: string | null
          full_name: string | null
          gender: string | null
          id: number | null
          postal_area_json: Json | null
          preferred_date: Json | null
          preferred_weekday: Json | null
          qual_text: string | null
          request_type: string | null
          schedule_text: string | null
          time_end_hour: number | null
          time_start_hour: number | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      shit_weekly_template_view: {
        Row: {
          active: boolean | null
          duration_minutes: number | null
          effective_from: string | null
          effective_to: string | null
          end_time: string | null
          invalid_time: boolean | null
          is_biweekly: boolean | null
          judo_ido: string | null
          kaipoke_cs_id: string | null
          nth_weeks: number[] | null
          overlaps_same_weekday: boolean | null
          required_staff_count: number | null
          service_code: string | null
          staff_01_role_code: string | null
          staff_01_user_id: string | null
          staff_02_attend_flg: boolean | null
          staff_02_role_code: string | null
          staff_02_user_id: string | null
          staff_03_attend_flg: boolean | null
          staff_03_role_code: string | null
          staff_03_user_id: string | null
          start_time: string | null
          template_id: number | null
          two_person_work_flg: boolean | null
          weekday: number | null
          weekday_jp: string | null
        }
        Insert: {
          active?: boolean | null
          duration_minutes?: never
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          invalid_time?: never
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          nth_weeks?: number[] | null
          overlaps_same_weekday?: never
          required_staff_count?: number | null
          service_code?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean | null
          weekday?: number | null
          weekday_jp?: never
        }
        Update: {
          active?: boolean | null
          duration_minutes?: never
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string | null
          invalid_time?: never
          is_biweekly?: boolean | null
          judo_ido?: string | null
          kaipoke_cs_id?: string | null
          nth_weeks?: number[] | null
          overlaps_same_weekday?: never
          required_staff_count?: number | null
          service_code?: string | null
          staff_01_role_code?: string | null
          staff_01_user_id?: string | null
          staff_02_attend_flg?: boolean | null
          staff_02_role_code?: string | null
          staff_02_user_id?: string | null
          staff_03_attend_flg?: boolean | null
          staff_03_role_code?: string | null
          staff_03_user_id?: string | null
          start_time?: string | null
          template_id?: number | null
          two_person_work_flg?: boolean | null
          weekday?: number | null
          weekday_jp?: never
        }
        Relationships: []
      }
      taimee_applicants_with_entry: {
        Row: {
          applicant_control_url: string | null
          applicant_id: string | null
          application_status: string | null
          black_list: boolean | null
          created_at: string | null
          employment_contract_count: number | null
          entry_id: string | null
          fetch_error: string | null
          fetch_status: string | null
          identity_document_count: number | null
          in_entry: boolean | null
          last_fetched_at: string | null
          last_sent_at: string | null
          latest_applicant_job_id: string | null
          latest_end_time: string | null
          latest_job_control_url: string | null
          latest_job_id: string | null
          latest_job_name: string | null
          latest_shift_id: string | null
          latest_start_time: string | null
          latest_work_date: string | null
          link_status: string | null
          memo: string | null
          normalized_phone: string | null
          other_document_count: number | null
          period_month: string | null
          qualification_certificate_count: number | null
          send_disabled: boolean | null
          taimee_user_id: string | null
          total_document_count: number | null
          updated_at: string | null
          住所: string | null
          名: string | null
          名カナ: string | null
          姓: string | null
          姓カナ: string | null
          性別: string | null
          電話番号: string | null
        }
        Relationships: []
      }
      taimee_employees_with_entry: {
        Row: {
          black_list: boolean | null
          entry_id: string | null
          in_entry: boolean | null
          last_sent_at: string | null
          memo: string | null
          normalized_phone: string | null
          period_month: string | null
          send_disabled: boolean | null
          source_filename: string | null
          taimee_user_id: string | null
          uploaded_at: string | null
          "ユーザーID（ユーザーによって一意な値）": string | null
          住所: string | null
          最終稼働日: string | null
          初回稼働日: string | null
          名: string | null
          姓: string | null
          性別: string | null
          生年月日: string | null
          累計交通費支払額: string | null
          累計実働時間: string | null
          累計法定外割増時間: string | null
          累計深夜労働時間: string | null
          累計源泉徴収額: string | null
          累計稼働回数: string | null
          累計給与支払額: string | null
          累計通常勤務時間: string | null
          電話番号: string | null
        }
        Relationships: []
      }
      tokutei_clone_targets_view: {
        Row: {
          has_executed_record: boolean | null
          kaipoke_cs_id: string | null
          prev_shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          target_shift_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
      user_entry_united_view: {
        Row: {
          address: string | null
          auth_uid: string | null
          auth_user_id: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          channel_id: string | null
          created_at: string | null
          email: string | null
          end_at: string | null
          entry_id: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          gender: string | null
          group_id: string | null
          group_name: string | null
          group_type: string | null
          health_condition: string | null
          kaipoke_user_id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          level_id: string | null
          level_sort: number | null
          lw_userid: string | null
          manager_auth_user_id: string | null
          manager_kaipoke_user_id: string | null
          manager_lw_userid: string | null
          manager_user_id: string | null
          motivation: string | null
          myfamille_id: string | null
          org_unit_id: string | null
          phone: string | null
          position_id: string | null
          postal_code: string | null
          status: string | null
          system_role: string | null
          user_id: string | null
          work_styles: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_role"
            columns: ["system_role"]
            isOneToOne: false
            referencedRelation: "system_role_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "user_status_master"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entry_united_view_single: {
        Row: {
          address: string | null
          auth_uid: string | null
          auth_user_id: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          channel_id: string | null
          created_at: string | null
          email: string | null
          end_at: string | null
          entry_date_latest: string | null
          entry_date_original: string | null
          entry_id: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          gender: string | null
          group_id: string | null
          group_name: string | null
          group_type: string | null
          health_condition: string | null
          kaipoke_user_id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          level_id: string | null
          level_sort: number | null
          lw_userid: string | null
          manager_auth_user_id: string | null
          manager_kaipoke_user_id: string | null
          manager_lw_userid: string | null
          manager_user_id: string | null
          motivation: string | null
          myfamille_id: string | null
          org_order: string | null
          org_order_num: number | null
          org_unit_id: string | null
          orgunitname: string | null
          phone: string | null
          position_id: string | null
          postal_code: string | null
          resign_date_latest: string | null
          roster_sort: string | null
          status: string | null
          system_role: string | null
          user_id: string | null
          work_styles: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_role"
            columns: ["system_role"]
            isOneToOne: false
            referencedRelation: "system_role_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "user_status_master"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entry_united_view_single_career: {
        Row: {
          address: string | null
          auth_uid: string | null
          auth_user_id: string | null
          birth_day: number | null
          birth_month: number | null
          birth_year: number | null
          certifications: Json | null
          channel_id: string | null
          created_at: string | null
          email: string | null
          end_at: string | null
          entry_date_latest: string | null
          entry_date_original: string | null
          entry_id: string | null
          first_name_kana: string | null
          first_name_kanji: string | null
          gender: string | null
          group_id: string | null
          group_name: string | null
          group_type: string | null
          health_condition: string | null
          kaipoke_user_id: string | null
          last_name_kana: string | null
          last_name_kanji: string | null
          level_id: string | null
          level_sort: number | null
          lw_userid: string | null
          manager_auth_user_id: string | null
          manager_kaipoke_user_id: string | null
          manager_lw_userid: string | null
          manager_user_id: string | null
          motivation: string | null
          myfamille_id: string | null
          org_order: string | null
          org_order_num: number | null
          org_unit_id: string | null
          orgunitname: string | null
          phone: string | null
          position_id: string | null
          postal_code: string | null
          resign_date_latest: string | null
          roster_sort: string | null
          status: string | null
          system_role: string | null
          user_id: string | null
          work_styles: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_system_role"
            columns: ["system_role"]
            isOneToOne: false
            referencedRelation: "system_role_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user_status"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "user_status_master"
            referencedColumns: ["id"]
          },
        ]
      }
      users_personal_group_view: {
        Row: {
          channel_id: string | null
          email: string | null
          form_entries_id: string | null
          lw_userid: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_shift_detail: {
        Row: {
          district: string | null
          female_flg: boolean | null
          gender_request_name: string | null
          kaipoke_cs_id: string | null
          male_flg: boolean | null
          name: string | null
          postal_code: string | null
          postal_code_3: string | null
          service_code: string | null
          shift_id: number | null
          shift_start_date: string | null
          shift_start_time: string | null
          staff_01_user_id: string | null
          staff_02_user_id: string | null
          staff_03_user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_fax_email_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "cs_kaipoke_info_shift_detail_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "org_assigned_icon"
            referencedColumns: ["kaipoke_cs_id"]
          },
          {
            foreignKeyName: "fk_shift_cs_kaipoke"
            columns: ["kaipoke_cs_id"]
            isOneToOne: false
            referencedRelation: "shift_summary_monthly_cs_view"
            referencedColumns: ["kaipoke_cs_id"]
          },
        ]
      }
    }
    Functions: {
      add_meeting_shifts_eom: {
        Args: { p_kaipoke_cs_id?: string; p_minutes?: number }
        Returns: number
      }
      add_meeting_shifts_for_month_eom_same_time: {
        Args: { p_kaipoke_cs_id?: string; p_target_ym?: string }
        Returns: number
      }
      add_office_to_fax: {
        Args: {
          p_assigned_by: string
          p_fax_received_id: number
          p_is_primary?: boolean
          p_office_id: number
          p_register_fax_proxy?: boolean
        }
        Returns: Json
      }
      add_offices_to_fax_bulk: {
        Args: {
          p_assigned_by?: string
          p_fax_received_id: number
          p_office_ids: number[]
        }
        Returns: Json
      }
      add_pages_to_document: {
        Args: { p_document_id: number; p_page_ids: number[] }
        Returns: Json
      }
      assign_user_to_shift: {
        Args: {
          p_accompany?: boolean
          p_role_code?: string
          p_shift_id: number
          p_user_id: string
        }
        Returns: Json
      }
      assign_user_to_shift_v2: {
        Args: {
          p_accompany?: boolean
          p_role_code?: string
          p_shift_id: number
          p_user_id: string
        }
        Returns: Json
      }
      audit_diff_cols: {
        Args: { new_row: Json; old_row: Json }
        Returns: string[]
      }
      batch_reassign_departed_staff_shifts: {
        Args: {
          p_actor_auth_id: string
          p_from_user_id: string
          p_start_at: string
          p_to_user_id: string
        }
        Returns: {
          deleted_count: number
          failed_count: number
          processed_count: number
          updated_count: number
          weekly_deleted_count: number
          weekly_processed_count: number
          weekly_updated_count: number
        }[]
      }
      build_cs_document_json_from_cs_docs: {
        Args: {
          p_classification_confidence: number
          p_created_at: string
          p_doc_date_raw: string
          p_doc_name: string
          p_doc_type_id: string
          p_id: string
          p_meta: Json
          p_source: string
          p_summary: string
          p_updated_at: string
          p_url: string
        }
        Returns: Json
      }
      classify_cs_doc_label: {
        Args: { p_current_label?: string; p_text: string }
        Returns: string
      }
      cm_get_alert_stats: {
        Args: never
        Returns: {
          category: string
          count: number
          status: string
        }[]
      }
      cm_resolve_alert_by_reference: {
        Args: {
          p_category: string
          p_kaipoke_cs_id: string
          p_reference_id: string
          p_resolution_note?: string
        }
        Returns: string
      }
      cm_resolve_alerts_by_termination: {
        Args: { p_category: string; p_resolution_note?: string }
        Returns: number
      }
      cron_alert_dedupe_and_recalc: {
        Args: never
        Returns: {
          deleted_count: number
          updated_count: number
        }[]
      }
      cron_sync_cs_documents: {
        Args: never
        Returns: {
          filled_doc_dates: number
          fixed_doc_names: number
          matched_kaipoke_ids: number
          relabeled_documents: number
          unresolved: number
          updated_infos: number
        }[]
      }
      dashboard_service_time_qualification_staff_rows: {
        Args: never
        Returns: {
          qualified: boolean
          service_category: string
          service_date: string
          staff_user_id: string
          total_hours: number
          year_month: string
        }[]
      }
      deploy_weekly_template: {
        Args: { p_cs_id: string; p_month: string; p_policy: string }
        Returns: number
      }
      deploy_weekly_template_bulk: {
        Args: { p_month: string; p_policy: string }
        Returns: Json
      }
      deploy_weekly_template_bulk_test: {
        Args: { p_month: string; p_policy: string }
        Returns: Json
      }
      deploy_weekly_template_fixed_nth_only: {
        Args: { p_month: string }
        Returns: Json
      }
      deploy_weekly_template_regular_only: {
        Args: { p_month: string }
        Returns: Json
      }
      exec_sql: { Args: { sql_text: string }; Returns: undefined }
      extract_doc_date_raw: { Args: { p_text: string }; Returns: string }
      extract_drive_file_id: { Args: { p_url: string }; Returns: string }
      extract_user_name_raw: { Args: { p_text: string }; Returns: string }
      generate_shifts_from_templates: {
        Args: { p_cs_id: string; p_end_date: string; p_start_date: string }
        Returns: {
          judo_ido: string
          kaipoke_cs_id: string
          required_staff_count: number
          service_code: string
          shift_end_time: string
          shift_start_date: string
          shift_start_time: string
          staff_01_user_id: string
          staff_02_attend_flg: boolean
          staff_02_user_id: string
          staff_03_attend_flg: boolean
          staff_03_user_id: string
          two_person_work_flg: boolean
        }[]
      }
      get_candidate_clients_multi: {
        Args: { p_office_ids: number[] }
        Returns: {
          client_kana: string
          client_name: string
          kaipoke_cs_id: string
          office_id: number
          office_name: string
        }[]
      }
      get_client_documents: {
        Args: { p_kaipoke_cs_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          assigned_at: string
          document_id: number
          document_type_id: number
          document_type_name: string
          fax_number: string
          fax_received_at: string
          fax_received_id: number
          office_id: number
          office_name: string
          other_client_names: string[]
          page_ids: number[]
          page_numbers: number[]
        }[]
      }
      get_clients_by_office: {
        Args: { p_office_number: string }
        Returns: {
          kaipoke_cs_id: string
          kana: string
          name: string
        }[]
      }
      get_fax_documents: {
        Args: { p_fax_received_id: number }
        Returns: {
          assigned_at: string
          assigned_by: string
          client_ids: string[]
          client_names: string[]
          document_id: number
          document_type_id: number
          document_type_name: string
          is_advertisement: boolean
          is_cover_sheet: boolean
          office_id: number
          office_name: string
          page_ids: number[]
          page_numbers: number[]
          requires_response: boolean
          response_deadline: string
          response_sent_at: string
        }[]
      }
      get_fax_offices: {
        Args: { p_fax_received_id: number }
        Returns: {
          assigned_at: string
          assigned_by: string
          fax: string
          fax_proxy: string
          id: number
          is_primary: boolean
          office_id: number
          office_name: string
          service_type: string
        }[]
      }
      get_fax_processing_status: {
        Args: { p_fax_received_id: number }
        Returns: {
          assigned_pages: number
          completion_rate: number
          total_documents: number
          total_pages: number
        }[]
      }
      get_foreign_keys: {
        Args: { target_schema: string; target_table: string }
        Returns: {
          column_name: string
          foreign_column: string
          foreign_schema: string
          foreign_table: string
        }[]
      }
      get_job_progress: {
        Args: { p_job_id: number }
        Returns: {
          completed: number
          failed: number
          pending: number
          progress_percent: number
          total: number
        }[]
      }
      get_lw_channel_id: { Args: { p_group_account: string }; Returns: string }
      get_next_job: {
        Args: { p_queue: string }
        Returns: {
          created_at: string
          id: number
          job_type: string
          payload: Json
          queue: string
          status: string
        }[]
      }
      get_primary_keys: {
        Args: { target_schema: string; target_table: string }
        Returns: {
          column_name: string
        }[]
      }
      get_schema_list: {
        Args: never
        Returns: {
          schema_name: string
        }[]
      }
      get_schema_tables: {
        Args: { target_schema: string }
        Returns: {
          column_count: number
          object_type: string
          table_comment: string
          table_name: string
          table_schema: string
        }[]
      }
      get_sender_pattern_suggestion: {
        Args: { p_fax_number: string; p_office_id: number }
        Returns: {
          avg_page_count: number
          page_order_confidence: number
          page_order_pattern: string
          rotation_patterns: Json
          sender_name: string
          total_fax_count: number
        }[]
      }
      get_table_columns: {
        Args: { target_schema: string; target_table: string }
        Returns: {
          character_maximum_length: number
          column_comment: string
          column_default: string
          column_name: string
          data_type: string
          is_nullable: string
          numeric_precision: number
          numeric_scale: number
          udt_name: string
        }[]
      }
      increment_office_pattern: {
        Args: {
          p_doc_type_id: number
          p_is_ad: boolean
          p_office_id: number
          p_page_position: string
        }
        Returns: undefined
      }
      lookup_office_by_fax: {
        Args: { p_fax_number: string }
        Returns: {
          fax: string
          fax_proxy: string
          id: number
          office_name: string
          service_type: string
        }[]
      }
      lookup_offices_by_fax: {
        Args: { p_fax_number: string }
        Returns: {
          fax: string
          fax_proxy: string
          id: number
          match_type: string
          office_name: string
          office_number: string
          service_type: string
        }[]
      }
      normalize_jp_text: { Args: { p_text: string }; Returns: string }
      normalize_shift_before_payroll: { Args: never; Returns: undefined }
      normalize_shift_before_payroll_summary: { Args: never; Returns: Json }
      pick_best_kaipoke_cs_id: {
        Args: { p_doc_date_raw?: string; p_name: string; p_text: string }
        Returns: string
      }
      preview_shift_weekly_template_month: {
        Args: {
          p_kaipoke_cs_id: string
          p_month: string
          p_use_recurrence?: boolean
        }
        Returns: {
          has_conflict: boolean
          judo_ido: string
          kaipoke_cs_id: string
          required_staff_count: number
          service_code: string
          shift_end_time: string
          shift_start_date: string
          shift_start_time: string
          staff_01_role_code: string
          staff_01_user_id: string
          staff_02_attend_flg: boolean
          staff_02_role_code: string
          staff_02_user_id: string
          staff_03_attend_flg: boolean
          staff_03_role_code: string
          staff_03_user_id: string
          two_person_work_flg: boolean
        }[]
      }
      prune_biweekly_nthweeks: {
        Args: { p_cs_id: string; p_month: string }
        Returns: number
      }
      read_secret: { Args: { secret_name: string }; Returns: string }
      rebuild_staff_monthly_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: number
      }
      refresh_disability_check_jisseki_staff: {
        Args: { _base_date?: string }
        Returns: undefined
      }
      roster_patch_shift_with_context: {
        Args: {
          p_actor_user_id?: string
          p_date: string
          p_end: string
          p_request_path?: string
          p_shift_id: number
          p_staff_id: string
          p_start: string
          p_target_col: string
          p_update_at: string
        }
        Returns: undefined
      }
      save_fax_document: {
        Args: {
          p_assigned_by?: string
          p_client_ids: string[]
          p_client_names: string[]
          p_document_type_id: number
          p_fax_received_id: number
          p_is_advertisement?: boolean
          p_is_cover_sheet?: boolean
          p_office_id: number
          p_page_ids: number[]
          p_requires_response?: boolean
          p_response_deadline?: string
          p_suggested_confidence?: number
          p_suggested_document_type_id?: number
        }
        Returns: Json
      }
      save_page_order_and_rotation: {
        Args: {
          p_assigned_by: string
          p_fax_received_id: number
          p_page_orders: Json
        }
        Returns: Json
      }
      search_clients: {
        Args: { p_limit?: number; p_office_ids?: number[]; p_query: string }
        Returns: {
          care_level: string
          client_kana: string
          client_name: string
          kaipoke_cs_id: string
          office_id: number
          office_name: string
        }[]
      }
      set_audit_context: {
        Args: { p_action?: string; p_trace_id?: string; p_user_id: string }
        Returns: undefined
      }
      shift_delete_with_context: {
        Args: {
          p_actor_user_id: string
          p_request_path: string
          p_shift_id: number
        }
        Returns: undefined
      }
      shift_direct_reassign:
        | {
            Args: {
              p_actor_auth_id?: string
              p_event_type?: string
              p_from_user_id: string
              p_penalty_level?: string
              p_reason?: string
              p_shift_id: number
              p_to_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_auth_id?: string
              p_from_user_id: string
              p_reason?: string
              p_shift_id: number
              p_to_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_actor_user_id?: string
              p_event_type?: string
              p_from_user_id: string
              p_penalty_level?: string
              p_reason?: string
              p_request_path?: string
              p_shift_id: number
              p_to_user_id: string
            }
            Returns: Json
          }
      shift_direct_reassign_uuid: {
        Args: {
          p_actor_auth_id?: string
          p_from_user_id: string
          p_reason?: string
          p_shift_id: string
          p_to_user_id: string
        }
        Returns: Json
      }
      shift_fix_for_mfcloud: { Args: never; Returns: Json }
      shift_insert_with_context: {
        Args: { p_actor_user_id: string; p_request_path: string; p_row: Json }
        Returns: number
      }
      shift_update_with_context: {
        Args: {
          p_actor_user_id: string
          p_patch: Json
          p_request_path: string
          p_shift_id: number
        }
        Returns: undefined
      }
      shifts_delete_with_context: {
        Args: {
          p_actor_user_id: string
          p_request_path: string
          p_shift_ids: number[]
        }
        Returns: undefined
      }
      shifts_update_with_context: {
        Args: {
          p_actor_user_id: string
          p_patch: Json
          p_request_path: string
          p_shift_id: number
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      snapshot_biz_stats_defect_sum: {
        Args: { p_year_month: string }
        Returns: number
      }
      snapshot_biz_stats_shift_sum: {
        Args: { p_year_month: string }
        Returns: number
      }
      staff_retirement_review_rows: {
        Args: never
        Returns: {
          hired_at: string
          last_shift_date: string
          lw_userid: string
          next_shift_date: string
          staff_name: string
          status: string
          user_id: string
        }[]
      }
      submit_entry_application: {
        Args: { p_payload: Json; p_submission_id: string }
        Returns: Json
      }
      sync_cs_docs_to_kaipoke_documents: { Args: never; Returns: number }
      "Update email to users": { Args: never; Returns: undefined }
      update_sender_pattern: {
        Args: {
          p_fax_number: string
          p_is_reversed: boolean
          p_office_id: number
          p_page_count: number
          p_rotation_data: Json
          p_sender_name: string
        }
        Returns: undefined
      }
      update_users_from_lw_temp: { Args: never; Returns: undefined }
      upsert_text_pattern: {
        Args: {
          p_client_name: string
          p_kaipoke_cs_id: string
          p_pattern_text: string
          p_pattern_type: string
        }
        Returns: undefined
      }
      wf_is_admin: { Args: never; Returns: boolean }
      wf_is_approver: { Args: never; Returns: boolean }
      wf_my_user_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
