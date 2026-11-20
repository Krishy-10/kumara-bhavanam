/**
 * "Add past stay": a stay from before the app was used, saved straight as
 * Completed with one payment for what was paid at the time. Goes through
 * create_booking like New booking, so the bill number, guest and referrer
 * rules are the same. Whole rupees only.
 */
import type { BookingPayload, PaymentMode } from '@/data/types';
import { addDays, isISODate, nightsBetween, type ISODate } from '@/lib/dates';
import { normalizePhone } from '@/lib/phone';
import { referrerError, referrerPayload } from '@/screens/NewBooking/draft';

export interface PastStay {
  phone: string;
  name: string;
  checkIn: ISODate;
  checkOut: ISODate;
  guestsCount: number;
  /** The whole stay's final amount. */
  total: number | null;
  /** What they paid; null or 0 means nothing recorded. */
  paid: number | null;
  paidOn: ISODate;
  mode: PaymentMode;
  occasion: string | null;
  sources: string[];
  referrerId: string | null;
  referrerName: string;
  referrerPhone: string;
  notes: string;
}

/** Starts as a two-night stay that ended yesterday, paid in full on check-out. */
export function newPastStay(today: ISODate): PastStay {
  const checkOut = addDays(today, -1);
  return {
    phone: '',
    name: '',
    checkIn: addDays(checkOut, -2),
    checkOut,
    guestsCount: 4,
    total: null,
    paid: null,
    paidOn: checkOut,
    mode: 'cash',
    occasion: null,
    sources: [],
    referrerId: null,
    referrerName: '',
    referrerPhone: '',
    notes: '',
  };
}

/** The first thing to fix, in screen order, or null when it can be saved. */
export function pastStayError(p: PastStay, today: ISODate): string | null {
  if (!normalizePhone(p.phone)) return 'Enter the guest’s phone number.';
  if (!p.name.trim()) return 'Enter the guest’s name.';
  if (!isISODate(p.checkIn) || !isISODate(p.checkOut)) return 'Pick both dates.';
  if (p.checkOut <= p.checkIn) return 'Check-out must be after check-in.';
  if (p.checkOut > today) return 'A past stay has to have ended by today. Use New booking for anything ahead.';
  if (p.total === null || p.total <= 0) return 'Enter the total for the stay.';
  if (p.paid !== null && p.paid > 0 && (!isISODate(p.paidOn) || p.paidOn > today)) return 'Pick the date they paid (today or earlier).';
  return referrerError(p);
}

export const pastNights = (p: PastStay) => (isISODate(p.checkIn) && isISODate(p.checkOut) ? nightsBetween(p.checkIn, p.checkOut) : 0);

export function pastStayPayload(p: PastStay, createdBy: string): BookingPayload {
  const phone = normalizePhone(p.phone);
  if (!phone) throw new Error('Invalid phone');
  return {
    created_by: createdBy,
    guest: { phone, name: p.name.trim(), city: null, email: null, language: 'en', nationality: 'Indian' },
    stay: {
      check_in: p.checkIn,
      check_out: p.checkOut,
      guests_count: p.guestsCount,
      status: 'completed',
      pricing_mode: 'fixed',
      nightly_rate: null,
      fixed_amount: p.total,
      occasion: p.occasion,
      sources: p.sources,
      notes: p.notes.trim() || null,
    },
    referrer: referrerPayload(p),
    charges: [],
    advance: p.paid && p.paid > 0 ? { amount: p.paid, mode: p.mode, paid_on: p.paidOn, reference: null, type: 'payment' } : null,
  };
}
