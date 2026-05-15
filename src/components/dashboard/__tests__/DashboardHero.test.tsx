import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardHero } from '../DashboardHero';

describe('DashboardHero', () => {
  it('renders greeting + name', () => {
    render(<DashboardHero greeting="Good evening" name="Karti" />);
    expect(screen.getByText('Good evening, Karti')).toBeInTheDocument();
  });
});
