/**
 * Insights periods, occupancy and counts. No money here: every rupee figure
 * comes from money.ts (night-split booked revenue, cash by paid_on).
 */
import { addMonths, monthKey, monthRange, monthsBetween, nightsBetween, type ISODate } from './dates';
import { bookedNightsIn, type StayDates } from './occupancy';

export type Period = 'month' | '3m' | '6m' | '12m' | 'fy' | 'next3';

export const PERIOD_LABEL: Record<Period, string> = {
  month: 'This month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  fy: 'This financial year',
  next3: 'Next 3 months',
};

/** The months a period covers, oldest first. "Last N months" includes this month. */
export function periodMonths(p: Period, today: ISODate): string[] {
  const m = monthKey(today);
  switch (p) {
    case 'month':
      return [m];
    case '3m':
      return monthsBetween(addMonths(m, -2), m);
    case '6m':
      return monthsBetween(addMonths(m, -5), m);
    case '12m':
      return monthsBetween(addMonths(m, -11), m);
    case 'next3':
      return monthsBetween(m, addMonths(m, 2));
    case 'fy': {
      // Indian financial year: April to March.
      const y = Number(m.slice(0, 4));
      const startYear = Number(m.slice(5)) >= 4 ? y : y - 1;
      return monthsBetween(`${startYear}-04`, `${startYear + 1}-03`);
    }
  }
}

/** [start, end) of a run of months. */
export function spanOf(months: string[]): { start: ISODate; end: ISODate } {
  return { start: monthRange(months[0]!).start, end: monthRange(months[months.length - 1]!).end };
}

export interface Occupancy {
  booked: number;
  nights: number;
  /** Whole per cent, rounded. */
  pct: number;
}

/** Booked nights out of the nights in [start, end). */
export function occupancy(stays: StayDates[], start: ISODate, end: ISODate): Occupancy {
  const booked = bookedNightsIn(stays, start, end);
  const nights = nightsBetween(start, end);
  return { booked, nights, pct: nights > 0 ? Math.round((booked * 100) / nights) : 0 };
}

/** Count of non-cancelled stays arriving in [start, end), grouped by `keyOf`. */
export function arrivalsBy<T extends StayDates>(stays: T[], keyOf: (s: T) => string, start: ISODate, end: ISODate): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of stays) {
    if (s.status === 'cancelled' || s.check_in < start || s.check_in >= end) continue;
    const k = keyOf(s);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Sort a Map into rows, biggest first. */
export function ranked<K>(m: Map<K, number>): { key: K; value: number }[] {
  return [...m.entries()].map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
