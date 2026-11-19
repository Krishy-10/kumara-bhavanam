/**
 * The bill, laid out once (billModel) and rendered two ways: the PDF
 * (billPdf.ts) and plain text (the share fallback). Every amount comes from
 * the stay_totals row or a single saved line; this file adds nothing up.
 * Never includes any ID detail. Titled "Bill", no GST.
 */
import type { ChargeRow, PaymentRow, SettingsRow, StayRow } from '@/data/types';
import { formatDayMonth, formatRange, type ISODate } from './dates';
import { formatRupees, formatSigned } from './format';
import { PAYMENT_MODE_LABEL, PAYMENT_TYPE_LABEL, plural } from './labels';
import { balanceState } from './money';
import { formatPhone } from './phone';

export interface BillLine {
  label: string;
  amount: string;
  muted?: boolean;
}

export type StampTone = 'paid' | 'due' | 'cancelled';

export interface BillModel {
  propertyName: string;
  /** "First floor, Tirunelveli · +91 00000 00000", or '' when neither is set. */
  contact: string;
  billNo: string;
  /** "19 Nov 2026" */
  billDate: string;
  guestName: string;
  guestPhone: string;
  /** "14 to 22 Nov 2026 · 8 nights · 8 guests" */
  stayLine: string;
  /** Accommodation, then each live charge and discount. */
  lines: BillLine[];
  total: string;
  /** Live payments and refunds, oldest first. */
  payments: BillLine[];
  stamp: string;
  stampTone: StampTone;
  thanks: string;
}

/** "Whole floor, 8 nights × ₹5,000" or "Whole floor, 8 nights (fixed)". */
export function accommodationLabel(stay: Pick<StayRow, 'nights' | 'pricing_mode' | 'nightly_rate'>): string {
  const nights = plural(stay.nights, 'night');
  return stay.pricing_mode === 'per_night'
    ? `Whole floor, ${nights} × ${formatRupees(stay.nightly_rate ?? 0)}`
    : `Whole floor, ${nights} (fixed)`;
}

/** The stamp at the foot of the bill. */
export function billStamp(stay: Pick<StayRow, 'status' | 'balance'>): string {
  if (stay.status === 'cancelled') return 'CANCELLED';
  const b = balanceState(stay.balance);
  if (b.kind === 'paid') return 'PAID';
  if (b.kind === 'overpaid') return `OVERPAID BY ${formatRupees(b.amount)}`;
  return `BALANCE DUE ${formatRupees(b.amount)}`;
}

export function stampTone(stay: Pick<StayRow, 'status' | 'balance'>): StampTone {
  if (stay.status === 'cancelled') return 'cancelled';
  return balanceState(stay.balance).kind === 'paid' ? 'paid' : 'due';
}

export function paymentLabel(p: Pick<PaymentRow, 'type' | 'mode'>): string {
  return `${PAYMENT_TYPE_LABEL[p.type]} · ${PAYMENT_MODE_LABEL[p.mode]}`;
}

const withYear = (d: ISODate) => `${formatDayMonth(d)} ${d.slice(0, 4)}`;

export function billModel(
  stay: StayRow,
  charges: ChargeRow[],
  payments: PaymentRow[],
  settings: SettingsRow,
  billDate: ISODate,
): BillModel {
  const lines: BillLine[] = [{ label: accommodationLabel(stay), amount: formatRupees(stay.base) }];
  for (const c of charges.filter((c) => !c.voided)) {
    lines.push(
      c.kind === 'charge'
        ? { label: c.label, amount: formatSigned(c.amount, '+') }
        : { label: `Discount (${c.label})`, amount: formatSigned(c.amount, '−') },
    );
  }
  return {
    propertyName: settings.property_name,
    contact: [settings.address, settings.contact_phone].filter(Boolean).join(' · '),
    billNo: stay.bill_no,
    billDate: withYear(billDate),
    guestName: stay.guest_name,
    guestPhone: formatPhone(stay.guest_phone),
    stayLine: `${formatRange(stay.check_in, stay.check_out)} ${stay.check_out.slice(0, 4)} · ${plural(stay.nights, 'night')} · ${plural(stay.guests_count, 'guest')}`,
    lines,
    total: formatRupees(stay.final),
    payments: payments
      .filter((p) => !p.voided)
      .map((p) => ({
        label: `${formatDayMonth(p.paid_on)} · ${paymentLabel(p)}`,
        amount: p.type === 'refund' ? formatSigned(p.amount, '−') : formatRupees(p.amount),
      })),
    stamp: billStamp(stay),
    stampTone: stampTone(stay),
    thanks: `Thank you for staying at ${settings.property_name}.`,
  };
}

export function billText(m: BillModel): string {
  const out: string[] = [m.propertyName];
  if (m.contact) out.push(m.contact);
  out.push('', `BILL ${m.billNo}`, `Date: ${m.billDate}`, '');
  out.push(`Guest: ${m.guestName}, ${m.guestPhone}`, `Stay: ${m.stayLine}`, '');
  for (const l of m.lines) out.push(`${l.label}: ${l.amount}`);
  out.push(`TOTAL: ${m.total}`);
  if (m.payments.length > 0) {
    out.push('', 'Payments');
    for (const p of m.payments) out.push(`${p.label}: ${p.amount}`);
  }
  out.push('', m.stamp, '', m.thanks);
  return out.join('\n');
}

/** "Bill KB-2026-0041.pdf" */
export function billFileName(billNo: string): string {
  return `Bill ${billNo}.pdf`;
}
