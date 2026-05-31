import type { Area } from './types';

export function soonestArea(areas: Area[]): Area | null {
  const dated = areas.filter((a): a is Area & { target_date: string } => Boolean(a.target_date));
  if (dated.length === 0) return null;
  return dated.reduce((acc, a) => (a.target_date < acc.target_date ? a : acc));
}

export function monthsUntil(targetDate: string, ref: Date = new Date()): number {
  const target = new Date(targetDate);
  const years = target.getUTCFullYear() - ref.getUTCFullYear();
  const months = target.getUTCMonth() - ref.getUTCMonth();
  return years * 12 + months;
}
