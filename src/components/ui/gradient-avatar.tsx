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

/**
 * Seed for someone we genuinely cannot name — a legacy activity row written
 * before the actor travelled with the request, or a caller that reached this
 * component without an id. One shared seed, so every such row wears the same
 * anonymous face. Seeding them from the row's own id (which the activity feed
 * used to do) mints a brand-new stranger per event.
 */
export const UNATTRIBUTED = 'unattributed';

export function GradientAvatar({
  seed,
  className,
  label,
}: {
  /**
   * What identifies this person, app-wide — `profile.id`. Not a display name and
   * not initials: "a profile id OR a display name" is what this comment used to
   * say, and two legal answers to "who is this" is one too many. Every surface
   * has to agree or the same person wears a different face on each of them.
   */
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
        // The vendor reads seed.length unguarded, so a falsy seed throws and takes
        // the whole page down with it. TypeScript requires the prop, but an avatar
        // is never worth a white screen — degrade to the anonymous face instead.
        seed={seed || UNATTRIBUTED}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </span>
  );
}
