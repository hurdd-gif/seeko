import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Capture the `animate` prop boneyard's Skeleton receives so tests can assert it.
const lastSkeletonProps: { animate?: unknown } = {};

vi.mock('boneyard-js/react', () => ({
  Skeleton: ({
    loading,
    children,
    animate,
  }: {
    loading: boolean;
    children?: React.ReactNode;
    animate?: unknown;
  }) => {
    lastSkeletonProps.animate = animate;
    return loading ? <div data-testid="bones" data-animate={String(animate)} /> : <>{children}</>;
  },
}));

// Control useReducedMotion() per test.
const reducedMotion = { value: false };
vi.mock('motion/react', () => ({
  useReducedMotion: () => reducedMotion.value,
}));

import { ContentSkeleton } from '../ContentSkeleton';

beforeEach(() => {
  reducedMotion.value = false;
  lastSkeletonProps.animate = undefined;
});

describe('ContentSkeleton', () => {
  it('renders children and no bones when not loading', () => {
    render(
      <ContentSkeleton name="overview" loading={false}>
        <p>real content</p>
      </ContentSkeleton>,
    );
    expect(screen.getByText('real content')).toBeInTheDocument();
    expect(screen.queryByTestId('bones')).not.toBeInTheDocument();
  });

  it('renders bones and hides children when loading', () => {
    render(
      <ContentSkeleton name="overview" loading>
        <p>real content</p>
      </ContentSkeleton>,
    );
    expect(screen.getByTestId('bones')).toBeInTheDocument();
    expect(screen.queryByText('real content')).not.toBeInTheDocument();
  });

  it('passes animate="solid" under reduced motion', () => {
    reducedMotion.value = true;
    render(
      <ContentSkeleton name="overview" loading>
        <p>real content</p>
      </ContentSkeleton>,
    );
    expect(screen.getByTestId('bones')).toHaveAttribute('data-animate', 'solid');
    expect(lastSkeletonProps.animate).toBe('solid');
  });

  it('passes animate="pulse" when reduced motion is off', () => {
    reducedMotion.value = false;
    render(
      <ContentSkeleton name="overview" loading>
        <p>real content</p>
      </ContentSkeleton>,
    );
    expect(screen.getByTestId('bones')).toHaveAttribute('data-animate', 'pulse');
    expect(lastSkeletonProps.animate).toBe('pulse');
  });
});
