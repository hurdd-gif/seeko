import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InviteTable } from '../InviteTable';

// Two representative rows through the real filters: one pending preset, one
// signed custom upload. Enough to prove the redesigned row anatomy (two-line
// recipient cell, dot+label status, humanized dates, no "Signing" type chip).
const ROWS = [
  {
    id: 'inv-1',
    token: 't1',
    recipient_email: 'vendor@example.com',
    status: 'pending',
    template_type: 'preset',
    template_id: 'external_nda',
    custom_title: null,
    personal_note: null,
    expires_at: '2026-06-26T00:00:00Z',
    signed_at: null,
    created_at: '2026-06-19T00:00:00Z',
    verification_attempts: 0,
    created_by: 'admin',
    signer_name: null,
    is_guardian_signing: true,
    signing_provider: 'native',
    docusign_envelope_id: null,
    docusign_status: null,
  },
  {
    id: 'inv-2',
    token: 't2',
    recipient_email: 'artist@example.com',
    status: 'signed',
    template_type: 'custom',
    template_id: null,
    custom_title: 'Commission Contract',
    personal_note: null,
    expires_at: '2026-05-25T00:00:00Z',
    signed_at: '2026-05-20T00:00:00Z',
    created_at: '2026-05-18T00:00:00Z',
    verification_attempts: 1,
    created_by: 'admin',
    signer_name: 'A. Artist',
    is_guardian_signing: false,
    signing_provider: 'native',
    docusign_envelope_id: null,
    docusign_status: null,
  },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: ROWS, error: null }),
      }),
    }),
    storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: null }) }) },
  }),
}));

describe('InviteTable (populated)', () => {
  it('renders the redesigned row anatomy', async () => {
    render(<InviteTable refreshKey={0} />);

    // Two-line primary cell: recipient + document name, no "Signing" type chip.
    expect(await screen.findByText('vendor@example.com')).toBeInTheDocument();
    expect(screen.getByText('External NDA')).toBeInTheDocument();
    expect(screen.getByText('Commission Contract')).toBeInTheDocument();
    expect(screen.queryByText('Signing')).not.toBeInTheDocument();

    // Dot + humanized custody-phase status labels (no tinted chip needed to test
    // styling here — the label presence proves the new StatusBadge path).
    expect(screen.getByText('Awaiting verification')).toBeInTheDocument();

    // Humanized dates replace toLocaleDateString()'s "6/19/2026" — computed
    // through the same formatter so the assertion is timezone-stable.
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    expect(screen.getByText(fmt('2026-06-19T00:00:00Z'))).toBeInTheDocument();
    expect(screen.getByText(fmt('2026-05-25T00:00:00Z'))).toBeInTheDocument();

    // Guardian flag survives inside the recipient cell.
    expect(screen.getByText('Guardian')).toBeInTheDocument();

    // Dropped columns are gone from the header.
    expect(screen.queryByRole('columnheader', { name: 'Type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Document' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Recipient' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
  });
});
