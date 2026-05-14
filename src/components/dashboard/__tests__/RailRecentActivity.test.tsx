import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RailRecentActivity } from '../RailRecentActivity';

const items = [
  { id: '1', name: 'karti', action: 'completed', target: 'Login bug', time: '2h ago', actionKey: 'completed', iconClassName: '', iconBg: 'bg-muted' },
  { id: '2', name: 'karti', action: 'assigned', target: 'Asset cleanup', time: '4h ago', actionKey: 'assigned', iconClassName: '', iconBg: 'bg-muted' },
];

describe('RailRecentActivity', () => {
  it('renders the activity items', () => {
    render(<RailRecentActivity items={items} showViewAll />);
    expect(screen.getByText(/Login bug/)).toBeInTheDocument();
    expect(screen.getByText(/Asset cleanup/)).toBeInTheDocument();
  });

  it('renders View all link when showViewAll is true', () => {
    render(<RailRecentActivity items={items} showViewAll />);
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/activity');
  });

  it('hides View all link when showViewAll is false', () => {
    render(<RailRecentActivity items={items} showViewAll={false} />);
    expect(screen.queryByRole('link', { name: /view all/i })).toBeNull();
  });

  it('renders empty state', () => {
    render(<RailRecentActivity items={[]} showViewAll />);
    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument();
  });
});
