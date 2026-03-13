'use client';

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCheck, CheckCircle2 } from 'lucide-react';
import { NotificationStack } from './NotificationStack';
import { GroupedNotification, DisplayNotification } from './types';
import { useDials } from './DialContext';

interface DesktopNotificationPanelProps {
  open: boolean;
  grouped: GroupedNotification[];
  isEmpty: boolean;
  unreadCount: number;
  onMarkAllRead: () => void;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
  onMarkRead?: (ids: string[]) => void;
}

export const DesktopNotificationPanel = forwardRef<HTMLDivElement, DesktopNotificationPanelProps>(
  function DesktopNotificationPanel(
    { open, grouped, isEmpty, unreadCount, onMarkAllRead, onTap, onDismiss, onMarkRead },
    ref
  ) {
    const d = useDials();
    let rowIndex = 0;

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: d.panel.initialScale, y: d.panel.initialY }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: d.panel.initialScale, y: d.panel.initialY }}
            transition={d.panel.spring}
            className="absolute right-0 top-full mt-3 w-[400px] z-[9999] px-2 py-3 rounded-2xl bg-[#1a1a1a]"
            style={{ transformOrigin: 'top right' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-2 pb-3">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                >
                  <CheckCheck className="size-3.5" />
                  Mark all read
                </button>
              )}
            </div>

            {/* Content */}
            <div className="max-h-[min(500px,70vh)] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="size-8 text-muted-foreground/20" />
                  <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {grouped.map((group, gi) => (
                    <div key={group.label} className={gi > 0 ? 'mt-2' : ''}>
                      <div className="px-3 pt-3 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
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
                            stagger={d.panel.rowStagger}
                            onTap={onTap}
                            onDismiss={onDismiss}
                            onMarkRead={onMarkRead}
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
