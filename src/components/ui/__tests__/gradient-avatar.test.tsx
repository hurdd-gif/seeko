import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GradientAvatar } from '../gradient-avatar';

// The only real hazard for this component is an SSR/CSR hydration mismatch, so
// the contract we guard is determinism: the same seed must always produce byte-
// identical markup (no Math.random / Date in the render path).
describe('GradientAvatar — deterministic, SSR-safe', () => {
  it('renders an <svg> for a seed', () => {
    const html = renderToStaticMarkup(<GradientAvatar seed="user-1" />);
    expect(html).toContain('<svg');
    expect(html).toContain('radialGradient');
  });

  it('is byte-identical across repeated renders of the same seed', () => {
    const a = renderToStaticMarkup(<GradientAvatar seed="7887ae1d-2b5a-42e8" label="Youngan" />);
    const b = renderToStaticMarkup(<GradientAvatar seed="7887ae1d-2b5a-42e8" label="Youngan" />);
    expect(a).toBe(b);
  });

  it('produces different gradients for different seeds', () => {
    const a = renderToStaticMarkup(<GradientAvatar seed="alice" />);
    const b = renderToStaticMarkup(<GradientAvatar seed="bob" />);
    expect(a).not.toBe(b);
  });

  it('exposes an accessible name when a label is given, else is decorative', () => {
    expect(renderToStaticMarkup(<GradientAvatar seed="x" label="Sam Rivera" />)).toContain(
      'aria-label="Sam Rivera"',
    );
    expect(renderToStaticMarkup(<GradientAvatar seed="x" />)).toContain('aria-hidden');
  });
});
