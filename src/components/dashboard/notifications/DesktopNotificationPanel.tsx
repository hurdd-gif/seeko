'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { SMOOTH, ROW_STAGGER } from './constants';
import { NotificationStack } from './NotificationStack';
import { GroupedNotification, DisplayNotification } from './types';

interface DesktopNotificationPanelProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export const DesktopNotificationPanel = forwardRef<HTMLDivElement, DesktopNotificationPanelProps>(
  function DesktopNotificationPanel(
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap, onDismiss },
    ref
  ) {
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={SMOOTH}
            className="absolute right-0 top-full mt-2 w-[380px] rounded-xl border border-white/[0.08] bg-popover/80 backdrop-blur-xl backdrop-saturate-150 shadow-xl z-[9999] overflow-hidden"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-medium text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-colors"
                >
                  <CheckCheck className="size-3" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="max-h-[calc(70vh-60px)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="size-8 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map(group => (
                    <div key={group.label}>
                      <div className="sticky top-0 z-10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 bg-popover/80 backdrop-blur-sm">
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
                            onDismiss={onDismiss}
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
