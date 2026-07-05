import { render, screen } from '@testing-library/react';
import { TopNav } from '../TopNav';

let mockPath = '/';
vi.mock('@/lib/react-router-adapters', () => ({
  Link: ({ href, to, ...props }: { href?: string; to?: string; children?: unknown }) => (
    <a href={href ?? to} {...props} />
  ),
  usePathname: () => mockPath,
}));

describe('TopNav', () => {
  beforeEach(() => {
    mockPath = '/';
  });

  it('renders the base destinations as text links', () => {
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '/docs');
    expect(screen.getByRole('link', { name: 'Activity' })).toHaveAttribute('href', '/activity');
  });

  it('no longer surfaces Overview — Issues (/tasks) is the home page now', () => {
    render(<TopNav />);
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  });

  it('hides Activity for contractors', () => {
    render(<TopNav isContractor />);
    expect(screen.queryByRole('link', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
  });

  it('never surfaces Payments in the nav — it lives in the user menu now', () => {
    render(<TopNav />);
    expect(screen.queryByRole('link', { name: 'Payments' })).not.toBeInTheDocument();
  });

  it('marks the destination matching the current path as current', () => {
    mockPath = '/tasks';
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Docs' })).not.toHaveAttribute('aria-current');
  });

  it('treats nested paths as active for their section', () => {
    mockPath = '/docs/some-doc';
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tasks' })).not.toHaveAttribute('aria-current');
  });
});
