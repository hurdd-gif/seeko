import * as React from 'react';
import { cn } from '@/lib/utils';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-paper rounded-xl border border-ink/10',
        'p-6',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';
