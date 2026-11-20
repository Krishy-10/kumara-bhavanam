import { describe, expect, it } from 'vitest';
import {
  balanceAfter,
  balanceState,
  bookedRevenueBy,
  bookedRevenueByMonth,
  collectedBetween,
  collectedByMonth,
  commissionPaidBetween,
  commissionTotals,
  computeStayTotals,
  dueAfterAdvance,
  ledgerSummary,
  referrerTotals,
  revenueByMonth,
  splitAcrossNights,
  toCollect,
  type ChargeLine,
  type PaymentLine,
  type StayPricing,
  type StayStatus,
} from './money';
import { monthRange } from './dates';

const perNight = (rate: number, check_in = '2026-11-24', check_out = '2026-11-26'): StayPricing => ({
  check_in,
  check_out,
  status: 'confirmed',
  pricing_mode: 'per_night',
  nightly_rate: rate,
  fixed_amount: null,
});

const pay = (amount: number, paid_on: string, type: PaymentLine['type'] = 'payment', voided = false): PaymentLine => ({
  amount,
  paid_on,
  type,
  voided,
});

describe('base price', () => {
  it('per night: rate × nights (half-open dates)', () => {
    const t = computeStayTotals(perNight(5000), [], []);
    expect(t.nights).toBe(2);
    expect(t.base).toBe(10_000);
    expect(t.final).toBe(10_000);
    expect(t.balance).toBe(10_000);
  });

  it('fixed: the agreed amount, whatever the nights', () => {
    const stay: StayPricing = { ...perNight(0, '2026-11-14', '2026-11-22'), pricing_mode: 'fixed', nightly_rate: null, fixed_amount: 40_000 };
    const t = computeStayTotals(stay, [], []);
    expect(t.nights).toBe(8);
    expect(t.base).toBe(40_000);
  });

  it('rejects fractional money', () => {
    expect(() => computeStayTotals(perNight(4999.5), [], [])).toThrow(/whole rupees/);
    expect(() => computeStayTotals(perNight(5000), [{ kind: 'charge', amount: 10.25 }], [])).toThrow();
  });
});

describe('charges and discounts', () => {
  const lines: ChargeLine[] = [
    { kind: 'charge', amount: 500 },
    { kind: 'charge', amount: 300 },
    { kind: 'discount', amount: 500 },
  ];

  it('adds charges and subtracts discounts', () => {
    const t = computeStayTotals(perNight(5000), lines, []);
    expect(t.charges).toBe(800);
    expect(t.discounts).toBe(500);
    expect(t.final).toBe(10_300);
  });

  it('ignores voided charge lines', () => {
    const t = computeStayTotals(perNight(5000), [...lines, { kind: 'charge', amount: 9999, voided: true }], []);
    expect(t.final).toBe(10_300);
  });
});

describe('payments', () => {
  it('voided payments count for nothing', () => {
    const t = computeStayTotals(perNight(5000), [], [pay(2000, '2026-11-10', 'advance'), pay(2000, '2026-11-10', 'advance', true)]);
    expect(t.paid).toBe(2000);
    expect(t.balance).toBe(8000);
  });

  it('refunds add back to the balance', () => {
    const t = computeStayTotals(perNight(5000), [], [pay(12_000, '2026-11-24'), pay(2000, '2026-11-26', 'refund')]);
    expect(t.paid).toBe(12_000);
    expect(t.refunded).toBe(2000);
    expect(t.netPaid).toBe(10_000);
    expect(t.balance).toBe(0);
    expect(balanceState(t.balance)).toEqual({ kind: 'paid' });
  });

  it('overpayment gives a negative balance shown as "Overpaid by"', () => {
    const t = computeStayTotals(perNight(5000), [], [pay(11_500, '2026-11-24')]);
    expect(t.balance).toBe(-1500);
    expect(balanceState(t.balance)).toEqual({ kind: 'overpaid', amount: 1500 });
  });

  it('a cancelled stay has balance 0 even with an advance kept', () => {
    const t = computeStayTotals({ ...perNight(5000), status: 'cancelled' }, [], [pay(2000, '2026-11-10', 'advance')]);
    expect(t.balance).toBe(0);
    expect(t.netPaid).toBe(2000);
  });

  it('due after advance on the New booking money bar', () => {
    expect(dueAfterAdvance(10_000, 2000)).toBe(8000);
  });
});

describe('collected by payment date', () => {
  const nov = monthRange('2026-11');
  it('counts by paid_on, nets refunds, skips voided rows', () => {
    const c = collectedBetween(
      [
        pay(13_500, '2026-10-30'), // October: not counted
        pay(10_000, '2026-11-02', 'advance'),
        pay(25_000, '2026-11-14'),
        pay(25_000, '2026-11-14', 'payment', true),
        pay(1000, '2026-11-15', 'refund'),
        pay(500, '2026-12-01'), // December: not counted (end is exclusive)
      ],
      nov.start,
      nov.end,
    );
    expect(c).toEqual({ amount: 34_000, count: 2 });
  });
});

describe('analytics night split', () => {
  it('splits in whole rupees with the leftover on the last night', () => {
    expect(splitAcrossNights(10_000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitAcrossNights(10_000, 3).reduce((a, b) => a + b)).toBe(10_000);
    expect(splitAcrossNights(9000, 0)).toEqual([]);
  });

  it('a stay across a month end puts each night in its own month', () => {
    // Meena: 30 Oct to 2 Nov, 3 nights at ₹4,500.
    const stay = { ...perNight(4500, '2026-10-30', '2026-11-02'), status: 'completed' as const };
    const m = revenueByMonth(stay, 13_500);
    expect(m.get('2026-10')).toBe(9000);
    expect(m.get('2026-11')).toBe(4500);
  });

  it('cancelled, tentative and enquiry stays earn nothing', () => {
    for (const status of ['cancelled', 'tentative', 'enquiry'] as const) {
      expect(revenueByMonth({ ...perNight(5000), status }, 10_000).size).toBe(0);
    }
  });
});

/**
 * The four stays from supabase/seed.sql (PRD "Demo sample data").
 * Keep in step with the seed file.
 */
describe('demo seed (today = 19 Nov 2026)', () => {
  const lakshmi = {
    stay: { check_in: '2026-11-14', check_out: '2026-11-22', status: 'checked_in', pricing_mode: 'fixed', nightly_rate: null, fixed_amount: 40_000 } as StayPricing,
    charges: [
      { kind: 'charge', amount: 1000 },
      { kind: 'discount', amount: 1000 },
    ] as ChargeLine[],
    payments: [pay(10_000, '2026-11-02', 'advance'), pay(25_000, '2026-11-14'), pay(25_000, '2026-11-14', 'payment', true)],
  };
  const priya = {
    stay: { ...perNight(5000, '2026-11-24', '2026-11-26'), status: 'confirmed' } as StayPricing,
    charges: [
      { kind: 'charge', amount: 500 },
      { kind: 'discount', amount: 500 },
    ] as ChargeLine[],
    payments: [pay(2000, '2026-11-10', 'advance')],
  };
  const ravi = { stay: { ...perNight(5000, '2026-12-04', '2026-12-06'), status: 'tentative' } as StayPricing, charges: [], payments: [] };
  const meena = {
    stay: { ...perNight(4500, '2026-10-30', '2026-11-02'), status: 'completed' } as StayPricing,
    charges: [],
    payments: [pay(13_500, '2026-10-30')],
  };
  const all = [lakshmi, priya, ravi, meena];
  const totals = all.map((s) => ({ status: s.stay.status, ...computeStayTotals(s.stay, s.charges, s.payments) }));

  it('Lakshmi Narayanan: final ₹40,000, paid ₹35,000, balance ₹5,000', () => {
    const t = totals[0]!;
    expect(t.final).toBe(40_000);
    expect(t.paid).toBe(35_000);
    expect(t.balance).toBe(5000);
  });

  it('Priya Sundaram: ₹10,000 total, ₹8,000 due on arrival', () => {
    expect(totals[1]!.final).toBe(10_000);
    expect(totals[1]!.balance).toBe(8000);
  });

  it('Meena Venkatesh is paid in full', () => {
    expect(totals[3]!.balance).toBe(0);
  });

  it('Home: ₹37,000 collected in November from 3 payments', () => {
    const nov = monthRange('2026-11');
    expect(collectedBetween(all.flatMap((s) => s.payments), nov.start, nov.end)).toEqual({ amount: 37_000, count: 3 });
  });

  it('Home: ₹5,000 to collect', () => {
    expect(toCollect(totals)).toBe(5000);
  });
});

describe('analytics sums', () => {
  // 3 nights across a month end: 30 Nov, 1 Dec, 2 Dec. ₹10,000 → 3,333 / 3,333 / 3,334.
  const across = { ...perNight(0, '2026-11-30', '2026-12-03'), pricing_mode: 'fixed' as const, fixed_amount: 10000, final: 10000, occasion: 'Sashti' };
  const tentative = { ...perNight(5000), status: 'tentative' as const, final: 10000, occasion: 'Wedding' };
  const cancelled = { ...perNight(5000), status: 'cancelled' as const, final: 10000, occasion: 'Wedding' };

  it('splits booked revenue by night into months, ignoring tentative and cancelled', () => {
    const m = bookedRevenueByMonth([across, tentative, cancelled], ['2026-11', '2026-12']);
    expect(m.get('2026-11')).toBe(3333);
    expect(m.get('2026-12')).toBe(6667);
  });

  it('groups booked revenue by a key within a date range', () => {
    const m = bookedRevenueBy([across], (s) => s.occasion, '2026-12-01', '2027-01-01');
    expect(m.get('Sashti')).toBe(6667);
  });

  it('counts cash by payment month, refunds in the month paid out', () => {
    const m = collectedByMonth([pay(5000, '2026-11-02'), pay(2000, '2026-12-05', 'refund'), pay(900, '2026-12-06', 'payment', true)], ['2026-11', '2026-12']);
    expect(m.get('2026-11')).toEqual({ amount: 5000, count: 1 });
    expect(m.get('2026-12')).toEqual({ amount: -2000, count: 0 });
  });
});

describe('balanceAfter', () => {
  it('payments lower the balance, refunds raise it', () => {
    expect(balanceAfter(5000, 'payment', 5000)).toBe(0);
    expect(balanceAfter(5000, 'advance', 6000)).toBe(-1000);
    expect(balanceAfter(-1000, 'refund', 1000)).toBe(0);
  });
});

describe('referrer commission (mirrors stay_totals, migration 004)', () => {
  it('counts the live commission and its live payout; voided rows count for nothing', () => {
    expect(commissionTotals([], [])).toEqual({ commission: 0, paid: 0, owed: 0 });
    expect(commissionTotals([{ amount: 500, voided: false }], [])).toEqual({ commission: 500, paid: 0, owed: 500 });
    expect(commissionTotals([{ amount: 500, voided: false }], [{ amount: 500, voided: false }])).toEqual({ commission: 500, paid: 500, owed: 0 });
    expect(
      commissionTotals(
        [
          { amount: 750, voided: true },
          { amount: 600, voided: false },
        ],
        [{ amount: 750, voided: true }],
      ),
    ).toEqual({ commission: 600, paid: 0, owed: 600 });
  });

  it('refuses fractions', () => {
    expect(() => commissionTotals([{ amount: 500.5, voided: false }], [])).toThrow();
  });

  it('counts commission paid by payout date', () => {
    const payouts = [
      { amount: 500, paid_on: '2025-12-27', voided: false },
      { amount: 700, paid_on: '2026-01-20', voided: false },
      { amount: 750, paid_on: '2026-01-21', voided: true },
    ];
    expect(commissionPaidBetween(payouts, '2026-01-01', '2026-02-01')).toEqual({ amount: 700, count: 1 });
    expect(commissionPaidBetween(payouts, '2025-11-01', '2026-11-01')).toEqual({ amount: 1200, count: 2 });
  });
});

describe('ledger', () => {
  const row = (status: StayStatus, final: number, net_paid: number, balance: number, commission = 0, commission_owed = 0) => ({
    status,
    final,
    net_paid,
    balance,
    commission,
    commission_owed,
  });

  it('sums booked, received, to collect, due ahead and commission owed', () => {
    const s = ledgerSummary([
      row('checked_in', 40000, 35000, 5000),
      row('completed', 13500, 13500, 0, 500, 500),
      row('confirmed', 10000, 2000, 8000),
      row('tentative', 10000, 0, 10000),
      row('cancelled', 8000, 2000, 0, 300, 0),
      row('completed', 9000, 9500, -500),
    ]);
    expect(s).toEqual({ count: 5, booked: 82500, received: 62000, toCollect: 5000, dueAhead: 18000, commissionOwed: 500 });
  });

  it('totals per referrer, most owed first; cancelled stays are not counted as bookings', () => {
    const r = (referrer_id: string | null, status: StayStatus, commission: number, commission_paid: number) => ({
      referrer_id,
      status,
      commission,
      commission_paid,
      commission_owed: commission - commission_paid,
    });
    expect(
      referrerTotals([
        r('m', 'completed', 500, 500),
        r('m', 'completed', 500, 0),
        r('s', 'completed', 700, 700),
        r('s', 'cancelled', 0, 0),
        r('s', 'completed', 0, 0),
        r(null, 'completed', 0, 0),
      ]),
    ).toEqual([
      { referrerId: 'm', bookings: 2, commission: 1000, paid: 500, owed: 500 },
      { referrerId: 's', bookings: 2, commission: 700, paid: 700, owed: 0 },
    ]);
  });
});
