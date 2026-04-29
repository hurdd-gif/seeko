import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'w-full bg-transparent',
        'font-sans text-[0.9375rem] text-ink placeholder:text-ink/40',
        'h-11 px-3 rounded-lg',
        'ring-1 ring-inset ring-ink/15',
        'transition-[box-shadow,color]',
        'duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/60',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
