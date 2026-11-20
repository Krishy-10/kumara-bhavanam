import { describe, expect, it } from 'vitest';
import type { ExpenseRow, PaymentRow, StayRow } from '@/data/types';
import { BOOKING_COLUMNS, bookingsCsv, csvCell, expensesCsv, paymentsCsv, toCsv } from './csv';

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Plain')).toBe('Plain');
    expect(csvCell('Narayanan, Lakshmi')).toBe('"Narayanan, Lakshmi"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(40000)).toBe('40000');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('Yes');
  });

  it('stops text being read as a spreadsheet formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+91 98431')).toBe("'+91 98431");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(-500)).toBe('-500'); // a real negative number stays a number
  });
});

describe('toCsv', () => {
  it('starts with a BOM so Excel shows ₹ and Tamil, and uses CRLF', () => {
    const out = toCsv(['a', 'b'], [['வணக்கம்', 1]]);
    expect(out.startsWith('﻿')).toBe(true);
    expect(out).toBe('﻿a,b\r\nவணக்கம்,1\r\n');
  });
});

const stay = (over: Partial<StayRow>): StayRow => ({
  stay_id: 's1',
  guest_id: 'g1',
  guest_name: 'Lakshmi Narayanan',
  guest_phone: '+919843112345',
  bill_no: 'KB-2026-0041',
  check_in: '2026-11-14',
  check_out: '2026-11-22',
  guests_count: 8,
  status: 'checked_in',
  pricing_mode: 'fixed',
  nightly_rate: null,
  fixed_amount: 40000,
  occasion: 'Pilgrimage',
  sources: ['Referral', 'WhatsApp'],
  referrer_id: 'r1',
  referrer_name: 'Murugan (auto driver)',
  notes: null,
  created_at: '2026-11-01T20:00:00Z',
  created_by: 'Krishna Kumar',
  nights: 8,
  base: 40000,
  charges: 1000,
  discounts: 1000,
  final: 40000,
  paid: 35000,
  refunded: 0,
  net_paid: 35000,
  balance: 5000,
  commission_id: 'c1',
  commission: 500,
  commission_paid: 0,
  commission_owed: 500,
  ...over,
});

describe('bookingsCsv', () => {
  it('one row per stay, figures as they are in stay_totals, oldest first', () => {
    const lines = bookingsCsv([stay({}), stay({ stay_id: 's0', bill_no: 'KB-2026-0001', check_in: '2026-01-02', check_out: '2026-01-03' })])
      .replace('﻿', '')
      .trim()
      .split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(BOOKING_COLUMNS.join(','));
    expect(lines[1]!.startsWith('KB-2026-0001,')).toBe(true);
    expect(lines[2]).toBe(
      "KB-2026-0041,Lakshmi Narayanan,91 98431 12345,2026-11-14,2026-11-22,8,8,Checked in,Fixed,,40000,1000,1000,40000,35000,0,35000,5000,Referral; WhatsApp,Murugan (auto driver),500,0,500,Pilgrimage,,Krishna Kumar,2026-11-02",
    );
  });

  it('never carries ID details', () => {
    expect(bookingsCsv([stay({})])).not.toMatch(/aadhaar|passport|id checked|last 4/i);
  });
});

describe('paymentsCsv', () => {
  const pay = (over: Partial<PaymentRow>): PaymentRow => ({
    id: 'p',
    stay_id: 's1',
    amount: 10000,
    type: 'advance',
    mode: 'upi',
    paid_on: '2026-11-02',
    reference: null,
    voided: false,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    created_at: '2026-11-02T06:00:00Z',
    created_by: 'Krishna Kumar',
    ...over,
  });

  it('one row per payment by date, voided ones marked', () => {
    const lines = paymentsCsv(
      [pay({ id: 'b', amount: 25000, type: 'payment', mode: 'cash', paid_on: '2026-11-14', voided: true, void_reason: 'Entered twice' }), pay({})],
      [stay({})],
    )
      .replace('﻿', '')
      .trim()
      .split('\r\n');
    expect(lines.slice(1)).toEqual([
      '2026-11-02,KB-2026-0041,Lakshmi Narayanan,Advance,UPI,10000,,No,,Krishna Kumar',
      '2026-11-14,KB-2026-0041,Lakshmi Narayanan,Payment,Cash,25000,,Yes,Entered twice,Krishna Kumar',
    ]);
  });
});

describe('expensesCsv', () => {
  const exp = (over: Partial<ExpenseRow>): ExpenseRow => ({
    id: 'e',
    category: 'Water',
    note: 'Drinking water cans',
    amount: 400,
    mode: 'cash',
    paid_on: '2026-11-08',
    stay_id: null,
    voided: false,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    created_at: '2026-11-08T04:00:00Z',
    created_by: 'Padmanabhan',
    ...over,
  });

  it('one row per expense by date, with the stay when linked and voided ones marked', () => {
    const lines = expensesCsv(
      [exp({}), exp({ id: 'c', category: 'Cleaning', note: 'Deep clean, after the group', amount: 600, paid_on: '2026-11-02', stay_id: 's1', voided: true, void_reason: 'Wrong amount' })],
      [stay({})],
    )
      .replace('﻿', '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe('Date paid,For,Note,Mode,Amount,Stay bill no,Stay guest,Voided,Void reason,Entered by');
    expect(lines.slice(1)).toEqual([
      '2026-11-02,Cleaning,"Deep clean, after the group",Cash,600,KB-2026-0041,Lakshmi Narayanan,Yes,Wrong amount,Padmanabhan',
      '2026-11-08,Water,Drinking water cans,Cash,400,,,No,,Padmanabhan',
    ]);
  });
});
