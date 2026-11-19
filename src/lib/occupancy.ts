/**
 * Who is on the floor, who comes next and when the floor is free.
 * Pure date logic, no money. Stay ranges are half-open [check_in, check_out);
 * blocked dates include both ends.
 */
import { addDays, nightsBetween, rangesOverlap, type ISODate } from './dates';
import { BLOCKING_STATUSES, type StayStatus } from './money';

export interface StayDates {
  stay_id: string;
  check_in: ISODate;
  check_out: ISODate;
  status: StayStatus;
}

export interface BlockedRange {
  start_date: ISODate;
  end_date: ISODate; // included
  reason: string;
}

interface Range {
  start: ISODate;
  end: ISODate; // excluded
}

/** Blocked dates as a half-open range: 28–29 Nov → [28 Nov, 30 Nov). */
export function blockedAsRange(b: BlockedRange): Range {
  return { start: b.start_date, end: addDays(b.end_date, 1) };
}

/** Ranges the floor can't be booked: confirmed / checked-in stays and blocked dates. */
export function occupiedRanges(stays: StayDates[], blocked: BlockedRange[]): Range[] {
  return [
    ...stays.filter((s) => BLOCKING_STATUSES.includes(s.status)).map((s) => ({ start: s.check_in, end: s.check_out })),
    ...blocked.map(blockedAsRange),
  ].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** The stay on the floor tonight (checked in, or confirmed and due today). */
export function currentStay<T extends StayDates>(stays: T[], today: ISODate): T | undefined {
  const tonight = stays.filter(
    (s) => BLOCKING_STATUSES.includes(s.status) && s.check_in <= today && today < s.check_out,
  );
  return tonight.find((s) => s.status === 'checked_in') ?? tonight[0];
}

/** The next confirmed or tentative arrival after today (or after the current stay). */
export function nextArrival<T extends StayDates>(stays: T[], today: ISODate, current?: T): T | undefined {
  return stays
    .filter((s) => (s.status === 'confirmed' || s.status === 'tentative') && s.check_in >= today && s.stay_id !== current?.stay_id)
    .sort((a, b) => (a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : 0))[0];
}

/**
 * The first free stretch from today. `until` is the first date that is taken
 * again (null if nothing is booked after it). Free 22 to 24 Nov means the
 * nights of the 22nd and 23rd are free.
 */
export function nextFreeWindow(occupied: Range[], today: ISODate): { from: ISODate; until: ISODate | null } {
  let from = today;
  let moved = true;
  while (moved) {
    moved = false;
    for (const r of occupied) {
      if (r.start <= from && from < r.end) {
        from = r.end;
        moved = true;
      }
    }
  }
  const until = occupied.filter((r) => r.start > from).map((r) => r.start).sort()[0] ?? null;
  return { from, until };
}

/** Night dots on the current-stay card. `tonight` is 1-based. */
export function nightProgress(checkIn: ISODate, checkOut: ISODate, today: ISODate): { total: number; tonight: number } {
  const total = nightsBetween(checkIn, checkOut);
  const tonight = Math.min(total, Math.max(1, nightsBetween(checkIn, today) + 1));
  return { total, tonight };
}

export interface Conflicts<T extends StayDates, B extends BlockedRange = BlockedRange> {
  /** Confirmed or checked-in stays on these dates: booking is blocked. */
  hard: T[];
  /** Tentative stays on these dates: warn only. */
  tentative: T[];
  /** Blocked dates on these nights: warn only. */
  blocked: B[];
}

/** What already sits on [checkIn, checkOut). */
export function findConflicts<T extends StayDates, B extends BlockedRange>(
  stays: T[],
  blocked: B[],
  checkIn: ISODate,
  checkOut: ISODate,
  excludeStayId?: string,
): Conflicts<T, B> {
  const overlapping = stays.filter(
    (s) => s.stay_id !== excludeStayId && rangesOverlap(s.check_in, s.check_out, checkIn, checkOut),
  );
  return {
    hard: overlapping.filter((s) => BLOCKING_STATUSES.includes(s.status)),
    tentative: overlapping.filter((s) => s.status === 'tentative'),
    blocked: blocked.filter((b) => {
      const r = blockedAsRange(b);
      return rangesOverlap(r.start, r.end, checkIn, checkOut);
    }),
  };
}
