// Job Card Status Types
export type JobCardStatus = 
  | 'DRAFT' 
  | 'INWARDED' 
  | 'IN_PROGRESS' 
  | 'READY' 
  | 'DELIVERED' 
  | 'CLOSED' 
  | 'REOPENED'
  | 'COMPLETED';

export type UserRole = 'technician' | 'workshop_admin' | 'country_admin' | 'super_admin' | 'system_admin' | 'warranty_admin' | 'spares_manager';

export type SpareActionType = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'REQUEST_INFO' | 'TECH_RESPONSE' | 'RESUBMIT' | 'EDIT_RESET' | 'WITHDRAW' | 'USAGE_REQUEST' | 'USAGE_APPROVE' | 'USAGE_REJECT';

export type UsageApprovalState = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SpareAction {
  id: string;
  job_card_spare_id: string;
  job_card_id?: string | null;
  workshop_id?: string | null;
  action_type: SpareActionType;
  comment: string | null;
  actor_user_id: string;
  created_at: string;
  actor?: { full_name: string };
}

export interface WarrantyAdminAssignment {
  id: string;
  admin_user_id: string;
  country_ids: string[];
  workshop_ids: string[];
  active: boolean;
  created_at: string;
  created_by: string;
}

export type UserStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';

export type WorkshopType = 'COCO' | 'FOFO';

export type WorkshopGrade = 'A' | 'B' | 'C';

// Database entities
export interface Workshop {
  id: string;
  name: string;
  type: WorkshopType;
  grade: WorkshopGrade;
  city: string | null;
  province: string | null;
  country: string | null;
  map_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  workshop_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  status: UserStatus;
  country: string | null;
  created_at: string;
  updated_at: string;
  workshop?: Workshop;
}

export interface UserInvite {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  role: UserRole;
  workshop_id: string | null;
  invited_by: string;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED';
  country: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface Vehicle {
  id: string;
  reg_no: string;
  model: string | null;
  color: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  purchase_date: string | null;
  last_service_date: string | null;
  last_service_odo: number;
  created_at: string;
  updated_at: string;
}

export interface JobCard {
  id: string;
  jc_number: string;
  workshop_id: string;
  vehicle_id: string;
  created_by: string;
  assigned_to: string | null;
  odometer: number;
  odometer_photo_url: string | null;
  incoming_soc: number | null;
  soc_photo_url: string | null;
  soc_anomaly_flag: boolean | null;
  soc_override_reason: string | null;
  soc_override_comment: string | null;
  soc_detected_value: number | null;
  soc_detection_confidence: number | null;
  out_soc_value: number | null;
  out_soc_photo_url: string | null;
  out_soc_anomaly_flag: boolean | null;
  out_soc_override_reason: string | null;
  out_soc_override_comment: string | null;
  out_soc_detected_value: number | null;
  out_soc_detection_confidence: number | null;
  service_categories: string[];
  issue_categories: string[];
  status: JobCardStatus;
  completion_remarks: string | null;
  customer_comments: string | null;
  inwarding_otp_verified: boolean;
  delivery_otp_verified: boolean;
  created_at: string;
  updated_at: string;
  inwarded_at: string | null;
  work_started_at: string | null;
  work_completed_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  // Joined data
  vehicle?: Vehicle;
  creator?: UserProfile;
  assignee?: UserProfile;
  workshop?: Workshop;
}

export interface AuditTrailEntry {
  id: string;
  job_card_id: string;
  user_id: string;
  from_status: JobCardStatus | null;
  to_status: JobCardStatus;
  notes: string | null;
  offline_flag: boolean;
  created_at: string;
  user?: UserProfile;
}

export interface ServiceCategory {
  id: string;
  code: string;
  name: string;
  parent_code: string | null;
  is_active: boolean;
  sort_order: number;
  requires_spares: boolean;
  created_at: string;
}

export type ClaimType = 'USER_PAID' | 'WARRANTY' | 'GOODWILL';
export type SparePhotoKind = 'NEW_PART_PROOF' | 'OLD_PART_EVIDENCE' | 'ADDITIONAL';
export type ApprovalState = 'DRAFT' | 'SUBMITTED' | 'NEEDS_INFO' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED';

/** Computed UI state for warranty/goodwill lines */
export type WarrantyDisplayState = 'SUBMISSION_PENDING' | 'READY_TO_SUBMIT' | 'SUBMITTED' | 'NEEDS_INFO' | 'RESUBMITTED' | 'APPROVED' | 'REJECTED';

export interface SparePart {
  id: string;
  part_name: string;
  part_code: string | null;
  active: boolean;
  max_qty_allowed: number;
  partno_required: boolean;
  serial_required: boolean;
  usage_proof_photos_required_count: number;
  usage_proof_photo_prompts: string[];
  warranty_available: boolean;
  goodwill_available: boolean;
  warranty_approval_needed: boolean;
  goodwill_approval_needed: boolean;
  warranty_old_part_photos_required_count: number;
  warranty_old_part_photo_prompts: string[];
  goodwill_old_part_photos_required_count: number;
  goodwill_old_part_photo_prompts: string[];
  old_part_srno_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface SparePartApplicability {
  id: string;
  spare_part_id: string;
  vehicle_model_id: string;
  color_code: string | null;
  created_at: string;
}

export interface JobCardSpare {
  id: string;
  job_card_id: string;
  spare_part_id: string;
  qty: number;
  claim_type: ClaimType;
  part_number: string | null;
  serial_number: string | null;
  technician_comment: string | null;
  old_part_serial_number: string | null;
  claim_comment: string | null;
  approval_state: ApprovalState;
  submitted_at: string | null;
  last_submitted_at: string | null;
  decided_at: string | null;
  submitted_by: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Usage approval fields
  usage_approval_state: UsageApprovalState;
  usage_approved_by: string | null;
  usage_decided_at: string | null;
  usage_rejection_comment: string | null;
  usage_approved_qty: number | null;
  spare_part?: SparePart;
  photos?: JobCardSparePhoto[];
}

export interface JobCardSparePhoto {
  id: string;
  job_card_spare_id: string;
  photo_url: string;
  photo_kind: SparePhotoKind;
  description_prompt: string | null;
  is_required: boolean;
  slot_index: number | null;
  prompt: string | null;
  uploaded_by: string;
  uploaded_at: string;
}

/** Compute display state for a warranty/goodwill spare line */
export function getWarrantyDisplayState(spare: JobCardSpare): WarrantyDisplayState {
  if (spare.claim_type === 'USER_PAID') return 'SUBMISSION_PENDING'; // shouldn't be called
  if (spare.approval_state === 'SUBMITTED') return 'SUBMITTED';
  if (spare.approval_state === 'NEEDS_INFO') return 'NEEDS_INFO';
  if (spare.approval_state === 'RESUBMITTED') return 'RESUBMITTED';
  if (spare.approval_state === 'APPROVED') return 'APPROVED';
  if (spare.approval_state === 'REJECTED') return 'REJECTED';
  // DRAFT: check if old-part evidence is complete
  const part = spare.spare_part;
  if (!part) return 'SUBMISSION_PENDING';
  const isWarranty = spare.claim_type === 'WARRANTY';
  const reqCount = isWarranty ? part.warranty_old_part_photos_required_count : part.goodwill_old_part_photos_required_count;
  // Photos check (only if required)
  if (reqCount > 0) {
    const oldPhotos = (spare.photos || []).filter(p => p.photo_kind === 'OLD_PART_EVIDENCE').length;
    if (oldPhotos < reqCount) return 'SUBMISSION_PENDING';
  }
  // Old-part serial check (only if required and not yet filled)
  if (part.old_part_srno_required && !spare.old_part_serial_number) return 'SUBMISSION_PENDING';
  return 'READY_TO_SUBMIT';
}

export interface OtpCode {
  id: string;
  job_card_id: string;
  phone: string;
  code: string;
  purpose: 'inwarding' | 'delivery';
  attempts: number;
  verified: boolean;
  expires_at: string;
  created_at: string;
}

// Status display helpers
export const STATUS_CONFIG: Record<JobCardStatus, { label: string; color: string; className: string }> = {
  DRAFT: { label: 'Draft', color: 'status-draft', className: 'status-draft' },
  INWARDED: { label: 'Inwarded', color: 'status-inwarded', className: 'status-inwarded' },
  IN_PROGRESS: { label: 'In Progress', color: 'status-in-progress', className: 'status-in-progress' },
  READY: { label: 'Ready', color: 'status-ready', className: 'status-ready' },
  DELIVERED: { label: 'Delivered', color: 'status-delivered', className: 'status-delivered' },
  CLOSED: { label: 'Closed', color: 'status-closed', className: 'status-closed' },
  REOPENED: { label: 'Reopened', color: 'status-inwarded', className: 'status-inwarded' },
  COMPLETED: { label: 'Completed', color: 'status-closed', className: 'status-closed' },
};

// Status flow helpers
export const TERMINAL_STATUSES: JobCardStatus[] = ['COMPLETED', 'CLOSED'];

export const STATUS_TRANSITIONS: Record<JobCardStatus, JobCardStatus[]> = {
  DRAFT: ['INWARDED'],
  INWARDED: ['IN_PROGRESS'],
  IN_PROGRESS: ['READY'],
  READY: ['DELIVERED', 'REOPENED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CLOSED: [],
  REOPENED: ['IN_PROGRESS'],
};

export function canTransitionTo(currentStatus: JobCardStatus, targetStatus: JobCardStatus): boolean {
  return STATUS_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
}

export function isTerminalStatus(status: JobCardStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
