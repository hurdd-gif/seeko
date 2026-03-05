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
  must_set_password?: boolean;
  last_seen_at?: string;
  timezone?: string;
};

export type Doc = {
  id: string;
  title: string;
  content?: string;
  parent_id?: string;
  sort_order: number;
  updated_at?: string;
  restricted_department?: string;
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
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>;
};

export type NotificationKind =
  | 'task_assigned'
  | 'mentioned'
  | 'comment_reply'
  | 'task_completed'
  | 'deliverable_uploaded';

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
