"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  delayDuration?: number;
  sideOffset?: number;
  forceOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function Tooltip({
  children,
  content,
  delayDuration = 500,
  sideOffset = 4,
  forceOpen,
  onOpenChange,
}: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = forceOpen ?? open;

  const setVisible = React.useCallback((next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  }, [onOpenChange]);

  const clearTimer = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => clearTimer, [clearTimer]);

  return (
    <span
      className="relative inline-flex w-full"
      onMouseEnter={() => {
        clearTimer();
        timeoutRef.current = setTimeout(() => setVisible(true), delayDuration);
      }}
      onMouseLeave={() => {
        clearTimer();
        setVisible(false);
      }}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink-title px-2 py-1 text-[11px] font-medium text-surface-1 shadow-[0_4px_14px_rgba(0,0,0,0.14)] transition-[opacity,transform] duration-150",
          visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        )}
        style={{ bottom: `calc(100% + ${sideOffset}px)` }}
      >
        {content}
      </span>
    </span>
  );
}

export { Tooltip };
