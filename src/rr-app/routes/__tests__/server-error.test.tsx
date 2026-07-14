import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { ServerErrorContent, ServerErrorRoute } from '../server-error';

describe('ServerErrorContent', () => {
  // The entrance is gated on sessionStorage and tests share a realm — without
  // this, the first test to render would flag the key and every later one would
  // silently be exercising the already-seen path.
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders the 500 mark and owns the failure in the first person', () => {
    render(
      <MemoryRouter>
        <ServerErrorContent detail="503 Service Unavailable" />
      </MemoryRouter>,
    );

    // The numerals are a mark, not prose — announced once, not spelled into the
    // headline beneath them.
    expect(screen.getByRole('img', { name: '500' })).toBeInTheDocument();

    // "Something went wrong" is this page's boilerplate (Threads, PayPal, Midday,
    // VEED, Retool, Typeform all ship it) and it is passive precisely so nobody
    // has to say who broke it. This line says who.
    expect(screen.getByRole('heading', { name: /we broke something/i })).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('surfaces the failure detail, in full and copyable', () => {
    // Long enough that the old card's `truncate` would have eaten the half that
    // says anything.
    const detail = 'TypeError: Cannot read properties of undefined (reading "tasks")';
    render(
      <MemoryRouter>
        <ServerErrorContent detail={detail} />
      </MemoryRouter>,
    );

    expect(screen.getByText(detail)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy error detail/i })).toBeInTheDocument();
  });

  it('offers a retry, not a way out — the page you wanted may be one reload away', () => {
    render(
      <MemoryRouter>
        <ServerErrorContent detail="500" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    // The 404's primary. A 500 must not send you home: home is not what you came for.
    expect(screen.queryByRole('link', { name: /back to issues/i })).not.toBeInTheDocument();
  });

  it('drops the detail pill entirely when there is nothing worth handing over', () => {
    render(
      <MemoryRouter>
        <ServerErrorContent detail={null} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /copy error detail/i })).not.toBeInTheDocument();
  });

  it('offers nothing to copy when /500 is opened directly, because there is nothing to copy', () => {
    render(
      <MemoryRouter initialEntries={['/500']}>
        <ServerErrorRoute />
      </MemoryRouter>,
    );

    // A direct visit has no thrown error to quote. The first draft filled the pill
    // with the literal words "500 Internal Server Error" — a copy button offering
    // you the mark you are already looking at.
    expect(screen.queryByText('500 Internal Server Error')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy error detail/i })).not.toBeInTheDocument();
    // The page still stands on its own two elements.
    expect(screen.getByRole('img', { name: '500' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
