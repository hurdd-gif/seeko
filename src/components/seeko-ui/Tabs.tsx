'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultKey?: string;
  className?: string;
  onChange?: (key: string) => void;
}

export function Tabs({ items, defaultKey, className, onChange }: TabsProps) {
  const [active, setActive] = React.useState(defaultKey ?? items[0]?.key);

  const handleSelect = (key: string) => {
    setActive(key);
    onChange?.(key);
  };

  const activeItem = items.find((i) => i.key === active);

  return (
    <div className={cn('w-full', className)}>
      <div
        role="tablist"
        className="flex items-center gap-6 border-b border-border"
      >
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => handleSelect(item.key)}
              className={cn(
                'relative pb-3 -mb-px font-sans text-[0.9375rem] font-medium',
                'transition-[color,opacity]',
                'duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper rounded-sm',
                isActive
                  ? 'text-ink'
                  : 'text-ink/50 hover:text-ink/80'
              )}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 right-0 -bottom-[1.5px] h-[1.5px] bg-ink rounded-full"
                />
              )}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="pt-6">
        {activeItem?.content}
      </div>
    </div>
  );
}
