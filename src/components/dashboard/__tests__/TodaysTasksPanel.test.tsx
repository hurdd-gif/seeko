import { render, screen } from '@testing-library/react';
import { TodaysTasksPanel } from '../TodaysTasksPanel';

const tasks = [
  { id: 't1', name: 'Wire passkey flow', priority: 'High', status: 'In Progress', department: 'Coding' },
] as any;

describe('TodaysTasksPanel', () => {
  it('renders eyebrow + task rows + cta', () => {
    render(<TodaysTasksPanel tasks={tasks} totalOpen={12} />);
    expect(screen.getByText("Today's tasks")).toBeInTheDocument();
    expect(screen.getByText('Wire passkey flow')).toBeInTheDocument();
    expect(screen.getByText(/View all tasks/)).toBeInTheDocument();
  });
});
