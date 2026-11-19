/** New booking: the draft kept across the three steps, its checks and its payload. */
import type { BookingPayload, Language, PaymentMode, StayRow } from '@/data/types';
import { addDays, type ISODate } from '@/lib/dates';
import { normalizePhone } from '@/lib/phone';
import { computeStayTotals, type ChargeKind, type PricingMode, type StayPricing, type StayStatus, type StayTotals } from '@/lib/money';

export type BookingStatus = Extract<StayStatus, 'enquiry' | 'tentative' | 'confirmed'>;

export interface DraftLine {
  id: string;
  kind: ChargeKind;
  label: string;
  amount: number;
}

export interface Draft {
  phone: string;
  name: string;
  city: string;
  email: string;
  language: Language;
  foreign: boolean;
  nationality: string;
  /** The guest id the details were last filled from, so a re-lookup doesn't overwrite edits. */
  filledFrom: string | null;

  checkIn: ISODate;
  nights: number;
  guestsCount: number;
  driverRoom: boolean;
  status: BookingStatus;
  occasion: string | null;
  source: string | null;
  notes: string;

  pricingMode: PricingMode;
  nightlyRate: number | null;
  fixedAmount: number | null;
  rateTouched: boolean;
  lines: DraftLine[];

  advance: number | null;
  advanceMode: PaymentMode;
  advanceOn: ISODate;
}

/** PRD defaults: check-in today, 1 night, last nightly rate, 2 guests, UPI. */
export function newDraft(today: ISODate): Draft {
  return {
    phone: '',
    name: '',
    city: '',
    email: '',
    language: 'en',
    foreign: false,
    nationality: '',
    filledFrom: null,
    checkIn: today,
    nights: 1,
    guestsCount: 2,
    driverRoom: false,
    status: 'confirmed',
    occasion: null,
    source: null,
    notes: '',
    pricingMode: 'per_night',
    nightlyRate: null,
    fixedAmount: null,
    rateTouched: false,
    lines: [],
    advance: null,
    advanceMode: 'upi',
    advanceOn: today,
  };
}

export const checkOutOf = (d: Draft): ISODate => addDays(d.checkIn, d.nights);

/** The most recent per-night rate entered, or ₹5,000 for the very first booking. */
export function lastNightlyRate(stays: StayRow[] | undefined): number {
  const last = [...(stays ?? [])]
    .filter((s) => s.pricing_mode === 'per_night' && s.nightly_rate !== null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return last?.nightly_rate ?? 5000;
}

export function draftPricing(d: Draft): StayPricing {
  return {
    check_in: d.checkIn,
    check_out: checkOutOf(d),
    status: d.status,
    pricing_mode: d.pricingMode,
    nightly_rate: d.pricingMode === 'per_night' ? d.nightlyRate ?? 0 : null,
    fixed_amount: d.pricingMode === 'fixed' ? d.fixedAmount ?? 0 : null,
  };
}

/** Totals for the money bar, from money.ts like everywhere else. */
export function draftTotals(d: Draft): StayTotals {
  return computeStayTotals(draftPricing(d), d.lines, []);
}

export function guestStepError(d: Draft): string | null {
  if (!normalizePhone(d.phone)) return 'Enter a 10-digit phone number, or +country code for foreign numbers.';
  if (!d.name.trim()) return 'Enter the guest’s name.';
  if (d.foreign && !d.nationality.trim()) return 'Enter the nationality.';
  return null;
}

export function priceStepError(d: Draft): string | null {
  if (d.pricingMode === 'per_night' && d.nightlyRate === null) return 'Enter the rate per night.';
  if (d.pricingMode === 'fixed' && d.fixedAmount === null) return 'Enter the amount for the whole stay.';
  if (draftTotals(d).final < 0) return 'Discounts are more than the price.';
  return null;
}

export function toPayload(d: Draft, createdBy: string): BookingPayload {
  const phone = normalizePhone(d.phone);
  if (!phone) throw new Error('Invalid phone');
  const advance = d.advance ?? 0;
  return {
    created_by: createdBy,
    guest: {
      phone,
      name: d.name.trim(),
      city: d.city.trim() || null,
      email: d.email.trim() || null,
      language: d.language,
      nationality: d.foreign ? d.nationality.trim() : 'Indian',
    },
    stay: {
      check_in: d.checkIn,
      check_out: checkOutOf(d),
      guests_count: d.guestsCount,
      driver_room: d.driverRoom,
      status: d.status,
      pricing_mode: d.pricingMode,
      nightly_rate: d.pricingMode === 'per_night' ? d.nightlyRate : null,
      fixed_amount: d.pricingMode === 'fixed' ? d.fixedAmount : null,
      occasion: d.occasion,
      source: d.source,
      notes: d.notes.trim() || null,
    },
    charges: d.lines.map(({ kind, label, amount }) => ({ kind, label, amount })),
    advance: advance > 0 ? { amount: advance, mode: d.advanceMode, paid_on: d.advanceOn, reference: null } : null,
  };
}
