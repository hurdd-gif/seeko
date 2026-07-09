import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SetPasswordRoute } from '../set-password';

// The legacy `set-password/page.tsx` rendered the ORIGINAL <SetPasswordForm>
// (with its AnimatePresence button state + ArrowRight icon) inside a centered
// shell (logo → "Create your password" → subtitle). The faithful rr-app route
// must mount that same component verbatim — light-ported to the Paper system —
// NOT a hand-rewritten scaffold. The real form (unlike the prior scaffold)
// gives its confirm field the placeholder "Re-enter password" and the shell uses
// the apostrophe copy "You'll use this…", so asserting those proves the
// verbatim mount rather than a look-alike rewrite.
describe('SetPasswordRoute', () => {
  it('mounts the original SetPasswordForm inside the light auth shell', () => {
    render(
      <MemoryRouter>
        <SetPasswordRoute />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Create your password' })).toBeInTheDocument();
    expect(
      screen.getByText("You'll use this to sign in to SEEKO Studio.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Re-enter password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set password/i })).toBeInTheDocument();
  });
});
