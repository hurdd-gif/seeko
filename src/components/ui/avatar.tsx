import * as React from 'react';
import { cn } from '@/lib/utils';
import { GradientAvatar, UNATTRIBUTED } from './gradient-avatar';

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  )
);
Avatar.displayName = 'Avatar';

interface AvatarImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  (_props, _ref) => {
    // Product decision: everyone renders the deterministic gradient avatar
    // instead of an uploaded photo. This is the single app-wide chokepoint —
    // every `<Avatar>` in the app pairs an `<AvatarImage src=… />` with a
    // seeded `<AvatarFallback>`, so short-circuiting the photo here lets the
    // gradient fallback take over everywhere. Callers are untouched (the prop
    // signature is preserved) so this is a one-line revert: restore the
    // original `src`-rendering body to bring photos back.
    return null;
  }
);
AvatarImage.displayName = 'AvatarImage';

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * What identifies this person, app-wide. `profile.id` wherever a profile
   * exists; for people who have no row (external payees) the one stable string
   * that names them, e.g. their email.
   *
   * REQUIRED on purpose. This used to be optional and fell back to whatever the
   * caller happened to render as children — so the same person was seeded from
   * a UUID on the board, from "K" in the header, and from an activity-row id in
   * the feed, and wore three different faces. The seed is the identity, not a
   * styling detail: if a call site can't say who this is, it shouldn't be
   * drawing their avatar.
   */
  seed: string;
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, seed, children }, _ref) => (
    // Children stay meaningful as the accessible name (the initials are never
    // painted — the gradient covers them).
    <GradientAvatar
      seed={seed}
      label={typeof children === 'string' ? children : undefined}
      className={cn('rounded-full', className)}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback, UNATTRIBUTED };
