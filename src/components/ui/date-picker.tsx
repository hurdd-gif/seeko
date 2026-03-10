'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export interface DatePickerProps {
  /** Selected date in YYYY-MM-DD format */
  value: string;
  /** Called with YYYY-MM-DD string when a date is selected */
  onChange: (date: string) => void;
  /** Minimum selectable date. Defaults to today. Pass null to allow all past dates. */
  minDate?: Date | null;
  /** Optional label shown below the calendar when a date is selected */
  dateLabel?: string;
  /** Whether to animate mount. Defaults to false. */
  animated?: boolean;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePicker({ value, onChange, minDate, dateLabel, animated = false }: DatePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const min = minDate === null ? null : (minDate ?? today);
  if (min) min.setHours(0, 0, 0, 0);

  const initial = value ? new Date(value + 'T00:00:00') : today;
  const [month, setMonth] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  const firstDay = new Date(month.year, month.month, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();

  const prevMonth = () => {
    const m = month.month === 0 ? 11 : month.month - 1;
    const y = month.month === 0 ? month.year - 1 : month.year;
    setMonth({ year: y, month: m });
  };
  const nextMonth = () => {
    const m = month.month === 11 ? 0 : month.month + 1;
    const y = month.month === 11 ? month.year + 1 : month.year;
    setMonth({ year: y, month: m });
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function toDateStr(day: number) {
    const mm = String(month.month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${month.year}-${mm}-${dd}`;
  }

  const isDisabled = (day: number) => {
    if (!min) return false;
    return new Date(month.year, month.month, day) < min;
  };

  const canGoPrev = !min || month.year > min.getFullYear() || (month.year === min.getFullYear() && month.month > min.getMonth());

  const formattedValue = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const content = (
    <div className="rounded-lg border border-border bg-background p-3 w-fit">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={prevMonth}
          disabled={!canGoPrev}
          className="rounded p-1 hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-xs font-medium text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="rounded p-1 hover:bg-muted transition-colors"
        >
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="flex size-8 items-center justify-center text-[10px] font-medium text-muted-foreground/60">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="size-8" />;
          const dateStr = toDateStr(day);
          const isSelected = value === dateStr;
          const isToday = month.month === today.getMonth() && month.year === today.getFullYear() && day === today.getDate();
          const disabled = isDisabled(day);

          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              onClick={() => onChange(dateStr)}
              className={`flex size-8 items-center justify-center rounded-md text-xs transition-all
                ${disabled ? 'text-muted-foreground/30 cursor-not-allowed' : 'hover:bg-muted cursor-pointer'}
                ${isSelected ? 'bg-seeko-accent text-background font-semibold hover:bg-seeko-accent/90' : ''}
                ${isToday && !isSelected ? 'ring-1 ring-seeko-accent/40 text-seeko-accent font-medium' : ''}
                ${!isSelected && !isToday && !disabled ? 'text-foreground' : ''}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Selected date display */}
      {value && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border/50 pt-2">
          <Calendar className="size-3" />
          {dateLabel ? `${dateLabel} ${formattedValue}` : formattedValue}
        </p>
      )}
    </div>
  );

  if (animated) {
    // Caller should wrap in AnimatePresence + motion.div if needed
    return <div className="mt-2">{content}</div>;
  }

  return <div className="mt-2">{content}</div>;
}
