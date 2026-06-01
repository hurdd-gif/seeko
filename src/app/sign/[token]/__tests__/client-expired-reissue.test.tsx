import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SigningPageClient } from '../client';

describe('SigningPageClient — expired terminal', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('tells expired-link recipients to contact the sender instead of self-reissuing', () => {
    render(<SigningPageClient token="tok-xyz" initialData={{ status: 'expired' }} />);

    expect(screen.getByRole('heading', { name: /link expired/i })).toBeInTheDocument();
    expect(screen.getByText(/contact the sender/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new link/i })).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
