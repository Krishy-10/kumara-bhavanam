/**
 * The only module that talks to Supabase. Screens use the hooks in
 * ./hooks.ts, never this file directly. No money maths here: totals come
 * from the stay_totals view.
 */
import { getSupabase } from '@/lib/supabase';
import type { ISODate } from '@/lib/dates';
import { toAppError } from './errors';
import type { BlockedRow, BookingPayload, BookingResult, GuestRow, PaymentRow, StayRow } from './types';

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let res: { data: T | null; error: unknown };
  try {
    res = await p;
  } catch (e) {
    throw toAppError(e);
  }
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

/** Every stay with its guest and money, newest check-in first. */
export function fetchStays(): Promise<StayRow[]> {
  return unwrap(getSupabase().from('stay_totals').select('*').order('check_in', { ascending: false }));
}

/** Payments (any stay) dated within [start, end). */
export function fetchPaymentsBetween(start: ISODate, end: ISODate): Promise<PaymentRow[]> {
  return unwrap(getSupabase().from('payments').select('*').gte('paid_on', start).lt('paid_on', end));
}

export function fetchBlockedDates(): Promise<BlockedRow[]> {
  return unwrap(getSupabase().from('blocked_dates').select('*').order('start_date'));
}

export async function fetchGuestByPhone(phone: string): Promise<GuestRow | null> {
  const rows = await unwrap<GuestRow[]>(getSupabase().from('guests').select('*').eq('phone', phone).limit(1));
  return rows[0] ?? null;
}

/** Saves guest, stay, extras and advance in one all-or-nothing database call. */
export function createBooking(payload: BookingPayload): Promise<BookingResult> {
  return unwrap(getSupabase().rpc('create_booking', { p: payload }));
}
