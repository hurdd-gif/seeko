import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-sans text-[0.9375rem] leading-none font-medium',
    'select-none cursor-pointer',
    'transition-[background-color,color,opacity,transform,box-shadow]',
    'duration-150 ease-out',
    'active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-paper focus-visible:ring-ink/40',
    'disabled:opacity-40 disabled:pointer-events-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/90 rounded-full',
        secondary:
          'bg-transparent text-ink ring-1 ring-inset ring-border hover:bg-ink/[0.04] rounded-lg',
        ghost: 'bg-transparent text-ink hover:bg-ink/[0.04] rounded-lg',
        // Joby-register editorial CTA: text only, animated underline.
        // No fill, no border, no radius. The type carries the action.
        link:
          'bg-transparent text-ink rounded-none px-0 underline underline-offset-[6px] decoration-ink/30 hover:decoration-ink decoration-[1px]',
      },
      size: {
        sm: 'h-9 px-4',
        md: 'h-11 px-6',
        lg: 'h-12 px-8',
      },
    },
    compoundVariants: [
      { variant: 'link', size: 'sm', className: 'h-auto px-0' },
      { variant: 'link', size: 'md', className: 'h-auto px-0' },
      { variant: 'link', size: 'lg', className: 'h-auto px-0 text-[1.0625rem]' },
    ],
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = 'Button';
