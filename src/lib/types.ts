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
  area?: string;
  assignee?: string;
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

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  department: Department | string;
  email?: string;
  notionHandle?: string;
};

export type Profile = {
  id: string;
  notion_assignee_name: string;
  display_name?: string;
  department?: string;
  role?: string;
};

export type NotionBlock = {
  id: string;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
