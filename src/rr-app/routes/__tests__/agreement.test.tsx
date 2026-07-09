import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AgreementRouteContent } from '../agreement';

describe('AgreementRouteContent', () => {
  it('renders sign-in required state', () => {
    render(
      <MemoryRouter>
        <AgreementRouteContent data={{ status: 'unauthorized' }} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Sign in required' })).toBeInTheDocument();
    expect(screen.getByText('Use your SEEKO account to sign the onboarding agreement.')).toBeInTheDocument();
  });

  it('renders agreement sections and signature fields', () => {
    render(
      <MemoryRouter>
        <AgreementRouteContent
          data={{
            status: 'ready',
            index: {
              status: 'ready',
              userId: 'user-1',
              userEmail: 'member@example.invalid',
              title: 'SEEKO Agreement',
              sections: [{ number: 1, title: 'Terms', content: '<p>Agreement terms.</p>' }],
              department: 'Coding',
              role: 'Developer',
              isContractor: false,
              onboarded: 0,
            },
          }}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'SEEKO Agreement' })).toBeInTheDocument();
    expect(screen.getByText('Agreement terms.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full legal name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign agreement/i })).toBeInTheDocument();
  });
});
