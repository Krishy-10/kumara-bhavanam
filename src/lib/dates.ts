/**
 * Dates as ISO strings ('YYYY-MM-DD'), the same shape Postgres `date` columns
 * return. Arithmetic is done on whole UTC days, so the phone's own time zone
 * never shifts a date. "Today" is always Asia/Kolkata.
 *
 * Stay ranges are half-open: check_in is included, check_out is not.
 */
export type ISODate = string;

const IST = 'Asia/Kolkata';
const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toEpochDay(d: ISODate): number {
  const m = ISO_RE.exec(d);
  if (!m) throw new Error(`Not an ISO date: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** A real calendar date in 'YYYY-MM-DD' form ('2026-02-30' is not). */
export function isISODate(d: unknown): d is ISODate {
  if (typeof d !== 'string' || !ISO_RE.test(d)) return false;
  const day = toEpochDay(d);
  return Number.isFinite(day) && fromEpochDay(day) === d;
}

function fromEpochDay(day: number): ISODate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in Asia/Kolkata, whatever zone the phone is set to. */
export function todayIST(now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Nights in a half-open stay: check_out minus check_in. */
export function nightsBetween(checkIn: ISODate, checkOut: ISODate): number {
  return toEpochDay(checkOut) - toEpochDay(checkIn);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(d) + n);
}

/** Every night of a stay, check_in .. check_out − 1. */
export function nightsOf(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const start = toEpochDay(checkIn);
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => fromEpochDay(start + i));
}

/** Half-open overlap: [a1, a2) and [b1, b2). */
export function rangesOverlap(a1: ISODate, a2: ISODate, b1: ISODate, b2: ISODate): boolean {
  return a1 < b2 && b1 < a2;
}

/** 'YYYY-MM' of a date. */
export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

/** First day and the day after the last day of a month: a half-open range. */
export function monthRange(month: string): { start: ISODate; end: ISODate } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const start = fromEpochDay(Date.UTC(y, m - 1, 1) / DAY_MS);
  const end = fromEpochDay(Date.UTC(y, m, 1) / DAY_MS);
  return { start, end };
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon0(d: ISODate): number {
  return (new Date(toEpochDay(d) * DAY_MS).getUTCDay() + 6) % 7;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts });
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const weekdayLong = fmt({ weekday: 'long', day: 'numeric', month: 'short' });
const weekdayShort = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const monthYear = fmt({ month: 'long', year: 'numeric' });

const asDate = (d: ISODate) => new Date(toEpochDay(d) * DAY_MS);

/** "19 Nov" */
export const formatDayMonth = (d: ISODate) => dayMonth.format(asDate(d));
/** "Thursday, 19 Nov" */
export const formatLongDay = (d: ISODate) => weekdayLong.format(asDate(d));
/** "Sun, 22 Nov" */
export const formatShortDay = (d: ISODate) => weekdayShort.format(asDate(d));
/** "November 2026" */
export const formatMonthYear = (month: string) => monthYear.format(asDate(`${month}-01`));

/** "14 to 22 Nov", "30 Oct to 2 Nov" */
export function formatRange(start: ISODate, end: ISODate): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${Number(start.slice(8))} to ${formatDayMonth(end)}`;
  }
  return `${formatDayMonth(start)} to ${formatDayMonth(end)}`;
}

/** True for a wall-clock time "HH:MM" (as an <input type="time"> gives it). */
export const isTime = (t: unknown): t is string => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

/** A database time ("06:30:00") as "HH:MM" for a time input; '' for none. */
export const timeInput = (t: string | null | undefined): string => (t ? t.slice(0, 5) : '');

/** "6:30 am", "12 noon", "4 pm"; null for no time. Expected times are IST wall clock. */
export function formatTime(t: string | null | undefined): string | null {
  if (!t || !/^\d{2}:\d{2}/.test(t)) return null;
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  if (h === 12 && m === '00') return '12 noon';
  if (h === 0 && m === '00') return '12 midnight';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'am' : 'pm'}`;
}

/** The IST calendar date of a database timestamp (created_at, checked_at). */
export function istDate(timestamp: string): ISODate {
  return todayIST(new Date(timestamp));
}

/** 'YYYY-MM' moved by n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Months from `from` to `to` inclusive, as 'YYYY-MM'. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

const monthShortYear = fmt({ month: 'short', year: 'numeric' });
/** "Nov 2026" */
export const formatMonthShort = (month: string) => monthShortYear.format(asDate(`${month}-01`));
