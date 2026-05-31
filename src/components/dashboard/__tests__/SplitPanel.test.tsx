import { render, screen } from '@testing-library/react';
import { Calendar } from 'lucide-react';
import { SplitPanel } from '../SplitPanel';
import { PanelPromo } from '../PanelPromo';
import { PanelList } from '../PanelList';

describe('SplitPanel', () => {
  it('renders eyebrow + left + right', () => {
    render(
      <SplitPanel
        icon={Calendar}
        eyebrow="Upcoming events"
        left={
          <PanelPromo
            title="Connect calendar"
            body="Calls in Notion"
            cta={{ href: '/x', label: 'Connect →' }}
          />
        }
        right={
          <PanelList
            rows={[{ id: '1', leading: 'Today', primary: 'Team standup', meta: '9 AM · Office' }]}
          />
        }
      />
    );
    expect(screen.getByText('Upcoming events')).toBeInTheDocument();
    expect(screen.getByText('Connect calendar')).toBeInTheDocument();
    expect(screen.getByText('Team standup')).toBeInTheDocument();
  });
});
