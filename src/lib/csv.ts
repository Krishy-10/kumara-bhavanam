/**
 * CSV export for the Ledger: bookings (one row per stay) and payments (one row
 * per payment, voided ones included and marked). Amounts are plain whole
 * rupees (no ₹, no commas) so a spreadsheet can add them up. Every figure comes
 * straight from stay_totals or the payments table; nothing is worked out here.
 * Never includes ID details.
 */
import type { ExpenseRow, PaymentRow, StayRow } from '@/data/types';
import { istDate } from './dates';
import { formatPhone } from './phone';
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL, STATUS_LABEL } from './labels';

type Cell = string | number | boolean | null | undefined;

/**
 * One cell. Quotes when needed, and stops a spreadsheet treating text that
 * starts with = + - @ as a formula (a guest name or note could).
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Whole file: a byte-order mark (so Excel reads ₹ and Tamil), header row, CRLF lines. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export const BOOKING_COLUMNS = [
  'Bill no',
  'Guest',
  'Phone',
  'Check-in',
  'Check-out',
  'Nights',
  'Guests',
  'Status',
  'Pricing',
  'Rate per night',
  'Base',
  'Extras',
  'Discounts',
  'Final',
  'Paid',
  'Refunded',
  'Net paid',
  'Balance',
  'How they found us',
  'Referred by',
  'Commission',
  'Commission paid',
  'Commission owed',
  'Occasion',
  'Notes',
  'Entered by',
  'Entered on',
] as const;

export function bookingsCsv(stays: StayRow[]): string {
  const rows = [...stays]
    .sort((a, b) => (a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : a.bill_no < b.bill_no ? -1 : 1))
    .map((s) => [
      s.bill_no,
      s.guest_name,
      // "91 98431 12345": spaced so a spreadsheet keeps it as text, no leading + to escape.
      formatPhone(s.guest_phone).replace(/^\+/, ''),
      s.check_in,
      s.check_out,
      s.nights,
      s.guests_count,
      STATUS_LABEL[s.status],
      s.pricing_mode === 'per_night' ? 'Per night' : 'Fixed',
      s.nightly_rate,
      s.base,
      s.charges,
      s.discounts,
      s.final,
      s.paid,
      s.refunded,
      s.net_paid,
      s.balance,
      s.sources.join('; '),
      s.referrer_name,
      s.commission,
      s.commission_paid,
      s.commission_owed,
      s.occasion,
      s.notes,
      s.created_by,
      istDate(s.created_at),
    ]);
  return toCsv([...BOOKING_COLUMNS], rows);
}

export const PAYMENT_COLUMNS = ['Date paid', 'Bill no', 'Guest', 'Type', 'Mode', 'Amount', 'Reference', 'Voided', 'Void reason', 'Entered by'] as const;

export function paymentsCsv(payments: PaymentRow[], stays: StayRow[]): string {
  const stay = new Map(stays.map((s) => [s.stay_id, s]));
  const rows = [...payments]
    .sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : a.created_at < b.created_at ? -1 : 1))
    .map((p) => [
      p.paid_on,
      stay.get(p.stay_id)?.bill_no,
      stay.get(p.stay_id)?.guest_name,
      PAYMENT_TYPE_LABEL[p.type],
      PAYMENT_MODE_LABEL[p.mode],
      p.amount,
      p.reference,
      p.voided,
      p.void_reason,
      p.created_by,
    ]);
  return toCsv([...PAYMENT_COLUMNS], rows);
}

export const EXPENSE_COLUMNS = ['Date paid', 'For', 'Note', 'Mode', 'Amount', 'Stay bill no', 'Stay guest', 'Voided', 'Void reason', 'Entered by'] as const;

/** One row per expense by date paid, voided ones included and marked. Expenses are never on a guest's bill. */
export function expensesCsv(expenses: ExpenseRow[], stays: StayRow[]): string {
  const stay = new Map(stays.map((s) => [s.stay_id, s]));
  const rows = [...expenses]
    .sort((a, b) => (a.paid_on < b.paid_on ? -1 : a.paid_on > b.paid_on ? 1 : a.created_at < b.created_at ? -1 : 1))
    .map((e) => [
      e.paid_on,
      e.category,
      e.note,
      PAYMENT_MODE_LABEL[e.mode],
      e.amount,
      e.stay_id ? stay.get(e.stay_id)?.bill_no : null,
      e.stay_id ? stay.get(e.stay_id)?.guest_name : null,
      e.voided,
      e.void_reason,
      e.created_by,
    ]);
  return toCsv([...EXPENSE_COLUMNS], rows);
}

/** "Kumara Bhavanam bookings 2026-11-21.csv" */
export const csvFileName = (what: 'bookings' | 'payments' | 'expenses', today: string) => `Kumara Bhavanam ${what} ${today}.csv`;
