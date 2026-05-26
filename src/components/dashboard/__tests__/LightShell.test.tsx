import { render, screen } from '@testing-library/react';
import { LightShell } from '../LightShell';

// OverviewHeaderActions pulls in dynamic()/motion; mock it to a sentinel so the
// shell test stays focused on shell structure.
vi.mock('../OverviewHeaderActions', () => ({
  OverviewHeaderActions: (p: { email: string }) => <div data-testid="account-pill">{p.email}</div>,
}));

const accountProps = {
  email: 'k@x.com', initials: 'K', isAdmin: false, unreadCount: 0,
  notifications: [], team: [], areas: [],
} as never;

describe('LightShell', () => {
  it('renders the canonical three-tab pill with correct hrefs', () => {
    render(<LightShell>body</LightShell>);
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
  });

  it('marks only the activeTab link as aria-current', () => {
    render(<LightShell activeTab="issues">body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('renders no aria-current when activeTab is undefined', () => {
    render(<LightShell>body</LightShell>);
    ['Overview', 'Issues', 'Docs'].forEach((n) =>
      expect(screen.getByRole('link', { name: n })).not.toHaveAttribute('aria-current'));
  });

  it('applies navLabel to the nav', () => {
    render(<LightShell navLabel="Project sections">body</LightShell>);
    expect(screen.getByRole('navigation', { name: 'Project sections' })).toBeInTheDocument();
  });

  it('renders the account pill only when account prop is set', () => {
    const { rerender } = render(<LightShell>body</LightShell>);
    expect(screen.queryByTestId('account-pill')).not.toBeInTheDocument();
    rerender(<LightShell account={accountProps}>body</LightShell>);
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders the actions slot when provided and no account', () => {
    render(<LightShell actions={<button>New issue</button>}>body</LightShell>);
    expect(screen.getByRole('button', { name: 'New issue' })).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<LightShell><p>page body</p></LightShell>);
    expect(screen.getByText('page body')).toBeInTheDocument();
  });
});
