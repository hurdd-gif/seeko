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
};

export type Doc = {
  id: string;
  title: string;
  content?: string;
  parent_id?: string;
  sort_order: number;
};
