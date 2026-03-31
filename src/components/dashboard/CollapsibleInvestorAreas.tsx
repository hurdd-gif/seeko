'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Map } from 'lucide-react';
import { InvestorAreaCard } from '@/components/dashboard/InvestorAreaCard';
import { Stagger } from '@/components/motion';
import type { Area, TaskWithAssignee } from '@/lib/types';
import { springs } from '@/lib/motion';

const surface = 'rounded-2xl bg-[#222222] border-0';
const surfaceShadow = { boxShadow: '0 0 0 1px rgba(255,255,255,0.03), 0 4px 16px rgba(0,0,0,0.1)' };

interface CollapsibleInvestorAreasProps {
  areas: Area[];
  tasks: TaskWithAssignee[];
  subtitle: string;
  defaultOpen?: boolean;
  isAdmin?: boolean;
}

export function CollapsibleInvestorAreas({ areas, tasks, subtitle, defaultOpen = false, isAdmin = false }: CollapsibleInvestorAreasProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={surface} style={surfaceShadow}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full text-left"
      >
        <div className="flex flex-col space-y-1.5 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="size-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold text-foreground">Game Areas</h3>
            </div>
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={springs.smooth}
            >
              <ChevronDown className="size-4 text-muted-foreground" />
            </motion.div>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">{subtitle}</p>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springs.smooth}
            className="overflow-hidden"
          >
            <div className="p-6 pt-0">
              <Stagger className="grid grid-cols-1 gap-4" delayMs={0.05}>
                {areas.map(area => (
                  <InvestorAreaCard
                    key={area.id}
                    area={area}
                    tasksInArea={tasks.filter(t => t.area_id === area.id)}
                    isAdmin={isAdmin}
                  />
                ))}
              </Stagger>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
