import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundContent } from '../not-found';

describe('NotFoundContent', () => {
  // The entrance is gated on sessionStorage and tests share a realm — without
  // this, the first test to render would flag the key and every later one would
  // silently be exercising the already-seen path.
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the 404 mark, headline, and the recovery link into the app', () => {
    render(
      <MemoryRouter initialEntries={['/isues']}>
        <NotFoundContent />
      </MemoryRouter>,
    );

    // The numerals are a mark, not prose — one "404" for AT, not three digits
    // spelled into the headline.
    expect(screen.getByRole('img', { name: '404' })).toBeInTheDocument();

    // The headline is the ONLY line of copy: the old "This page doesn't exist"
    // h1 was cut because it just spelled the mark out in words directly beneath
    // a mark six inches tall, and the subhead was promoted in its place.
    expect(screen.getByRole('heading', { name: /haven’t built this one yet/i })).toBeInTheDocument();

    // /issues is the app's real home; /tasks is only a redirect to it.
    expect(screen.getByRole('link', { name: /back to issues/i })).toHaveAttribute('href', '/issues');
  });

  it('echoes the path that was not found, and offers to copy it', () => {
    render(
      <MemoryRouter initialEntries={['/isues']}>
        <NotFoundContent />
      </MemoryRouter>,
    );

    expect(screen.getByText('/isues')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy path/i })).toBeInTheDocument();
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
