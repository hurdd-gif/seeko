import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHero } from '../DashboardHero';

const pills = [{ label: 'open', count: 3, variant: 'accent' as const }];

describe('DashboardHero', () => {
  it('renders evening greeting at 20:00', () => {
    render(
      <DashboardHero
        firstName="karti"
        subline="3 due this week."
        pills={pills}
        now={new Date('2026-05-13T20:00:00')}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, karti');
  });

  it('renders morning greeting at 07:00', () => {
    render(
      <DashboardHero
        firstName="karti"
        subline=""
        pills={pills}
        now={new Date('2026-05-13T07:00:00')}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, karti');
  });

  it('renders afternoon greeting at 14:00', () => {
    render(
      <DashboardHero
        firstName="karti"
        subline=""
        pills={pills}
        now={new Date('2026-05-13T14:00:00')}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good afternoon, karti');
  });

  it('falls back to "there" when firstName is missing', () => {
    render(
      <DashboardHero
        firstName={undefined}
        subline=""
        pills={pills}
        now={new Date('2026-05-13T20:00:00')}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good evening, there');
  });

  it('renders the subline below the heading', () => {
    render(
      <DashboardHero
        firstName="karti"
        subline="2 blocked, 3 due this week."
        pills={pills}
        now={new Date('2026-05-13T20:00:00')}
      />,
    );
    expect(screen.getByText('2 blocked, 3 due this week.')).toBeInTheDocument();
  });
});
