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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_trail: {
        Row: {
          created_at: string
          from_status: Database["public"]["Enums"]["job_card_status"] | null
          id: string
          job_card_id: string
          notes: string | null
          offline_flag: boolean | null
          to_status: Database["public"]["Enums"]["job_card_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["job_card_status"] | null
          id?: string
          job_card_id: string
          notes?: string | null
          offline_flag?: boolean | null
          to_status: Database["public"]["Enums"]["job_card_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          from_status?: Database["public"]["Enums"]["job_card_status"] | null
          id?: string
          job_card_id?: string
          notes?: string | null
          offline_flag?: boolean | null
          to_status?: Database["public"]["Enums"]["job_card_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_trail_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_trail_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_run_items: {
        Row: {
          checklist_run_id: string
          created_at: string
          id: string
          is_mandatory_snapshot: boolean
          label_snapshot: string
          photo_url: string | null
          photo_urls: Json
          response_type_snapshot: Database["public"]["Enums"]["checklist_response_type"]
          template_item_id: string
          text_response: string | null
        }
        Insert: {
          checklist_run_id: string
          created_at?: string
          id?: string
          is_mandatory_snapshot: boolean
          label_snapshot: string
          photo_url?: string | null
          photo_urls?: Json
          response_type_snapshot: Database["public"]["Enums"]["checklist_response_type"]
          template_item_id: string
          text_response?: string | null
        }
        Update: {
          checklist_run_id?: string
          created_at?: string
          id?: string
          is_mandatory_snapshot?: boolean
          label_snapshot?: string
          photo_url?: string | null
          photo_urls?: Json
          response_type_snapshot?: Database["public"]["Enums"]["checklist_response_type"]
          template_item_id?: string
          text_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_run_items_checklist_run_id_fkey"
            columns: ["checklist_run_id"]
            isOneToOne: false
            referencedRelation: "checklist_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_run_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_runs: {
        Row: {
          completed_at: string
          completed_by: string
          created_at: string
          id: string
          job_card_id: string
          template_id: string
          template_name_snapshot: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          created_at?: string
          id?: string
          job_card_id: string
          template_id: string
          template_name_snapshot: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          created_at?: string
          id?: string
          job_card_id?: string
          template_id?: string
          template_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_runs_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: true
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_runs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_applicability: {
        Row: {
          created_at: string
          id: string
          template_id: string
          vehicle_model_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id: string
          vehicle_model_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string
          vehicle_model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_applicability_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_applicability_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_mandatory: boolean
          label: string
          photo_count: number
          photo_prompts: Json
          response_type: Database["public"]["Enums"]["checklist_response_type"]
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_mandatory?: boolean
          label: string
          photo_count?: number
          photo_prompts?: Json
          response_type?: Database["public"]["Enums"]["checklist_response_type"]
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_mandatory?: boolean
          label?: string
          photo_count?: number
          photo_prompts?: Json
          response_type?: Database["public"]["Enums"]["checklist_response_type"]
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          country_ids: string[]
          created_at: string
          id: string
          is_active: boolean
          is_global: boolean
          name: string
          updated_at: string
          workshop_ids: string[]
        }
        Insert: {
          country_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          name: string
          updated_at?: string
          workshop_ids?: string[]
        }
        Update: {
          country_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          name?: string
          updated_at?: string
          workshop_ids?: string[]
        }
        Relationships: []
      }
      countries_master: {
        Row: {
          calling_code: string
          created_at: string
          id: string
          is_active: boolean
          iso2: string
          name: string
          sms_enabled: boolean
          sms_sender_id: string | null
          sms_username: string | null
          sort_order: number
        }
        Insert: {
          calling_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          iso2: string
          name: string
          sms_enabled?: boolean
          sms_sender_id?: string | null
          sms_username?: string | null
          sort_order?: number
        }
        Update: {
          calling_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          iso2?: string
          name?: string
          sms_enabled?: boolean
          sms_sender_id?: string | null
          sms_username?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      country_settings: {
        Row: {
          country_name: string
          id: string
          setting_key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          country_name: string
          id?: string
          setting_key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          country_name?: string
          id?: string
          setting_key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      export_audit_log: {
        Row: {
          created_at: string
          export_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          export_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          export_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      feedback_form_questions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          max_label: string | null
          min_label: string | null
          question_text: string
          question_type: Database["public"]["Enums"]["feedback_question_type"]
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_label?: string | null
          min_label?: string | null
          question_text: string
          question_type: Database["public"]["Enums"]["feedback_question_type"]
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_label?: string | null
          min_label?: string | null
          question_text?: string
          question_type?: Database["public"]["Enums"]["feedback_question_type"]
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_form_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "feedback_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_form_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      feedback_requests: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          job_card_id: string
          status: Database["public"]["Enums"]["feedback_request_status"]
          submitted_at: string | null
          template_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          job_card_id: string
          status?: Database["public"]["Enums"]["feedback_request_status"]
          submitted_at?: string | null
          template_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          job_card_id?: string
          status?: Database["public"]["Enums"]["feedback_request_status"]
          submitted_at?: string | null
          template_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_requests_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: true
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_requests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "feedback_form_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          created_at: string
          feedback_request_id: string
          id: string
          job_card_id: string
          numeric_value: number
          question_id: string
        }
        Insert: {
          created_at?: string
          feedback_request_id: string
          id?: string
          job_card_id: string
          numeric_value: number
          question_id: string
        }
        Update: {
          created_at?: string
          feedback_request_id?: string
          id?: string
          job_card_id?: string
          numeric_value?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_feedback_request_id_fkey"
            columns: ["feedback_request_id"]
            isOneToOne: false
            referencedRelation: "feedback_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "feedback_form_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_spare_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["spare_action_type"]
          actor_user_id: string
          comment: string | null
          created_at: string
          id: string
          job_card_id: string | null
          job_card_spare_id: string
          workshop_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["spare_action_type"]
          actor_user_id: string
          comment?: string | null
          created_at?: string
          id?: string
          job_card_id?: string | null
          job_card_spare_id: string
          workshop_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["spare_action_type"]
          actor_user_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          job_card_id?: string | null
          job_card_spare_id?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_card_spare_actions_job_card_spare_id_fkey"
            columns: ["job_card_spare_id"]
            isOneToOne: false
            referencedRelation: "job_card_spares"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_spare_photos: {
        Row: {
          description_prompt: string | null
          id: string
          is_required: boolean
          job_card_spare_id: string
          photo_kind: Database["public"]["Enums"]["spare_photo_kind"]
          photo_url: string
          prompt: string | null
          slot_index: number | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          description_prompt?: string | null
          id?: string
          is_required?: boolean
          job_card_spare_id: string
          photo_kind: Database["public"]["Enums"]["spare_photo_kind"]
          photo_url: string
          prompt?: string | null
          slot_index?: number | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          description_prompt?: string | null
          id?: string
          is_required?: boolean
          job_card_spare_id?: string
          photo_kind?: Database["public"]["Enums"]["spare_photo_kind"]
          photo_url?: string
          prompt?: string | null
          slot_index?: number | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_card_spare_photos_job_card_spare_id_fkey"
            columns: ["job_card_spare_id"]
            isOneToOne: false
            referencedRelation: "job_card_spares"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_spares: {
        Row: {
          approval_state: Database["public"]["Enums"]["approval_state"]
          claim_comment: string | null
          claim_type: Database["public"]["Enums"]["claim_type"]
          created_at: string
          created_by: string
          decided_at: string | null
          id: string
          job_card_id: string
          last_submitted_at: string | null
          last_submitted_claim_type:
            | Database["public"]["Enums"]["claim_type"]
            | null
          last_submitted_qty: number | null
          last_submitted_spare_part_id: string | null
          old_part_serial_number: string | null
          part_number: string | null
          qty: number
          serial_number: string | null
          spare_part_id: string
          submitted_at: string | null
          submitted_by: string | null
          technician_comment: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_state?: Database["public"]["Enums"]["approval_state"]
          claim_comment?: string | null
          claim_type?: Database["public"]["Enums"]["claim_type"]
          created_at?: string
          created_by: string
          decided_at?: string | null
          id?: string
          job_card_id: string
          last_submitted_at?: string | null
          last_submitted_claim_type?:
            | Database["public"]["Enums"]["claim_type"]
            | null
          last_submitted_qty?: number | null
          last_submitted_spare_part_id?: string | null
          old_part_serial_number?: string | null
          part_number?: string | null
          qty?: number
          serial_number?: string | null
          spare_part_id: string
          submitted_at?: string | null
          submitted_by?: string | null
          technician_comment?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_state?: Database["public"]["Enums"]["approval_state"]
          claim_comment?: string | null
          claim_type?: Database["public"]["Enums"]["claim_type"]
          created_at?: string
          created_by?: string
          decided_at?: string | null
          id?: string
          job_card_id?: string
          last_submitted_at?: string | null
          last_submitted_claim_type?:
            | Database["public"]["Enums"]["claim_type"]
            | null
          last_submitted_qty?: number | null
          last_submitted_spare_part_id?: string | null
          old_part_serial_number?: string | null
          part_number?: string | null
          qty?: number
          serial_number?: string | null
          spare_part_id?: string
          submitted_at?: string | null
          submitted_by?: string | null
          technician_comment?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_card_spares_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_spares_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts_master"
            referencedColumns: ["id"]
          },
        ]
      }
      job_cards: {
        Row: {
          assigned_mechanic_name: string | null
          assigned_to: string | null
          checklist_status: string | null
          closed_at: string | null
          completion_remarks: string | null
          contact_for_updates: string
          created_at: string
          created_by: string
          customer_comments: string | null
          delivered_at: string | null
          delivery_otp_verified: boolean | null
          id: string
          incoming_soc: number | null
          inwarded_at: string | null
          inwarding_otp_verified: boolean | null
          issue_categories: string[]
          jc_number: string
          mechanic_notes: string | null
          odometer: number
          odometer_photo_url: string | null
          out_soc_anomaly_flag: boolean | null
          out_soc_detected_value: number | null
          out_soc_detection_confidence: number | null
          out_soc_override_comment: string | null
          out_soc_override_reason: string | null
          out_soc_photo_url: string | null
          out_soc_value: number | null
          rider_name: string | null
          rider_phone: string | null
          rider_phone_change_reason: string | null
          rider_phone_locked: boolean
          rider_reason: string | null
          rider_reason_notes: string | null
          service_categories: string[]
          soc_anomaly_flag: boolean | null
          soc_detected_value: number | null
          soc_detection_confidence: number | null
          soc_override_comment: string | null
          soc_override_reason: string | null
          soc_photo_url: string | null
          status: Database["public"]["Enums"]["job_card_status"]
          updated_at: string
          vehicle_id: string
          work_completed_at: string | null
          work_started_at: string | null
          workshop_id: string
        }
        Insert: {
          assigned_mechanic_name?: string | null
          assigned_to?: string | null
          checklist_status?: string | null
          closed_at?: string | null
          completion_remarks?: string | null
          contact_for_updates?: string
          created_at?: string
          created_by: string
          customer_comments?: string | null
          delivered_at?: string | null
          delivery_otp_verified?: boolean | null
          id?: string
          incoming_soc?: number | null
          inwarded_at?: string | null
          inwarding_otp_verified?: boolean | null
          issue_categories?: string[]
          jc_number: string
          mechanic_notes?: string | null
          odometer: number
          odometer_photo_url?: string | null
          out_soc_anomaly_flag?: boolean | null
          out_soc_detected_value?: number | null
          out_soc_detection_confidence?: number | null
          out_soc_override_comment?: string | null
          out_soc_override_reason?: string | null
          out_soc_photo_url?: string | null
          out_soc_value?: number | null
          rider_name?: string | null
          rider_phone?: string | null
          rider_phone_change_reason?: string | null
          rider_phone_locked?: boolean
          rider_reason?: string | null
          rider_reason_notes?: string | null
          service_categories?: string[]
          soc_anomaly_flag?: boolean | null
          soc_detected_value?: number | null
          soc_detection_confidence?: number | null
          soc_override_comment?: string | null
          soc_override_reason?: string | null
          soc_photo_url?: string | null
          status?: Database["public"]["Enums"]["job_card_status"]
          updated_at?: string
          vehicle_id: string
          work_completed_at?: string | null
          work_started_at?: string | null
          workshop_id: string
        }
        Update: {
          assigned_mechanic_name?: string | null
          assigned_to?: string | null
          checklist_status?: string | null
          closed_at?: string | null
          completion_remarks?: string | null
          contact_for_updates?: string
          created_at?: string
          created_by?: string
          customer_comments?: string | null
          delivered_at?: string | null
          delivery_otp_verified?: boolean | null
          id?: string
          incoming_soc?: number | null
          inwarded_at?: string | null
          inwarding_otp_verified?: boolean | null
          issue_categories?: string[]
          jc_number?: string
          mechanic_notes?: string | null
          odometer?: number
          odometer_photo_url?: string | null
          out_soc_anomaly_flag?: boolean | null
          out_soc_detected_value?: number | null
          out_soc_detection_confidence?: number | null
          out_soc_override_comment?: string | null
          out_soc_override_reason?: string | null
          out_soc_photo_url?: string | null
          out_soc_value?: number | null
          rider_name?: string | null
          rider_phone?: string | null
          rider_phone_change_reason?: string | null
          rider_phone_locked?: boolean
          rider_reason?: string | null
          rider_reason_notes?: string | null
          service_categories?: string[]
          soc_anomaly_flag?: boolean | null
          soc_detected_value?: number | null
          soc_detection_confidence?: number | null
          soc_override_comment?: string | null
          soc_override_reason?: string | null
          soc_photo_url?: string | null
          status?: Database["public"]["Enums"]["job_card_status"]
          updated_at?: string
          vehicle_id?: string
          work_completed_at?: string | null
          work_started_at?: string | null
          workshop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_cards_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_cards_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number | null
          code: string
          code_hash: string | null
          created_at: string
          expires_at: string
          id: string
          job_card_id: string
          phone: string
          purpose: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          code: string
          code_hash?: string | null
          created_at?: string
          expires_at: string
          id?: string
          job_card_id: string
          phone: string
          purpose: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          code?: string
          code_hash?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          job_card_id?: string
          phone?: string
          purpose?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_codes_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      plate_scan_audit_log: {
        Row: {
          country: string | null
          created_at: string
          id: string
          reason: string | null
          result: string
          user_id: string
          workshop_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          result: string
          user_id: string
          workshop_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          result?: string
          user_id?: string
          workshop_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          user_id: string
          workshop_id: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id: string
          workshop_id?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          user_id?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          changed_field: string | null
          created_at: string
          details: Json | null
          id: string
          new_value: string | null
          old_value: string | null
          target_role: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          changed_field?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          changed_field?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_role?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      rbac_permissions: {
        Row: {
          created_at: string
          display_label: string
          enabled: boolean
          id: string
          permission_group: Database["public"]["Enums"]["rbac_permission_group"]
          permission_key: string
          role_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_label: string
          enabled?: boolean
          id?: string
          permission_group: Database["public"]["Enums"]["rbac_permission_group"]
          permission_key: string
          role_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_label?: string
          enabled?: boolean
          id?: string
          permission_group?: Database["public"]["Enums"]["rbac_permission_group"]
          permission_key?: string
          role_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_policy_overrides: {
        Row: {
          country: string | null
          created_at: string
          enabled: boolean
          id: string
          permission_key: string
          policy_type: Database["public"]["Enums"]["rbac_policy_type"]
          role_id: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          enabled: boolean
          id?: string
          permission_key: string
          policy_type: Database["public"]["Enums"]["rbac_policy_type"]
          role_id: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key?: string
          policy_type?: Database["public"]["Enums"]["rbac_policy_type"]
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_policy_overrides_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      rbac_roles: {
        Row: {
          created_at: string
          default_scope: Database["public"]["Enums"]["rbac_scope_type"]
          description: string | null
          display_name: string
          id: string
          is_system_managed: boolean
          role_key: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_scope?: Database["public"]["Enums"]["rbac_scope_type"]
          description?: string | null
          display_name: string
          id?: string
          is_system_managed?: boolean
          role_key: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_scope?: Database["public"]["Enums"]["rbac_scope_type"]
          description?: string | null
          display_name?: string
          id?: string
          is_system_managed?: boolean
          role_key?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      report_daily_snapshot: {
        Row: {
          active_floor: number
          avg_feedback_score: number
          avg_mttr_minutes: number
          avg_turnaround_minutes: number
          closed_count: number
          country: string
          created_at: string
          delivered_count: number
          draft_count: number
          draft_to_inwarded_avg: number
          feedback_count: number
          id: string
          in_progress_count: number
          inwarded_count: number
          inwarded_to_progress_avg: number
          pending_delivery: number
          progress_to_ready_avg: number
          ready_count: number
          ready_to_delivered_avg: number
          reopen_percent: number
          reopened_count: number
          service_type: string
          snapshot_date: string
          total_created: number
          total_delivered: number
          workshop_id: string
          workshop_type: string
        }
        Insert: {
          active_floor?: number
          avg_feedback_score?: number
          avg_mttr_minutes?: number
          avg_turnaround_minutes?: number
          closed_count?: number
          country: string
          created_at?: string
          delivered_count?: number
          draft_count?: number
          draft_to_inwarded_avg?: number
          feedback_count?: number
          id?: string
          in_progress_count?: number
          inwarded_count?: number
          inwarded_to_progress_avg?: number
          pending_delivery?: number
          progress_to_ready_avg?: number
          ready_count?: number
          ready_to_delivered_avg?: number
          reopen_percent?: number
          reopened_count?: number
          service_type?: string
          snapshot_date: string
          total_created?: number
          total_delivered?: number
          workshop_id: string
          workshop_type?: string
        }
        Update: {
          active_floor?: number
          avg_feedback_score?: number
          avg_mttr_minutes?: number
          avg_turnaround_minutes?: number
          closed_count?: number
          country?: string
          created_at?: string
          delivered_count?: number
          draft_count?: number
          draft_to_inwarded_avg?: number
          feedback_count?: number
          id?: string
          in_progress_count?: number
          inwarded_count?: number
          inwarded_to_progress_avg?: number
          pending_delivery?: number
          progress_to_ready_avg?: number
          ready_count?: number
          ready_to_delivered_avg?: number
          reopen_percent?: number
          reopened_count?: number
          service_type?: string
          snapshot_date?: string
          total_created?: number
          total_delivered?: number
          workshop_id?: string
          workshop_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_daily_snapshot_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      report_refresh_log: {
        Row: {
          id: string
          row_count: number
          triggered_at: string
          triggered_by: string | null
        }
        Insert: {
          id?: string
          row_count?: number
          triggered_at?: string
          triggered_by?: string | null
        }
        Update: {
          id?: string
          row_count?: number
          triggered_at?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      rider_contact_audit: {
        Row: {
          action: string
          actor_user_id: string
          contact_for_updates: string | null
          created_at: string
          id: string
          job_card_id: string
          phone_last4: string | null
          rider_phone_change_reason: string | null
          rider_reason: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          contact_for_updates?: string | null
          created_at?: string
          id?: string
          job_card_id: string
          phone_last4?: string | null
          rider_phone_change_reason?: string | null
          rider_reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          contact_for_updates?: string | null
          created_at?: string
          id?: string
          job_card_id?: string
          phone_last4?: string | null
          rider_phone_change_reason?: string | null
          rider_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_contact_audit_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_code: string | null
          requires_spares: boolean
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_code?: string | null
          requires_spares?: boolean
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_code?: string | null
          requires_spares?: boolean
          sort_order?: number | null
        }
        Relationships: []
      }
      sheet_export_log: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          rows_feedback: number | null
          rows_issue: number | null
          rows_ops: number | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_feedback?: number | null
          rows_issue?: number | null
          rows_ops?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          rows_feedback?: number | null
          rows_issue?: number | null
          rows_ops?: number | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      short_links: {
        Row: {
          created_at: string
          feedback_request_id: string
          id: string
          short_code: string
        }
        Insert: {
          created_at?: string
          feedback_request_id: string
          id?: string
          short_code: string
        }
        Update: {
          created_at?: string
          feedback_request_id?: string
          id?: string
          short_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_links_feedback_request_id_fkey"
            columns: ["feedback_request_id"]
            isOneToOne: false
            referencedRelation: "feedback_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_audit_log: {
        Row: {
          api_key_alias: string | null
          at_response_body: Json | null
          country: string | null
          created_at: string
          http_status_code: number | null
          id: string
          job_card_id: string | null
          phone_number: string
          rendered_message: string
          success: boolean
          trigger_status: string
          username_used: string
          workshop_id: string | null
        }
        Insert: {
          api_key_alias?: string | null
          at_response_body?: Json | null
          country?: string | null
          created_at?: string
          http_status_code?: number | null
          id?: string
          job_card_id?: string | null
          phone_number: string
          rendered_message: string
          success?: boolean
          trigger_status: string
          username_used: string
          workshop_id?: string | null
        }
        Update: {
          api_key_alias?: string | null
          at_response_body?: Json | null
          country?: string | null
          created_at?: string
          http_status_code?: number | null
          id?: string
          job_card_id?: string | null
          phone_number?: string
          rendered_message?: string
          success?: boolean
          trigger_status?: string
          username_used?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_audit_log_job_card_id_fkey"
            columns: ["job_card_id"]
            isOneToOne: false
            referencedRelation: "job_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_audit_log_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      spare_parts_applicability: {
        Row: {
          color_code: string | null
          created_at: string
          id: string
          spare_part_id: string
          vehicle_model_id: string
        }
        Insert: {
          color_code?: string | null
          created_at?: string
          id?: string
          spare_part_id: string
          vehicle_model_id: string
        }
        Update: {
          color_code?: string | null
          created_at?: string
          id?: string
          spare_part_id?: string
          vehicle_model_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_applicability_spare_part_id_fkey"
            columns: ["spare_part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spare_parts_applicability_vehicle_model_id_fkey"
            columns: ["vehicle_model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
        ]
      }
      spare_parts_master: {
        Row: {
          active: boolean
          created_at: string
          goodwill_approval_needed: boolean
          goodwill_available: boolean
          goodwill_old_part_photo_prompts: Json
          goodwill_old_part_photos_required_count: number
          id: string
          max_qty_allowed: number
          old_part_srno_required: boolean
          part_code: string | null
          part_name: string
          partno_required: boolean
          serial_required: boolean
          updated_at: string
          usage_proof_photo_prompts: Json
          usage_proof_photos_required_count: number
          warranty_approval_needed: boolean
          warranty_available: boolean
          warranty_old_part_photo_prompts: Json
          warranty_old_part_photos_required_count: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          goodwill_approval_needed?: boolean
          goodwill_available?: boolean
          goodwill_old_part_photo_prompts?: Json
          goodwill_old_part_photos_required_count?: number
          id?: string
          max_qty_allowed?: number
          old_part_srno_required?: boolean
          part_code?: string | null
          part_name: string
          partno_required?: boolean
          serial_required?: boolean
          updated_at?: string
          usage_proof_photo_prompts?: Json
          usage_proof_photos_required_count?: number
          warranty_approval_needed?: boolean
          warranty_available?: boolean
          warranty_old_part_photo_prompts?: Json
          warranty_old_part_photos_required_count?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          goodwill_approval_needed?: boolean
          goodwill_available?: boolean
          goodwill_old_part_photo_prompts?: Json
          goodwill_old_part_photos_required_count?: number
          id?: string
          max_qty_allowed?: number
          old_part_srno_required?: boolean
          part_code?: string | null
          part_name?: string
          partno_required?: boolean
          serial_required?: boolean
          updated_at?: string
          usage_proof_photo_prompts?: Json
          usage_proof_photos_required_count?: number
          warranty_approval_needed?: boolean
          warranty_available?: boolean
          warranty_old_part_photo_prompts?: Json
          warranty_old_part_photos_required_count?: number
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      system_settings_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_value: string
          old_value: string | null
          setting_key: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value: string
          old_value?: string | null
          setting_key: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_value?: string
          old_value?: string | null
          setting_key?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          accepted_at: string | null
          assignment_country_ids: string[] | null
          assignment_workshop_ids: string[] | null
          country: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          invited_by: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: string
          workshop_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          assignment_country_ids?: string[] | null
          assignment_workshop_ids?: string[] | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          invited_by: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          workshop_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          assignment_country_ids?: string[] | null
          assignment_workshop_ids?: string[] | null
          country?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          invited_by?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: string
          workshop_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invites_workshop_id_fkey"
            columns: ["workshop_id"]
            isOneToOne: false
            referencedRelation: "workshops"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_models: {
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
      vehicles: {
        Row: {
          color: string | null
          color_code: string | null
          created_at: string
          id: string
          last_service_date: string | null
          last_service_odo: number | null
          model: string | null
          owner_name: string | null
          owner_phone: string | null
          purchase_date: string | null
          reg_no: string
          reg_no_canonical: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          color_code?: string | null
          created_at?: string
          id?: string
          last_service_date?: string | null
          last_service_odo?: number | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          purchase_date?: string | null
          reg_no: string
          reg_no_canonical?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          color_code?: string | null
          created_at?: string
          id?: string
          last_service_date?: string | null
          last_service_odo?: number | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          purchase_date?: string | null
          reg_no?: string
          reg_no_canonical?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      vehicles_import_staging: {
        Row: {
          color: string | null
          last_service_date: string | null
          last_service_odo: number | null
          model: string | null
          owner_name: string | null
          owner_phone: string | null
          purchase_date: string | null
          reg_no: string | null
        }
        Insert: {
          color?: string | null
          last_service_date?: string | null
          last_service_odo?: number | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          purchase_date?: string | null
          reg_no?: string | null
        }
        Update: {
          color?: string | null
          last_service_date?: string | null
          last_service_odo?: number | null
          model?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          purchase_date?: string | null
          reg_no?: string | null
        }
        Relationships: []
      }
      warranty_admin_assignments: {
        Row: {
          active: boolean
          admin_user_id: string
          country_ids: string[]
          created_at: string
          created_by: string
          id: string
          workshop_ids: string[]
        }
        Insert: {
          active?: boolean
          admin_user_id: string
          country_ids?: string[]
          created_at?: string
          created_by: string
          id?: string
          workshop_ids?: string[]
        }
        Update: {
          active?: boolean
          admin_user_id?: string
          country_ids?: string[]
          created_at?: string
          created_by?: string
          id?: string
          workshop_ids?: string[]
        }
        Relationships: []
      }
      workshops: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          grade: Database["public"]["Enums"]["workshop_grade"]
          id: string
          map_link: string | null
          name: string
          province: string | null
          type: Database["public"]["Enums"]["workshop_type"]
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          grade?: Database["public"]["Enums"]["workshop_grade"]
          id?: string
          map_link?: string | null
          name: string
          province?: string | null
          type?: Database["public"]["Enums"]["workshop_type"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          grade?: Database["public"]["Enums"]["workshop_grade"]
          id?: string
          map_link?: string | null
          name?: string
          province?: string | null
          type?: Database["public"]["Enums"]["workshop_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_feedback_responses_report: {
        Row: {
          delivery_date: string | null
          jc_number: string | null
          numeric_value: number | null
          question_text: string | null
          response_created_at: string | null
          technician_name: string | null
          workshop_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_workshop: { Args: { p_workshop_id: string }; Returns: boolean }
      export_job_cards_csv: {
        Args: {
          p_country?: string
          p_date_from: string
          p_date_to: string
          p_workshop_id?: string
        }
        Returns: {
          delivered_ts: string
          inward_ts: string
          jc_number: string
          jc_status: string
          odometer: number
          service_issues: string
          technician_name: string
          vehicle_number: string
          work_end_ts: string
          work_start_ts: string
          workshop_name: string
        }[]
      }
      generate_jc_number: { Args: never; Returns: string }
      generate_report_snapshots: {
        Args: { p_target_date: string }
        Returns: Json
      }
      get_aging_data: {
        Args: { p_country?: string; p_workshop_id?: string }
        Returns: {
          assigned_to_name: string
          created_at: string
          current_status: string
          jc_number: string
          job_card_id: string
          last_status_change_at: string
          reg_no: string
          workshop_name: string
        }[]
      }
      get_user_country: { Args: never; Returns: string }
      get_user_profile: {
        Args: never
        Returns: {
          profile_id: string
          role: Database["public"]["Enums"]["user_role"]
          workshop_id: string
        }[]
      }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_workshop_id: { Args: never; Returns: string }
      get_wip_snapshot: {
        Args: {
          p_country?: string
          p_end_date: string
          p_start_date: string
          p_workshop_id?: string
        }
        Returns: {
          jc_count: number
          snapshot_date: string
          status: string
        }[]
      }
      is_country_admin_for: { Args: { p_country: string }; Returns: boolean }
      is_system_admin: { Args: never; Returns: boolean }
      is_user_in_workshop: { Args: { p_workshop_id: string }; Returns: boolean }
      reassign_user_job_cards: {
        Args: {
          p_from_user_id: string
          p_to_user_id: string
          p_workshop_id: string
        }
        Returns: number
      }
      transition_job_card_status: {
        Args: {
          p_additional_data?: Json
          p_job_card_id: string
          p_new_status: Database["public"]["Enums"]["job_card_status"]
          p_notes?: string
        }
        Returns: Json
      }
    }
    Enums: {
      approval_state:
        | "DRAFT"
        | "SUBMITTED"
        | "NEEDS_INFO"
        | "RESUBMITTED"
        | "APPROVED"
        | "REJECTED"
      checklist_response_type: "none" | "text" | "photo" | "text_photo"
      claim_type: "USER_PAID" | "WARRANTY" | "GOODWILL"
      feedback_question_type: "SCALE_1_5" | "NPS_0_10" | "TEXT"
      feedback_request_status: "PENDING" | "SUBMITTED" | "EXPIRED"
      job_card_status:
        | "DRAFT"
        | "INWARDED"
        | "IN_PROGRESS"
        | "READY"
        | "DELIVERED"
        | "CLOSED"
        | "REOPENED"
        | "COMPLETED"
      rbac_permission_group:
        | "NAVIGATION"
        | "JOB_CARDS"
        | "SPARES_MANAGEMENT"
        | "WARRANTY"
        | "REPORTS"
        | "USERS_TEAM"
        | "MASTERS_CONFIG"
        | "PROFILE_SELF"
      rbac_policy_type: "DEFAULT" | "COCO" | "FOFO"
      rbac_scope_type: "global" | "country" | "workshop" | "assignment"
      spare_action_type:
        | "SUBMIT"
        | "APPROVE"
        | "REJECT"
        | "REQUEST_INFO"
        | "TECH_RESPONSE"
        | "RESUBMIT"
        | "EDIT_RESET"
        | "WITHDRAW"
      spare_photo_kind: "NEW_PART_PROOF" | "OLD_PART_EVIDENCE" | "ADDITIONAL"
      user_role:
        | "technician"
        | "workshop_admin"
        | "super_admin"
        | "country_admin"
        | "system_admin"
        | "warranty_admin"
        | "spares_manager"
      user_status: "INVITED" | "ACTIVE" | "REMOVED"
      workshop_grade: "A" | "B" | "C"
      workshop_type: "COCO" | "FOFO"
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
      approval_state: [
        "DRAFT",
        "SUBMITTED",
        "NEEDS_INFO",
        "RESUBMITTED",
        "APPROVED",
        "REJECTED",
      ],
      checklist_response_type: ["none", "text", "photo", "text_photo"],
      claim_type: ["USER_PAID", "WARRANTY", "GOODWILL"],
      feedback_question_type: ["SCALE_1_5", "NPS_0_10", "TEXT"],
      feedback_request_status: ["PENDING", "SUBMITTED", "EXPIRED"],
      job_card_status: [
        "DRAFT",
        "INWARDED",
        "IN_PROGRESS",
        "READY",
        "DELIVERED",
        "CLOSED",
        "REOPENED",
        "COMPLETED",
      ],
      rbac_permission_group: [
        "NAVIGATION",
        "JOB_CARDS",
        "SPARES_MANAGEMENT",
        "WARRANTY",
        "REPORTS",
        "USERS_TEAM",
        "MASTERS_CONFIG",
        "PROFILE_SELF",
      ],
      rbac_policy_type: ["DEFAULT", "COCO", "FOFO"],
      rbac_scope_type: ["global", "country", "workshop", "assignment"],
      spare_action_type: [
        "SUBMIT",
        "APPROVE",
        "REJECT",
        "REQUEST_INFO",
        "TECH_RESPONSE",
        "RESUBMIT",
        "EDIT_RESET",
        "WITHDRAW",
      ],
      spare_photo_kind: ["NEW_PART_PROOF", "OLD_PART_EVIDENCE", "ADDITIONAL"],
      user_role: [
        "technician",
        "workshop_admin",
        "super_admin",
        "country_admin",
        "system_admin",
        "warranty_admin",
        "spares_manager",
      ],
      user_status: ["INVITED", "ACTIVE", "REMOVED"],
      workshop_grade: ["A", "B", "C"],
      workshop_type: ["COCO", "FOFO"],
    },
  },
} as const
