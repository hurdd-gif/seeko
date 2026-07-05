import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Link from '../next-link';

describe('next/link shim', () => {
  // The legacy dashboard components import next/link and are unit-tested in
  // isolation — i.e. rendered WITHOUT a router. The real next/link renders a
  // plain <a> anywhere, so the shim must degrade to an anchor when no router
  // context is present instead of crashing on react-router's useContext.
  it('renders a plain anchor when outside a router context', () => {
    render(<Link href="/tasks">Go to tasks</Link>);
    const anchor = screen.getByRole('link', { name: 'Go to tasks' });
    expect(anchor).toHaveAttribute('href', '/tasks');
  });

  it('renders a navigable anchor inside a router context', () => {
    render(
      <MemoryRouter>
        <Link href="/docs">Go to docs</Link>
      </MemoryRouter>
    );
    const anchor = screen.getByRole('link', { name: 'Go to docs' });
    expect(anchor).toHaveAttribute('href', '/docs');
  });

  it('drops next-only props so they do not leak onto the DOM anchor', () => {
    render(
      <MemoryRouter>
        <Link href="/team" prefetch={false} scroll shallow>
          Team
        </Link>
      </MemoryRouter>
    );
    const anchor = screen.getByRole('link', { name: 'Team' });
    expect(anchor).not.toHaveAttribute('prefetch');
    expect(anchor).not.toHaveAttribute('scroll');
    expect(anchor).not.toHaveAttribute('shallow');
  });
});
