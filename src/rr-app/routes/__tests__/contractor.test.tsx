import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ContractorOverviewData } from '@/lib/contractor-index';
import { ContractorRouteContent } from '../contractor';

const NOW = new Date('2026-07-04T09:00:00');

const ready: ContractorOverviewData = {
  profile: { id: 'u1', displayName: 'Dana Okafor', email: 'dana@x.com', avatarUrl: null, isAdmin: false, isContractor: true },
  deliverables: [
    { id: 'a', name: 'Main menu wireframes', department: 'UI/UX', status: 'In Progress', priority: 'High', deadline: '2026-07-10', progress: 45, description: null },
  ],
};

const renderContent = (data: React.ComponentProps<typeof ContractorRouteContent>['data']) =>
  render(<MemoryRouter><ContractorRouteContent data={data} now={NOW} /></MemoryRouter>);

describe('ContractorRouteContent', () => {
  it('gates non-contractors with a Paper access card', () => {
    renderContent({ status: 'forbidden' });
    expect(screen.getByRole('heading', { name: /contractor access required/i })).toBeInTheDocument();
  });

  it('greets the contractor and shows the next-due summary + a deliverable', () => {
    renderContent({ status: 'ready', index: ready });
    expect(screen.getByRole('heading', { name: /good morning, dana/i })).toBeInTheDocument();
    expect(screen.getByText(/1 deliverable · next due/i)).toBeInTheDocument();
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
  });

  it('shows the empty state when the contractor has no deliverables', () => {
    renderContent({ status: 'ready', index: { ...ready, deliverables: [] } });
    expect(screen.getByText(/no deliverables assigned yet/i)).toBeInTheDocument();
  });
});
