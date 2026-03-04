import * as React from 'react';
import { cn } from '@/lib/utils';

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

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex h-full w-full items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs font-medium', className)}
      {...props}
    />
  )
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
