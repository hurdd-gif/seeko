import { describe, it, expect } from 'vitest';
import { filterTasks } from '../TaskList';
import { Task } from '@/lib/types';

const makeTasks = (): Task[] => [
  { id: '1', name: 'Implement login flow', department: 'Coding', status: 'In Progress', priority: 'High' },
  { id: '2', name: 'Design splash screen', department: 'Visual Art', status: 'Complete', priority: 'Medium' },
  { id: '3', name: 'Review animation assets', department: 'Animation', status: 'In Review', priority: 'Low' },
  { id: '4', name: 'Fix blocked pipeline', department: 'Coding', status: 'Blocked', priority: 'High', deadline: '2026-03-10' },
  { id: '5', name: 'Create login button asset', department: 'Asset Creation', status: 'In Progress', priority: 'Medium' },
];

describe('filterTasks', () => {
  it('returns all tasks when query is empty and status is All', () => {
    const tasks = makeTasks();
    expect(filterTasks(tasks, '', 'All')).toHaveLength(5);
  });

  it('filters by name query (case-insensitive)', () => {
    const tasks = makeTasks();
    const result = filterTasks(tasks, 'login', 'All');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['1', '5']);
  });

  it('filters by status', () => {
    const tasks = makeTasks();
    const result = filterTasks(tasks, '', 'In Progress');
    expect(result).toHaveLength(2);
    expect(result.every(t => t.status === 'In Progress')).toBe(true);
  });

  it('combines query and status filters', () => {
    const tasks = makeTasks();
    const result = filterTasks(tasks, 'login', 'In Progress');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['1', '5']);
  });

  it('narrows to single result with specific query + status', () => {
    const tasks = makeTasks();
    const result = filterTasks(tasks, 'pipeline', 'Blocked');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('returns empty array when no tasks match', () => {
    const tasks = makeTasks();
    expect(filterTasks(tasks, 'nonexistent', 'All')).toHaveLength(0);
  });

  it('handles empty task list', () => {
    expect(filterTasks([], 'query', 'Blocked')).toHaveLength(0);
  });

  it('matches partial name substring', () => {
    const tasks = makeTasks();
    const result = filterTasks(tasks, 'splash', 'All');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Design splash screen');
  });
});
