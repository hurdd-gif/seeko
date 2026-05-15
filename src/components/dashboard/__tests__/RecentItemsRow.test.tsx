import { render, screen } from '@testing-library/react';
import { RecentItemsRow } from '../RecentItemsRow';

describe('RecentItemsRow', () => {
  it('renders eyebrow + tiles', () => {
    render(
      <RecentItemsRow
        items={[
          {
            id: '1',
            kind: 'task',
            title: 'Wire up auth',
            updated_at: '2026-05-13T10:00:00Z',
            href: '/tasks/1',
          },
          {
            id: '2',
            kind: 'doc',
            title: 'Studio brief',
            updated_at: '2026-05-12T10:00:00Z',
            href: '/docs/2',
          },
        ]}
      />,
    );
    expect(screen.getByText('Recently worked on')).toBeInTheDocument();
    expect(screen.getByText('Wire up auth')).toBeInTheDocument();
    expect(screen.getByText('Studio brief')).toBeInTheDocument();
  });
});
