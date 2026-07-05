import { render, screen } from '@testing-library/react';
import { LightShell } from '../LightShell';

// StudioHeaderActions pulls in motion/account menu details; mock it to a
// sentinel so the shell test stays focused on shell structure.
vi.mock('../StudioHeaderActions', () => ({
  StudioHeaderActions: (p: { email: string }) => <div data-testid="account-pill">{p.email}</div>,
}));

const accountProps = {
  email: 'k@x.com', initials: 'K', isAdmin: false, unreadCount: 0,
  notifications: [], team: [], areas: [],
} as never;

describe('LightShell', () => {
  it('renders the canonical two-tab pill with correct hrefs', () => {
    render(<LightShell animatePill={false}>body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('href', '/issues');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  }, 20_000);

  it('marks only the activeTab link as aria-current', () => {
    render(<LightShell activeTab="issues" animatePill={false}>body</LightShell>);
    expect(screen.getByRole('link', { name: 'Issues' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Docs' })).not.toHaveAttribute('aria-current');
  });

  it('renders no aria-current when activeTab is undefined', () => {
    render(<LightShell animatePill={false}>body</LightShell>);
    ['Issues', 'Docs'].forEach((n) =>
      expect(screen.getByRole('link', { name: n })).not.toHaveAttribute('aria-current'));
  });

  it('applies navLabel to the nav', () => {
    render(<LightShell navLabel="Project sections" animatePill={false}>body</LightShell>);
    expect(screen.getByRole('navigation', { name: 'Project sections' })).toBeInTheDocument();
  });

  it('renders the account pill only when account prop is set', () => {
    const { rerender } = render(<LightShell animatePill={false}>body</LightShell>);
    expect(screen.queryByTestId('account-pill')).not.toBeInTheDocument();
    rerender(<LightShell account={accountProps} animatePill={false}>body</LightShell>);
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders the actions slot when provided and no account', () => {
    render(<LightShell actions={<button>New issue</button>} animatePill={false}>body</LightShell>);
    expect(screen.getByRole('button', { name: 'New issue' })).toBeInTheDocument();
  });

  it('renders actions and the account pill together on one bar', () => {
    render(
      <LightShell account={accountProps} actions={<button>Filter</button>} animatePill={false}>
        body
      </LightShell>,
    );
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.getByTestId('account-pill')).toHaveTextContent('k@x.com');
  });

  it('renders children', () => {
    render(<LightShell animatePill={false}><p>page body</p></LightShell>);
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('renders leftSlot in place of the pill nav when provided', () => {
    render(<LightShell leftSlot={<a data-testid="crumb">‹ Settings</a>} animatePill={false}>body</LightShell>);
    expect(screen.getByTestId('crumb')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Issues' })).not.toBeInTheDocument();
  });

  it('still renders the pill when leftSlot is omitted', () => {
    render(<LightShell animatePill={false}>body</LightShell>);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issues' })).toBeInTheDocument();
  });
});
