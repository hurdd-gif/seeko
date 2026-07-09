import { render, screen } from '@testing-library/react';
import { TodaysTasksPanel } from '../TodaysTasksPanel';

const tasks = [
  { id: 't1', name: 'Wire passkey flow', priority: 'High', status: 'In Progress', department: 'Coding' },
] as any;

describe('TodaysTasksPanel', () => {
  it('renders the stat, task rows, and the CTA', () => {
    render(<TodaysTasksPanel tasks={tasks} totalOpen={12} />);
    expect(screen.getByText('1 due soon')).toBeInTheDocument();
    expect(screen.getByText('12 across studio')).toBeInTheDocument();
    expect(screen.getByText('Wire passkey flow')).toBeInTheDocument();
    expect(screen.getByText(/View Tasks/)).toBeInTheDocument();
  });

  it('no longer renders the in-card "Tasks" eyebrow — it was pulled out to a page-level section heading', () => {
    render(<TodaysTasksPanel tasks={tasks} totalOpen={12} />);
    // "View Tasks →" is a different node; an exact "Tasks" label would be the
    // removed in-card eyebrow.
    expect(screen.queryByText('Tasks')).toBeNull();
  });

  it('does not repeat the per-row status — it is uniform noise on a due-soon list', () => {
    const many = [
      { id: 't1', name: 'Wire passkey flow', priority: 'High', status: 'In Progress', department: 'Coding' },
      { id: 't2', name: 'Polish phase rail', priority: 'Medium', status: 'In Progress', department: 'Coding' },
      { id: 't3', name: 'Ship gate dates', priority: 'Low', status: 'In Progress', department: 'Coding' },
    ] as any;
    render(<TodaysTasksPanel tasks={many} totalOpen={12} />);
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
  });
});
