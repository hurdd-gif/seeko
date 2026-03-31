'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { NotificationStack } from './NotificationStack';
import { SMOOTH, ROW_STAGGER } from './constants';
import { GroupedNotification, DisplayNotification } from './types';

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
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={SMOOTH}
            className="absolute right-0 top-full mt-3 w-[400px] z-[9999] rounded-xl border border-white/[0.08] bg-[#1a1a1a] shadow-xl"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="max-h-[min(480px,70vh)] overflow-y-auto [scrollbar-width:thin] p-1.5">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="size-8 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              ) : (
                grouped.map((group, gi) => (
                  <div key={group.label} className={gi > 0 ? 'mt-1' : ''}>
                    <div className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                      {group.label}
                    </div>
                    {group.items.map(notif => {
                      const idx = rowIndex++;
                      return (
                        <NotificationStack
                          key={notif.id}
                          notification={notif}
                          group={group.label}
                          index={idx}
                          stagger={ROW_STAGGER}
                          onTap={onTap}
                        />
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);
