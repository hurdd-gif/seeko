import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const monoBadgeVariants = cva(
  'inline-flex items-center px-1.5 py-0.5 text-xs font-mono text-muted-foreground',
  {
    variants: {
      variant: {
        bordered: 'rounded-md border border-white/[0.08]',
        plain: '',
        pill: 'rounded-full bg-muted',
      },
    },
    defaultVariants: { variant: 'bordered' },
  }
);

export interface MonoBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof monoBadgeVariants> {}

function MonoBadge({ className, variant, children, ...props }: MonoBadgeProps) {
  const isNumeric =
    typeof children === 'string' && /^[\d.,%]+$/.test(children.trim());

  return (
    <span
      className={cn(
        monoBadgeVariants({ variant }),
        isNumeric && 'tabular-nums',
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { MonoBadge, monoBadgeVariants };
