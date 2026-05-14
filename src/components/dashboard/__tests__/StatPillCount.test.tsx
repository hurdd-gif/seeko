import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatPillCount } from '../StatPillCount';

describe('StatPillCount', () => {
  it('renders one .t-digit per character', () => {
    const { container } = render(<StatPillCount value={42} />);
    const group = container.querySelector('.t-digit-group');
    expect(group).not.toBeNull();
    const digits = group!.querySelectorAll('.t-digit');
    expect(digits).toHaveLength(2);
    expect(digits[0].textContent).toBe('4');
    expect(digits[1].textContent).toBe('2');
  });

  it('marks the last two digits with data-stagger 1 and 2', () => {
    const { container } = render(<StatPillCount value={123} />);
    const digits = container.querySelectorAll('.t-digit');
    expect(digits[0].getAttribute('data-stagger')).toBeNull();
    expect(digits[1].getAttribute('data-stagger')).toBe('1');
    expect(digits[2].getAttribute('data-stagger')).toBe('2');
  });

  it('mounts with .is-animating so the initial pop-in plays', () => {
    const { container } = render(<StatPillCount value={7} />);
    expect(container.querySelector('.t-digit-group')?.classList.contains('is-animating')).toBe(true);
  });

  it('handles single-digit values (only one data-stagger="2" digit)', () => {
    const { container } = render(<StatPillCount value={5} />);
    const digits = container.querySelectorAll('.t-digit');
    expect(digits).toHaveLength(1);
    expect(digits[0].getAttribute('data-stagger')).toBe('2');
    expect(digits[0].textContent).toBe('5');
  });
});
