import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NotFoundContent } from '../not-found';

describe('NotFoundContent', () => {
  it('renders the 404 mark, headline, and both recovery links', () => {
    render(
      <MemoryRouter>
        <NotFoundContent />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: '404' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /wandered off the map/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to tasks/i })).toHaveAttribute(
      'href',
      '/tasks',
    );
    expect(screen.getByRole('link', { name: /open docs/i })).toHaveAttribute(
      'href',
      '/docs',
    );
  });
});
