import * as React from 'react';
import { cn } from '@/lib/utils';
import { GradientAvatar } from './gradient-avatar';

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
  ({ className, src, alt = '', ...props }, ref) => {
    if (!src) return null;
    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        className={cn('aspect-square h-full w-full object-cover', className)}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = 'AvatarImage';

interface AvatarFallbackProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Stable per-user seed (a profile id or display name). When present — or when
   * the children resolve to a plain string (e.g. initials) — the fallback
   * renders a deterministic gradient instead of grey initials. Pass an explicit
   * `hash` on identity surfaces so people with the same initials don't collide.
   */
  hash?: string;
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, hash, children, ...props }, ref) => {
    const seed = hash ?? (typeof children === 'string' ? children : undefined);
    if (seed) {
      const label = typeof children === 'string' ? children : undefined;
      return <GradientAvatar seed={seed} label={label} className={cn('rounded-full', className)} />;
    }
    return (
      <div
        ref={ref}
        className={cn('flex h-full w-full items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-medium', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
