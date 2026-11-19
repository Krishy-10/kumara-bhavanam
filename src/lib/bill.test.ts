import { describe, expect, it } from 'vitest';
import type { ChargeRow, PaymentRow, SettingsRow, StayRow } from '@/data/types';
import { billFileName, billModel, billStamp, billText, stampTone } from './bill';

const stay: StayRow = {
  stay_id: 's1',
  guest_id: 'g1',
  guest_name: 'Lakshmi Narayanan',
  guest_phone: '+919843112345',
  bill_no: 'KB-2026-0041',
  check_in: '2026-11-14',
  check_out: '2026-11-22',
  guests_count: 8,
  driver_room: true,
  status: 'checked_in',
  pricing_mode: 'fixed',
  nightly_rate: null,
  fixed_amount: 40000,
  occasion: 'Pilgrimage',
  source: 'Returning guest',
  notes: null,
  created_at: '2026-11-01T10:00:00Z',
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
};

const charge = (kind: 'charge' | 'discount', label: string, amount: number, voided = false): ChargeRow => ({
  id: label,
  stay_id: 's1',
  kind,
  label,
  amount,
  voided,
  void_reason: voided ? 'x' : null,
  created_at: '',
  created_by: 'K',
});

const pay = (amount: number, paid_on: string, voided = false): PaymentRow => ({
  id: `${amount}${paid_on}${voided}`,
  stay_id: 's1',
  amount,
  type: 'payment',
  mode: 'cash',
  paid_on,
  reference: null,
  voided,
  void_reason: voided ? 'Entered twice' : null,
  voided_at: null,
  voided_by: null,
  created_at: '',
  created_by: 'K',
});

const settings: SettingsRow = { property_name: 'Kumara Bhavanam', contact_phone: '+91 00000 00000', address: 'Tirunelveli', google_review_link: null };

describe('billText', () => {
  const model = billModel(
    stay,
    [charge('charge', 'Extra bedding', 1000), charge('discount', 'Returning guest', 1000), charge('charge', 'Mistake', 999, true)],
    [pay(10000, '2026-11-02'), pay(25000, '2026-11-14'), pay(25000, '2026-11-14', true)],
    settings,
    '2026-11-19',
  );
  const text = billText(model);

  it('has the bill number, guest, amounts and stamp', () => {
    expect(text).toContain('BILL KB-2026-0041');
    expect(text).toContain('Lakshmi Narayanan, +91 98431 12345');
    expect(text).toContain('Whole floor, 8 nights (fixed): ₹40,000');
    expect(text).toContain('Extra bedding: + ₹1,000');
    expect(text).toContain('Discount (Returning guest): − ₹1,000');
    expect(text).toContain('TOTAL: ₹40,000');
    expect(text).toContain('BALANCE DUE ₹5,000');
  });

  it('leaves voided lines off the guest’s bill', () => {
    expect(text).not.toContain('Mistake');
    expect(text.match(/₹25,000/g)).toHaveLength(1);
  });

  it('never says tax invoice, GST or anything about ID', () => {
    expect(text).not.toMatch(/tax invoice|gst|aadhaar|id checked/i);
  });
});

describe('billModel', () => {
  const m = billModel(stay, [charge('charge', 'Mistake', 999, true)], [pay(10000, '2026-11-02')], settings, '2026-11-19');
  it('dates the bill and names the file after the bill number', () => {
    expect(m.billDate).toBe('19 Nov 2026');
    expect(m.stayLine).toBe('14 to 22 Nov 2026 · 8 nights · 8 guests');
    expect(m.lines).toHaveLength(1);
    expect(m.payments).toEqual([{ label: '2 Nov · Payment · Cash', amount: '₹10,000' }]);
    expect(billFileName(m.billNo)).toBe('Bill KB-2026-0041.pdf');
  });
});

describe('billStamp', () => {
  it('reads paid, overpaid, due and cancelled', () => {
    expect(billStamp({ status: 'completed', balance: 0 })).toBe('PAID');
    expect(billStamp({ status: 'completed', balance: -500 })).toBe('OVERPAID BY ₹500');
    expect(billStamp({ status: 'checked_in', balance: 5000 })).toBe('BALANCE DUE ₹5,000');
    expect(billStamp({ status: 'cancelled', balance: 0 })).toBe('CANCELLED');
    expect(stampTone({ status: 'completed', balance: -500 })).toBe('due');
    expect(stampTone({ status: 'completed', balance: 0 })).toBe('paid');
  });
});
