// Linear-style 7-status enum (migration 20260519000001).
// Legacy 'Complete' → 'Done'; legacy 'Blocked' → 'Backlog' (use 'Canceled' for permanent stops).
export type TaskStatus =
  | 'Backlog'
  | 'Todo'
  | 'In Progress'
  | 'In Review'
  | 'Done'
  | 'Canceled'
  | 'Duplicate';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'Backlog',
  'Todo',
  'In Progress',
  'In Review',
  'Done',
  'Canceled',
  'Duplicate',
] as const;

export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type Department =
  | 'Coding'
  | 'Visual Art'
  | 'UI/UX'
  | 'Animation'
  | 'Asset Creation';

export type Task = {
  id: string;
  task_number?: number;
  name: string;
  department: Department | string;
  status: TaskStatus;
  priority: Priority;
  area_id?: string;
  assignee_id?: string;
  deadline?: string;
  description?: string;
  bounty?: number;
  progress?: number;
  created_at?: string;
  updated_at?: string;
};

// Milestones (schema only this round — empty-state UI in Phase C).
export type MilestoneHealth = 'on_track' | 'at_risk' | 'off_track';

export type Milestone = {
  id: string;
  name: string;
  target_date?: string;
  area_id?: string;
  sort_order: number;
  health?: MilestoneHealth | null;
  created_at: string;
};

// Activity entries are rows of public.activity_log filtered by task_id.
// Typed events have `kind` set; legacy/free-text events have `kind` null and rely on `action`/`target`.
export type TaskActivityKind =
  | 'created'
  | 'status_changed'
  | 'assignee_changed'
  | 'milestone_linked'
  | 'milestone_unlinked'
  | 'progress_changed';

export type TaskActivity = {
  id: string;
  user_id?: string;
  action: string;
  target: string;
  task_id?: string;
  doc_id?: string;
  kind?: TaskActivityKind;
  before_value?: unknown;
  after_value?: unknown;
  /** Which actor wrote the row. 'human' (default, incl. DB-trigger rows) or
   *  'eko' — a write EKO's executors performed; the feed brands those as EKO. */
  source?: 'human' | 'eko';
  created_at: string;
  /** Actor profile join (`profiles(display_name, avatar_url)` in
   *  ACTIVITY_SELECT) — present on rows loaded for the Activity page. */
  profiles?: { display_name?: string | null; avatar_url?: string | null } | null;
};

export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
  sort_order?: number;
  target_date?: string;
};

export type Profile = {
  id: string;
  display_name?: string;
  department?: string;
  role?: string;
  avatar_url?: string;
  email?: string;
  onboarded: number;
  tour_completed: number;
  is_admin: boolean;
  is_contractor?: boolean;
  is_investor?: boolean;
  must_set_password?: boolean;
  last_seen_at?: string;
  timezone?: string;
  paypal_email?: string;
  // NDA agreement fields
  nda_accepted_at?: string;
  nda_signer_name?: string;
  nda_signer_address?: string;
};

export type Doc = {
  id: string;
  title: string;
  content?: string;
  parent_id?: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  restricted_department?: string[];
  granted_user_ids?: string[];
  type?: 'doc' | 'deck';
  deck_orientation?: 'horizontal' | 'vertical';
  slides?: { url: string; thumbnail_url?: string; sort_order: number }[];
};

export type TaskWithAssignee = Task & {
  assignee?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

export type TaskDeliverable = {
  id: string;
  task_id: string;
  file_name: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  download_url?: string;
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  reply_to_id?: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
  reactions?: TaskCommentReaction[];
  attachments?: TaskCommentAttachment[];
};

export type TaskCommentReaction = {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type TaskCommentAttachment = {
  id: string;
  comment_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  created_at: string;
};

export type TaskHandoff = {
  id: string;
  task_id: string;
  from_user_id: string;
  to_user_id: string;
  note?: string;
  created_at: string;
  from_profile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
  to_profile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
};

export type PaymentStatus = 'pending' | 'paid' | 'cancelled';

export type Payment = {
  id: string;
  recipient_id: string | null;
  amount: number;
  currency: string;
  description?: string;
  status: PaymentStatus;
  paid_at?: string;
  refund_amount?: number;
  refunded_at?: string;
  refund_note?: string;
  created_by: string;
  created_at: string;
  recipient_email?: string;
  /** Manual external payee (vendor/subscription) — set instead of recipient_id. */
  payee_name?: string | null;
  recipient?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'department' | 'paypal_email'>;
  items?: PaymentItem[];
};

export type PaymentItem = {
  id: string;
  payment_id: string;
  task_id?: string;
  label: string;
  amount: number;
};

export type NotificationKind =
  | 'task_assigned'
  | 'mentioned'
  | 'comment_reply'
  | 'task_completed'
  | 'deliverable_uploaded'
  | 'task_handoff'
  | 'payment_request'
  | 'payment_approved'
  | 'payment_denied'
  | 'deadline_extension_requested'
  | 'deadline_extension_approved'
  | 'deadline_extension_denied'
  | 'task_submitted_review'
  | 'task_review_approved'
  | 'task_review_denied'
  | 'user_joined';

export type UserEvent = {
  id: string;
  user_id: string;
  event_type: string;
  page?: string;
  target?: string;
  metadata?: Record<string, string>;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  created_at: string;
};

export type DeadlineExtension = {
  id: string;
  task_id: string;
  requested_by: string;
  original_deadline: string;
  requested_deadline: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'denied';
  decided_by?: string | null;
  decided_at?: string | null;
  denial_reason?: string | null;
  created_at: string;
};

/** The one pending extension surfaced on the admin task-detail screen. */
export type PendingExtension = {
  id: string;
  requesterName: string;
  originalDeadline: string;
  requestedDeadline: string;
  reason: string | null;
};

export type ExternalAgreementSection = {
  number: number;
  title: string;
  content: string; // HTML string
};

export type ExternalSigningInvite = {
  id: string;
  token: string;
  recipient_email: string;
  template_type: 'preset' | 'custom' | 'invoice' | 'doc_share';
  template_id?: string;
  custom_sections?: ExternalAgreementSection[];
  custom_title?: string;
  personal_note?: string;
  expires_at: string;
  verification_attempts: number;
  verified_at?: string;
  status: 'pending' | 'verified' | 'signed' | 'expired' | 'revoked';
  signer_name?: string;
  signer_address?: string;
  signer_ip?: string;
  signer_user_agent?: string;
  signed_at?: string;
  created_by: string;
  created_at: string;
  is_guardian_signing?: boolean;
  minor_name?: string;
  signing_provider?: 'internal' | 'docusign';
  docusign_envelope_id?: string;
  docusign_status?: string;
  docusign_completed_at?: string;
  docusign_last_event_at?: string;
};

export type NoteStatus = 'open' | 'archived';
export type NoteSource = 'web' | 'telegram';

export type Note = {
  id: string;
  body: string;
  status: NoteStatus;
  source: NoteSource;
  created_by: string;
  created_at: string;
  converted_to_task_id?: string;
};
