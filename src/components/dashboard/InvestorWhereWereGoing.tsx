'use client';

/**
 * InvestorWhereWereGoing — "Where we're going" phase timeline for the investor panel.
 *
 * Lays out areas across three phase columns (Alpha → Beta → Launch) with a
 * connector stroke spanning the headers and an accent marker on whichever
 * column owns the soonest-dated area. On narrow viewports the columns reflow
 * vertically using Tailwind responsive utilities, so a single DOM tree drives
 * both layouts (avoids duplicate testids under jsdom).
 */

import { InvestorPhaseCard } from './InvestorPhaseCard';
import type { Area } from '@/lib/types';

const PHASES = ['Alpha', 'Beta', 'Launch'] as const;
type Phase = (typeof PHASES)[number];

type Props = {
  areas: Area[];
  tasksPerArea: Record<string, { complete: number; total: number }>;
};

export function InvestorWhereWereGoing({ areas, tasksPerArea }: Props) {
  const datedAreas = areas.filter((a) => a.target_date);
  const soonest = datedAreas.length
    ? datedAreas.reduce<Area | null>(
        (acc, a) => (!acc || a.target_date! < acc.target_date! ? a : acc),
        null,
      )
    : null;
  const markerPhase = soonest?.phase as Phase | undefined;
  const noShipDates = datedAreas.length === 0;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[14px] border border-[#e8e8e8bf] bg-white shadow-[0_10px_20px_rgba(209,209,209,0.15)]">
      <div className="px-6 pb-4 pt-5">
        <p className="text-[13px] font-medium leading-[18px] text-[var(--ov-muted)]">Where we&apos;re going</p>
        <h2 className="mt-1 text-[20px] font-semibold leading-[24px] text-[#111]">
          Ship forecast
        </h2>

        {noShipDates && (
          <p className="mt-2 text-[13px] leading-[18px] text-[var(--ov-muted)]">No ship dates set.</p>
        )}
      </div>
      <div className="h-px bg-black/[0.05]" aria-hidden />

      <div className="relative grid flex-1 grid-cols-1 gap-3 px-6 py-4 md:grid-cols-3">
          {/* Connector stroke across the three phase headers (desktop only).
              Sits at the vertical center of the h-6 header row (12px) so the
              line threads through every phase label and any marker dot. */}
          <div
            data-testid="phase-connector"
            aria-hidden="true"
            className="absolute left-[8%] right-[8%] top-3 hidden h-px bg-[var(--ov-hairline)] md:block"
          />
          {PHASES.map((phase) => {
            const isMarker = markerPhase === phase;
            const phaseAreas = areas.filter((a) => a.phase === phase);
            return (
              <div key={phase} className="flex flex-col gap-3 relative">
                <div className="flex h-6 items-center gap-2">
                  <span className="text-[13px] leading-none text-[var(--ov-muted)]">
                    {phase}
                  </span>
                  {isMarker && (
                    <span
                      data-testid="timeline-marker"
                      data-marker-phase={phase}
                      className="size-2 rounded-full bg-[--color-seeko-accent] shadow-[0_0_0_4px_rgba(13,122,255,0.12)]"
                    />
                  )}
                </div>
                {phaseAreas.length === 0 ? (
                  <div
                    className="flex min-h-[88px] items-center justify-center rounded-[18px] bg-black/[0.035] px-3 py-2.5"
                    aria-label="No areas in this phase"
                  >
                    <span className="text-[12px] text-[var(--ov-muted)]">
                      Nothing here yet
                    </span>
                  </div>
                ) : (
                  phaseAreas.map((area) => (
                    <div key={area.id} data-phase={phase}>
                      <InvestorPhaseCard
                        name={area.name}
                        targetDate={area.target_date ?? null}
                        tasksComplete={tasksPerArea[area.id]?.complete ?? 0}
                        tasksTotal={tasksPerArea[area.id]?.total ?? 0}
                        isPast={
                          !!area.target_date &&
                          new Date(area.target_date) < new Date()
                        }
                      />
                    </div>
                  ))
                )}
              </div>
            );
          })}
      </div>
    </section>
  );
}
