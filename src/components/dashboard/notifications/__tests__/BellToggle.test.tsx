import { render, screen } from '@testing-library/react';
import { BellToggle } from '../BellToggle';

describe('BellToggle', () => {
  it('exposes an accessible name for opening the inbox when closed', () => {
    render(<BellToggle open={false} unreadCount={0} onClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Open inbox' }),
    ).toBeInTheDocument();
  });

  it('exposes an accessible name for closing the inbox when open', () => {
    render(<BellToggle open unreadCount={0} onClick={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Close inbox' }),
    ).toBeInTheDocument();
  });

  // Unread badge — the transitions.dev slide-in + pop. The badge is ALWAYS in the
  // DOM (so the pop-OUT plays when it hides); `data-open` drives both directions.
  describe('unread badge (slide-in + pop)', () => {
    it('opens the badge with the count when closed and unread', () => {
      const { container } = render(
        <BellToggle open={false} unreadCount={3} onClick={() => {}} />,
      );
      const badge = container.querySelector('.t-badge');
      expect(badge).not.toBeNull();
      expect(badge).toHaveAttribute('data-open', 'true');
      expect(container.querySelector('.t-badge-dot')).toHaveTextContent('3');
    });

    it('keeps the badge mounted but closed when there is nothing unread', () => {
      const { container } = render(
        <BellToggle open={false} unreadCount={0} onClick={() => {}} />,
      );
      expect(container.querySelector('.t-badge')).toHaveAttribute('data-open', 'false');
    });

    it('closes the badge while the inbox panel is open (so it pops out)', () => {
      const { container } = render(
        <BellToggle open unreadCount={3} onClick={() => {}} />,
      );
      expect(container.querySelector('.t-badge')).toHaveAttribute('data-open', 'false');
    });

    it('caps the displayed count at 99+', () => {
      const { container } = render(
        <BellToggle open={false} unreadCount={150} onClick={() => {}} />,
      );
      expect(container.querySelector('.t-badge-dot')).toHaveTextContent('99+');
    });
  });
});
