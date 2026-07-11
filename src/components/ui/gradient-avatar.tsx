/* GradientAvatar — deterministic mesh-gradient avatar.
 *
 * Rendering is delegated to @outpacelabs/avatars (canvas mesh gradients,
 * same seed → same gradient, nothing stored or fetched). This wrapper is the
 * seam between the vendor component and the app:
 * - fills its container — the vendor span is fixed-px, but Avatar roots set
 *   the size via h-8/w-8-style classes
 * - restores the accessible-name contract the vendor omits
 *   (label → role="img" + aria-label, no label → decorative)
 */

import { GradientAvatar as MeshGradientAvatar } from '@outpacelabs/avatars';
import { cn } from '@/lib/utils';

export function GradientAvatar({
  seed,
  className,
  label,
}: {
  /** Stable per-user seed — a profile id or display name. */
  seed: string;
  className?: string;
  /** Accessible name (the person). Omit → treated as decorative. */
  label?: string;
}) {
  return (
    <span
      className={cn('block h-full w-full', className)}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <MeshGradientAvatar
        seed={seed}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </span>
  );
}
