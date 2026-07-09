import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvestorWhatItCost } from '../InvestorWhatItCost';

const recent = [
  { id: 'p1', description: 'Concept art', amount: 500, status: 'paid' as const, created_at: '2026-05-10', recipient: { id: 'u1', display_name: 'Alice' } },
  { id: 'p2', description: 'Animation', amount: 1200, status: 'pending' as const, created_at: '2026-05-09', recipient: { id: 'u2', display_name: 'Bob' } },
];

describe('InvestorWhatItCost', () => {
  it('renders the "Recent payments" section label', () => {
    render(<InvestorWhatItCost paidTotal={1700} thisMonth={500} recent={recent} />);
    expect(screen.getByText(/recent payments/i)).toBeInTheDocument();
  });

  it('renders recent payments with recipient name', () => {
    render(<InvestorWhatItCost paidTotal={1700} thisMonth={500} recent={recent} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('uses a neutral status color for pending dots', () => {
    render(<InvestorWhatItCost paidTotal={1700} thisMonth={500} recent={recent} />);
    const pendingDot = screen.getByTestId('status-dot-p2');
    expect(pendingDot.className).toMatch(/bg-\[var\(--ov-muted\)\]/);
    expect(pendingDot.className).not.toMatch(/bg-\[--color-seeko-accent\]/);
  });

  it('shows empty state when no recent payments', () => {
    render(<InvestorWhatItCost paidTotal={0} thisMonth={0} recent={[]} />);
    expect(screen.getByText(/no recent payments/i)).toBeInTheDocument();
  });

  it('renders spend totals on the investor dashboard card', () => {
    render(<InvestorWhatItCost paidTotal={1700} thisMonth={500} recent={recent} />);
    expect(screen.getByText(/paid total/i)).toBeInTheDocument();
    expect(screen.getByText(/this month/i)).toBeInTheDocument();
    expect(screen.getByText('$1,700')).toBeInTheDocument();
    expect(screen.getAllByText('$500').length).toBeGreaterThan(0);
  });

  it('hides the recipient column entirely when no row has a recipient', () => {
    const recipientless = [
      { id: 'p1', description: 'Tooling', amount: 300, status: 'paid' as const, created_at: '2026-05-10', recipient: { id: 'u1' } },
      { id: 'p2', description: 'Hosting', amount: 75, status: 'pending' as const, created_at: '2026-05-09', recipient: { id: 'u2' } },
    ];
    render(<InvestorWhatItCost paidTotal={375} thisMonth={75} recent={recipientless} />);
    // No em-dash placeholder anywhere — the empty column should be gone, not
    // filled with "—" per row.
    expect(screen.queryByText('—')).toBeNull();
  });

  it('renders blank (not em-dash) for missing recipients when some rows have names', () => {
    const mixed = [
      { id: 'p1', description: 'Concept art', amount: 500, status: 'paid' as const, created_at: '2026-05-10', recipient: { id: 'u1', display_name: 'Alice' } },
      { id: 'p2', description: 'Unnamed', amount: 75, status: 'pending' as const, created_at: '2026-05-09', recipient: { id: 'u2' } },
    ];
    render(<InvestorWhatItCost paidTotal={575} thisMonth={75} recent={mixed} />);
    // Alice column appears; the missing one shows blank, never "—".
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('—')).toBeNull();
  });
});
