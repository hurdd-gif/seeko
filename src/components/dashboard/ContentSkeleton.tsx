'use client';

import { Skeleton, type SkeletonProps } from 'boneyard-js/react';
import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Shared seam for every route's `loading.tsx` skeleton. Wraps boneyard's
 * <Skeleton> so our defaults (reduced-motion handling) live in one place.
 * Each route imports its own captured bones JSON and passes it as `initialBones`.
 */
export function ContentSkeleton({
  name,
  loading,
  initialBones,
  fallback,
  children,
}: {
  name: string;
  loading: boolean;
  initialBones?: unknown;
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <Skeleton
      name={name}
      loading={loading}
      // No pulsing under reduced motion — fall back to a static fill.
      animate={shouldReduce ? 'solid' : 'pulse'}
      // `initialBones` is route-specific JSON, typed `unknown` here; cast to
      // boneyard's accepted shape for the prop.
      initialBones={initialBones as SkeletonProps['initialBones']}
      fallback={fallback}
    >
      {children}
    </Skeleton>
  );
}
