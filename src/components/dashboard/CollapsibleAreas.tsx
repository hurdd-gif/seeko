'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Map } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardAreaCard } from '@/components/dashboard/DashboardAreaCard';
import { Stagger } from '@/components/motion';
import type { Area } from '@/lib/types';

interface CollapsibleAreasProps {
  areas: Area[];
  isAdmin: boolean;
  subtitle: string;
}

export function CollapsibleAreas({ areas, isAdmin, subtitle }: CollapsibleAreasProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full text-left"
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Map className="size-4 text-muted-foreground" />
              <CardTitle className="text-xl font-semibold text-foreground">Game Areas</CardTitle>
            </div>
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <ChevronDown className="size-4 text-muted-foreground" />
            </motion.div>
          </div>
          <CardDescription className="line-clamp-1">{subtitle}</CardDescription>
        </CardHeader>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="overflow-hidden"
          >
            <CardContent>
              <Stagger className="grid grid-cols-1 gap-4" delayMs={0.05}>
                {areas.map(area => (
                  <DashboardAreaCard key={area.id} area={area} isAdmin={isAdmin} />
                ))}
              </Stagger>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
