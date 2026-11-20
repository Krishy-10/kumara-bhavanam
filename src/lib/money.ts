/**
 * ALL money maths for the app lives here, and mirrors the Postgres views
 * `stay_totals` (latest: migrations/004; expenses: 006) and `stay_night_revenue` in supabase/migrations.
 * Change one, change the other, and update money.test.ts.
 *
 * Rules (PRD v1.3 "Money rules" + decisions of 19 Nov 2026):
 *   Base    = nightly_rate × nights  (per night)  or  fixed_amount  (fixed)
 *   Final   = Base + Σ charges − Σ discounts           (voided lines ignored)
 *   Balance = Final − Σ payments + Σ refunds           (voided rows ignored)
 *   A cancelled stay's balance is 0; whatever was kept stays in Collected.
 *   Negative balance = overpaid.
 *
 * Every amount is an integer number of rupees. Nothing here returns a fraction.
 */
import { assertRupees } from './format';
import { monthKey, monthRange, nightsBetween, nightsOf, type ISODate } from './dates';

export type StayStatus = 'enquiry' | 'tentative' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
export type PricingMode = 'per_night' | 'fixed';
export type ChargeKind = 'charge' | 'discount';
export type PaymentType = 'advance' | 'payment' | 'refund';

export interface StayPricing {
  check_in: ISODate;
  check_out: ISODate;
  status: StayStatus;
  pricing_mode: PricingMode;
  nightly_rate: number | null;
  fixed_amount: number | null;
}

export interface ChargeLine {
  kind: ChargeKind;
  amount: number; // always positive; kind decides the sign
  voided?: boolean;
}

export interface PaymentLine {
  type: PaymentType;
  amount: number; // always positive; type decides the sign
  paid_on: ISODate;
  voided: boolean;
}

export interface StayTotals {
  nights: number;
  base: number;
  charges: number;
  discounts: number;
  final: number;
  paid: number;
  refunded: number;
  /** paid − refunded */
  netPaid: number;
  /** Positive = still owed. Negative = overpaid. Always 0 for a cancelled stay. */
  balance: number;
}

/** Statuses whose dates are firmly taken (DB exclusion constraint). */
export const BLOCKING_STATUSES: readonly StayStatus[] = ['confirmed', 'checked_in'];
/** Statuses whose balance is due now and counts towards "To collect". */
export const DUE_NOW_STATUSES: readonly StayStatus[] = ['checked_in', 'completed'];
/** Statuses that count as booked revenue and occupancy in analytics. */
export const BOOKED_STATUSES: readonly StayStatus[] = ['confirmed', 'checked_in', 'completed'];

export function baseAmount(stay: StayPricing): number {
  const nights = nightsBetween(stay.check_in, stay.check_out);
  if (stay.pricing_mode === 'per_night') {
    const rate = stay.nightly_rate ?? 0;
    assertRupees(rate);
    return rate * nights;
  }
  const fixed = stay.fixed_amount ?? 0;
  assertRupees(fixed);
  return fixed;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function computeStayTotals(stay: StayPricing, charges: ChargeLine[], payments: PaymentLine[]): StayTotals {
  const live = <T extends { voided?: boolean }>(xs: T[]) => xs.filter((x) => !x.voided);
  [...charges, ...payments].forEach((x) => assertRupees(x.amount));

  const nights = nightsBetween(stay.check_in, stay.check_out);
  const base = baseAmount(stay);
  const chargeTotal = sum(live(charges).filter((c) => c.kind === 'charge').map((c) => c.amount));
  const discountTotal = sum(live(charges).filter((c) => c.kind === 'discount').map((c) => c.amount));
  const final = base + chargeTotal - discountTotal;

  const paid = sum(live(payments).filter((p) => p.type !== 'refund').map((p) => p.amount));
  const refunded = sum(live(payments).filter((p) => p.type === 'refund').map((p) => p.amount));
  const balance = stay.status === 'cancelled' ? 0 : final - paid + refunded;

  return { nights, base, charges: chargeTotal, discounts: discountTotal, final, paid, refunded, netPaid: paid - refunded, balance };
}

export type BalanceState =
  | { kind: 'due'; amount: number }
  | { kind: 'paid' }
  | { kind: 'overpaid'; amount: number };

/** How to show a balance: "Balance due ₹X", "Paid", or "Overpaid by ₹X". */
export function balanceState(balance: number): BalanceState {
  if (balance > 0) return { kind: 'due', amount: balance };
  if (balance < 0) return { kind: 'overpaid', amount: -balance };
  return { kind: 'paid' };
}

/**
 * The sum written out, for the New booking money bar and the bill:
 * "2 × ₹5,000 + ₹500 − ₹500" or "Fixed ₹40,000 + ₹1,000 − ₹1,000".
 */
export function totalBreakdown(stay: StayPricing, totals: Pick<StayTotals, 'nights' | 'charges' | 'discounts'>, fmt: (n: number) => string): string {
  const base =
    stay.pricing_mode === 'per_night' ? `${totals.nights} × ${fmt(stay.nightly_rate ?? 0)}` : `Fixed ${fmt(stay.fixed_amount ?? 0)}`;
  const plus = totals.charges > 0 ? ` + ${fmt(totals.charges)}` : '';
  const minus = totals.discounts > 0 ? ` − ${fmt(totals.discounts)}` : '';
  return `${base}${plus}${minus}`;
}

/** What is still to pay before arrival after an advance (New booking money bar). */
export function dueAfterAdvance(final: number, advance: number): number {
  assertRupees(final);
  assertRupees(advance);
  return final - advance;
}

export interface Collected {
  /** Payments and advances minus refunds, by payment date. */
  amount: number;
  /** Number of non-voided advance/payment rows in the range. */
  count: number;
}

/**
 * Money collected between `start` (inclusive) and `end` (exclusive), counted
 * by payment date regardless of stay dates or stay status.
 */
export function collectedBetween(payments: PaymentLine[], start: ISODate, end: ISODate): Collected {
  const inRange = payments.filter((p) => !p.voided && p.paid_on >= start && p.paid_on < end);
  inRange.forEach((p) => assertRupees(p.amount));
  const inflow = inRange.filter((p) => p.type !== 'refund');
  const outflow = inRange.filter((p) => p.type === 'refund');
  return { amount: sum(inflow.map((p) => p.amount)) - sum(outflow.map((p) => p.amount)), count: inflow.length };
}

/** A guest's "total spent": money actually received across all their stays, net of refunds. */
export function totalSpent(stays: { net_paid: number }[]): number {
  return sum(stays.map((s) => s.net_paid));
}

/** Home's "To collect": positive balances on stays that are checked in or completed. */
export function toCollect(stays: { status: StayStatus; balance: number }[]): number {
  return sum(stays.filter((s) => DUE_NOW_STATUSES.includes(s.status) && s.balance > 0).map((s) => s.balance));
}

/**
 * Splits a stay's final amount across its nights in whole rupees.
 * Every night gets trunc(final / nights); the leftover goes to the last night.
 * Mirrors integer division (`/` and `%`) in Postgres, which also truncates.
 */
export function splitAcrossNights(final: number, nights: number): number[] {
  assertRupees(final);
  if (nights <= 0) return [];
  const each = Math.trunc(final / nights);
  const leftover = final - each * nights;
  return Array.from({ length: nights }, (_, i) => (i === nights - 1 ? each + leftover : each));
}

/** Booked revenue for one stay, per night date. Empty for non-booked statuses. */
export function nightRevenue(stay: StayPricing, final: number): { night: ISODate; amount: number }[] {
  if (!BOOKED_STATUSES.includes(stay.status)) return [];
  const nights = nightsOf(stay.check_in, stay.check_out);
  const split = splitAcrossNights(final, nights.length);
  return nights.map((night, i) => ({ night, amount: split[i] ?? 0 }));
}

/** Booked revenue per month ('YYYY-MM' → rupees) for one stay. */
export function revenueByMonth(stay: StayPricing, final: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const { night, amount } of nightRevenue(stay, final)) {
    const key = monthKey(night);
    out.set(key, (out.get(key) ?? 0) + amount);
  }
  return out;
}

// ---- Analytics --------------------------------------------------------------
// Booked revenue is split by night (nightRevenue); cash is counted by paid_on
// (collectedBetween). Screens only filter rows and pick months; the sums are here.

/** Adds whole-rupee amounts. */
export function sumRupees(amounts: number[]): number {
  amounts.forEach(assertRupees);
  return sum(amounts);
}

type BookedStay = StayPricing & { final: number };

/** Booked revenue per month ('YYYY-MM'), for the given months only. */
export function bookedRevenueByMonth(stays: BookedStay[], months: string[]): Map<string, number> {
  const out = new Map<string, number>(months.map((m) => [m, 0]));
  for (const s of stays) {
    for (const [m, amount] of revenueByMonth(s, s.final)) {
      if (out.has(m)) out.set(m, out.get(m)! + amount);
    }
  }
  return out;
}

/** Booked revenue for nights in [start, end), grouped by `keyOf(stay)`. */
export function bookedRevenueBy<T extends BookedStay, K>(stays: T[], keyOf: (s: T) => K, start: ISODate, end: ISODate): Map<K, number> {
  const out = new Map<K, number>();
  for (const s of stays) {
    const inRange = nightRevenue(s, s.final).filter((n) => n.night >= start && n.night < end);
    if (inRange.length === 0) continue;
    const k = keyOf(s);
    out.set(k, (out.get(k) ?? 0) + sum(inRange.map((n) => n.amount)));
  }
  return out;
}

/** Cash collected per month by payment date (refunds subtract in their month). */
export function collectedByMonth(payments: PaymentLine[], months: string[]): Map<string, Collected> {
  return new Map(
    months.map((m) => {
      const { start, end } = monthRange(m);
      return [m, collectedBetween(payments, start, end)];
    }),
  );
}

/** The balance once one more payment, advance or refund is recorded (Add payment preview). */
export function balanceAfter(balance: number, type: PaymentType, amount: number): number {
  assertRupees(balance);
  assertRupees(amount);
  return type === 'refund' ? balance + amount : balance - amount;
}

// ---- Referrer commission (never on the guest's bill) ------------------------
// Mirrors the commission columns of stay_totals (migration 004):
//   commission      = the live commission's amount (0 if none)
//   commission_paid = its live payout (0 if none)
//   commission_owed = commission − commission_paid
// Commission never changes a stay's Final, Balance or booked revenue.

export interface CommissionLine {
  amount: number;
  voided: boolean;
}

export interface CommissionTotals {
  commission: number;
  paid: number;
  owed: number;
}

/** One stay's commission: its live commission and live payouts. */
export function commissionTotals(commissions: CommissionLine[], payouts: CommissionLine[]): CommissionTotals {
  [...commissions, ...payouts].forEach((x) => assertRupees(x.amount));
  const commission = sum(commissions.filter((c) => !c.voided).map((c) => c.amount));
  const paid = sum(payouts.filter((p) => !p.voided).map((p) => p.amount));
  return { commission, paid, owed: commission - paid };
}

export interface PayoutLine {
  amount: number;
  paid_on: ISODate;
  voided: boolean;
}

/** Commission paid to referrers between `start` (inclusive) and `end` (exclusive), by payout date. */
export function commissionPaidBetween(payouts: PayoutLine[], start: ISODate, end: ISODate): Collected {
  const inRange = payouts.filter((p) => !p.voided && p.paid_on >= start && p.paid_on < end);
  inRange.forEach((p) => assertRupees(p.amount));
  return { amount: sum(inRange.map((p) => p.amount)), count: inRange.length };
}

// ---- Ledger -------------------------------------------------------------------

export interface LedgerStay {
  status: StayStatus;
  final: number;
  net_paid: number;
  balance: number;
  commission: number;
  commission_owed: number;
}

export interface LedgerSummary {
  /** Bookings that are not cancelled. */
  count: number;
  /** Σ final of bookings that are not cancelled (cancelled stays count for nothing). */
  booked: number;
  /** Σ net_paid of every stay, cancelled included (money kept still counts). */
  received: number;
  /** Σ positive balances on checked-in and completed stays (as Home's To collect). */
  toCollect: number;
  /** Σ positive balances on stays not yet arrived (confirmed, tentative, enquiry). */
  dueAhead: number;
  /** Σ commission still owed to referrers. */
  commissionOwed: number;
}

export function ledgerSummary(stays: LedgerStay[]): LedgerSummary {
  stays.forEach((s) => [s.final, s.net_paid, s.balance, s.commission, s.commission_owed].forEach(assertRupees));
  const live = stays.filter((s) => s.status !== 'cancelled');
  return {
    count: live.length,
    booked: sum(live.map((s) => s.final)),
    received: sum(stays.map((s) => s.net_paid)),
    toCollect: toCollect(stays),
    dueAhead: sum(live.filter((s) => !DUE_NOW_STATUSES.includes(s.status) && s.balance > 0).map((s) => s.balance)),
    commissionOwed: sum(stays.map((s) => s.commission_owed)),
  };
}

export interface ReferrerStay {
  referrer_id: string | null;
  status: StayStatus;
  commission: number;
  commission_paid: number;
  commission_owed: number;
}

export interface ReferrerTotals {
  referrerId: string;
  /** Bookings they sent that are not cancelled. */
  bookings: number;
  commission: number;
  paid: number;
  owed: number;
}

/** Per referrer: bookings sent and commission totals. Most owed first, then most bookings. */
export function referrerTotals(stays: ReferrerStay[]): ReferrerTotals[] {
  const by = new Map<string, ReferrerTotals>();
  for (const s of stays) {
    if (!s.referrer_id) continue;
    [s.commission, s.commission_paid, s.commission_owed].forEach(assertRupees);
    const t = by.get(s.referrer_id) ?? { referrerId: s.referrer_id, bookings: 0, commission: 0, paid: 0, owed: 0 };
    if (s.status !== 'cancelled') t.bookings += 1;
    t.commission += s.commission;
    t.paid += s.commission_paid;
    t.owed += s.commission_owed;
    by.set(s.referrer_id, t);
  }
  return [...by.values()].sort((a, b) => b.owed - a.owed || b.bookings - a.bookings);
}

// ---- Expenses (migration 006; never on a guest's bill) ------------------------
// Counted by paid_on, like Collected. Voided rows count for nothing.
//   Spent             = Σ live expenses paid in the range
//   Left after costs  = Collected − Spent − commission paid, all by date paid

export interface ExpenseLine {
  amount: number;
  paid_on: ISODate;
  voided: boolean;
  category: string;
}

/** Money spent between `start` (inclusive) and `end` (exclusive), by the day it was paid. */
export function expensesBetween(expenses: ExpenseLine[], start: ISODate, end: ISODate): Collected {
  const inRange = expenses.filter((e) => !e.voided && e.paid_on >= start && e.paid_on < end);
  inRange.forEach((e) => assertRupees(e.amount));
  return { amount: sum(inRange.map((e) => e.amount)), count: inRange.length };
}

/** Spent per category in [start, end), biggest first. */
export function expensesByCategory(expenses: ExpenseLine[], start: ISODate, end: ISODate): { category: string; amount: number }[] {
  const by = new Map<string, number>();
  for (const e of expenses) {
    if (e.voided || e.paid_on < start || e.paid_on >= end) continue;
    assertRupees(e.amount);
    by.set(e.category, (by.get(e.category) ?? 0) + e.amount);
  }
  return [...by.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount || (a.category < b.category ? -1 : 1));
}

/** Spent per month ('YYYY-MM'), for the given months only. */
export function expensesByMonth(expenses: ExpenseLine[], months: string[]): Map<string, number> {
  return new Map(
    months.map((m) => {
      const { start, end } = monthRange(m);
      return [m, expensesBetween(expenses, start, end).amount];
    }),
  );
}

/** What's left of the cash collected once the house's costs and referrers are paid. Can be negative. */
export function leftAfterCosts(collected: number, spent: number, commissionPaid: number): number {
  [collected, spent, commissionPaid].forEach(assertRupees);
  return collected - spent - commissionPaid;
}
