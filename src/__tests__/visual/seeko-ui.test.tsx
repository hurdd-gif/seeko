import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button, Input, Card, Tabs } from '@/components/seeko-ui';

describe('seeko-ui primitives', () => {
  it('Button renders with pill radius for primary variant', () => {
    const { container } = render(<Button>Continue</Button>);
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.className).toMatch(/rounded-/);
    expect(btn?.textContent).toBe('Continue');
  });

  it('Button supports primary, secondary, ghost variants', () => {
    const { container: c1 } = render(<Button variant="primary">a</Button>);
    const { container: c2 } = render(<Button variant="secondary">b</Button>);
    const { container: c3 } = render(<Button variant="ghost">c</Button>);
    expect(c1.querySelector('button')).toBeTruthy();
    expect(c2.querySelector('button')).toBeTruthy();
    expect(c3.querySelector('button')).toBeTruthy();
  });

  it('Button does not use transition: all (specifies properties)', () => {
    const { container } = render(<Button>x</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).not.toMatch(/\btransition-all\b/);
    expect(btn?.className).toMatch(/transition-\[/);
  });

  it('Input renders as input element with hairline ring', () => {
    const { container } = render(<Input placeholder="Email" />);
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    expect(input?.placeholder).toBe('Email');
    expect(input?.className).toMatch(/ring-/);
  });

  it('Card renders with hairline border, no shadow', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toBeTruthy();
    const card = container.firstChild as HTMLElement;
    expect(card.className).toMatch(/border|ring/);
    expect(card.className).not.toMatch(/shadow-(lg|xl|2xl|md)\b/);
  });

  it('Tabs renders with items', () => {
    const { container, getByText } = render(
      <Tabs items={[{ key: 'a', label: 'Alpha', content: 'A content' }, { key: 'b', label: 'Beta', content: 'B content' }]} />
    );
    expect(container.firstChild).toBeTruthy();
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
  });
});
