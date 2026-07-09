'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { InboxRow } from './InboxRow';
import { GroupedNotification, DisplayNotification } from './types';
import { shellEntrance, rowEntrance, DROPDOWN } from '@/lib/motion';

interface DesktopNotificationPanelProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
}

export const DesktopNotificationPanel = forwardRef<HTMLDivElement, DesktopNotificationPanelProps>(
  function DesktopNotificationPanel(
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap },
    ref
  ) {
    const reduce = useReducedMotion();
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            {...shellEntrance(reduce)}
            style={{ transformOrigin: DROPDOWN.shell.transformOrigin }}
            className="absolute right-0 top-full mt-[9px] w-[340px] z-[9999] flex flex-col gap-1 overflow-hidden rounded-[20px] bg-white p-1 shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.10)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="text-[14px] font-medium tracking-[-0.28px] text-[#0d0d0d]">Inbox</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] text-[#808080] hover:bg-[#0000000a] hover:text-[#0d0d0d] transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="mx-4 h-px bg-[#0000000d]" />

            {/* Content */}
            <div className="max-h-[min(500px,70vh)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_96px),transparent)]">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="size-8 text-[#0000001f]" />
                  <p className="mt-3 text-[13px] text-[#808080]">You&apos;re all caught up</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map((group, gi) => (
                    <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                      {gi > 0 && <div className="mx-4 mb-1 h-px bg-[#0000000d]" />}
                      <div className="px-4 pt-2 pb-1.5 text-[13px] text-[#808080]">
                        {group.label}
                      </div>
                      {group.items.map((notif) => {
                        const idx = rowIndex++;
                        return (
                          <InboxRow
                            key={notif.id}
                            notification={notif}
                            group={group.label}
                            index={idx}
                            entrance={rowEntrance(idx, reduce)}
                            onTap={onTap}
                          />
                        );
                      })}
                    </div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
