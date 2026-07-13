import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotFoundContent } from '../not-found';

describe('NotFoundContent', () => {
  it('renders the 404 mark, headline, and the recovery link into the app', () => {
    render(
      <MemoryRouter initialEntries={['/isues']}>
        <NotFoundContent />
      </MemoryRouter>,
    );

    // The numerals are a mark, not prose — one "404" for AT, not three digits
    // spelled into the headline.
    expect(screen.getByRole('img', { name: '404' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /doesn’t exist/i })).toBeInTheDocument();

    // /issues is the app's real home; /tasks is only a redirect to it.
    expect(screen.getByRole('link', { name: /back to issues/i })).toHaveAttribute('href', '/issues');
  });

  it('echoes the path that was not found', () => {
    render(
      <MemoryRouter initialEntries={['/isues']}>
        <NotFoundContent />
      </MemoryRouter>,
    );

    expect(screen.getByText('/isues')).toBeInTheDocument();
  });

  it('carries the public chrome, so a signed-out visitor still has a way out', () => {
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <NotFoundContent />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /help & support/i }).getAttribute('href')).toMatch(
      /^mailto:/,
    );
  });
});
