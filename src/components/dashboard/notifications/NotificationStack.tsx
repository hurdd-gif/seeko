/* ─────────────────────────────────────────────────────────
 * NOTIFICATION STACK — motion.dev pattern
 * ───────────────────────────────────────────────────────── */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { X } from 'lucide-react';
import { NotificationCard } from './NotificationCard';
import { DisplayNotification } from './types';
import { useDials } from './DialContext';

interface NotificationStackProps {
  notification: DisplayNotification;
  group: string;
  index: number;
  stagger: number;
  onTap: (notif: DisplayNotification) => void;
  onDismiss: (ids: string[]) => void;
}

export function NotificationStack({
  notification,
  group,
  index,
  stagger,
  onTap,
  onDismiss,
}: NotificationStackProps) {
  const [expanded, setExpanded] = useState(false);
  const d = useDials();
  const frontRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(72);

  useEffect(() => {
    if (frontRef.current) {
      const h = frontRef.current.getBoundingClientRect().height;
      if (h > 0) setCardHeight(h);
    }
  }, [notification.title, notification.body]);

  // Collapse on click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (stackRef.current && !stackRef.current.contains(e.target as Node)) {
      setExpanded(false);
    }
  }, []);

  useEffect(() => {
    if (!expanded) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded, handleClickOutside]);

  if (notification.count <= 1) {
    return (
      <NotificationCard
        notification={notification}
        group={group}
        index={index}
        stagger={stagger}
        onTap={onTap}
        onDismiss={onDismiss}
      />
    );
  }

  const children = notification.children ?? [];
  const allCards = [notification, ...children];
  const morphId = `stack-badge-${notification.id}`;

  return (
    <LayoutGroup>
      <motion.div
        ref={stackRef}
        animate={{
          height: expanded
            ? 'auto'
            : cardHeight + d.stack.cardGap + d.stack.collapsedPeek,
        }}
        transition={d.stack.spring}
        style={{ overflow: 'visible', position: 'relative' }}
      >
        {allCards.map((card, i) => {
          const isFront = i === 0;
          const closedY = -i * (cardHeight + d.stack.cardGap);
          const closedScale = isFront ? 1 : Math.max(1 - i * d.stack.scaleStep, 0.85);
          const closedOpacity = isFront ? 1 : Math.max(1 - i * d.stack.opacityStep, 0);

          return (
            <motion.div
              key={card.id}
              ref={isFront ? frontRef : undefined}
              animate={{
                y: expanded ? 0 : closedY,
                scale: expanded ? 1 : closedScale,
                opacity: expanded ? 1 : closedOpacity,
              }}
              transition={{
                ...d.stack.spring,
                delay: expanded
                  ? i * d.stack.expandStagger
                  : (allCards.length - 1 - i) * d.stack.collapseStagger,
              }}
              style={{
                zIndex: allCards.length - i,
                pointerEvents: expanded || isFront ? 'auto' : 'none',
                transformOrigin: 'top center',
                marginBottom: i < allCards.length - 1 ? d.stack.cardGap : 0,
                position: 'relative',
              }}
            >
              <NotificationCard
                notification={card}
                group={group}
                index={isFront ? index : 0}
                stagger={isFront ? stagger : 0}
                onTap={isFront && !expanded ? () => setExpanded(true) : onTap}
                onDismiss={onDismiss}
                hideClose={isFront}
              />
            </motion.div>
          );
        })}

        {/* Morphing badge: +N → expand, X → collapse */}
        <motion.button
          layoutId={morphId}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(v => !v);
          }}
          className={[
            'absolute flex items-center justify-center rounded-full backdrop-blur-sm transition-colors',
            expanded
              ? 'top-2 right-3 size-6 bg-white/[0.08] text-muted-foreground hover:bg-white/[0.15] hover:text-foreground cursor-pointer'
              : 'top-1 right-2.5 px-1.5 py-0.5 bg-white/[0.12] text-muted-foreground cursor-pointer',
          ].join(' ')}
          style={{ zIndex: allCards.length + 1 }}
          transition={d.bell.spring}
        >
          <AnimatePresence mode="wait" initial={false}>
            {expanded ? (
              <motion.span
                key="x"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{ opacity: 0, rotate: 90 }}
                transition={{ duration: d.stack.badgeMorphDuration }}
              >
                <X className="size-3" />
              </motion.span>
            ) : (
              <motion.span
                key="count"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: d.stack.badgeMorphDuration }}
                className="text-[10px] font-medium leading-none"
              >
                +{notification.count - 1}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </LayoutGroup>
  );
}
