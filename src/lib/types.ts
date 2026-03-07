export type TaskStatus = 'Complete' | 'In Progress' | 'In Review' | 'Blocked';
export type Priority = 'High' | 'Medium' | 'Low';
export type Department =
  | 'Coding'
  | 'Visual Art'
  | 'UI/UX'
  | 'Animation'
  | 'Asset Creation';

export type Task = {
  id: string;
  name: string;
  department: Department | string;
  status: TaskStatus;
  priority: Priority;
  area_id?: string;
  assignee_id?: string;
  deadline?: string;
  description?: string;
  bounty?: number;
  created_at?: string;
  updated_at?: string;
};

export type Area = {
  id: string;
  name: string;
  status: string;
  progress: number;
  description?: string;
  phase?: string;
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
  recipient_id: string;
  amount: number;
  currency: string;
  description?: string;
  status: PaymentStatus;
  paid_at?: string;
  created_by: string;
  created_at: string;
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
  | 'payment_denied';

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
