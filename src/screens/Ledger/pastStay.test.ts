import { describe, expect, it } from 'vitest';
import { newPastStay, pastNights, pastStayError, pastStayPayload, type PastStay } from './pastStay';

const today = '2026-11-21';
const good = (over: Partial<PastStay> = {}): PastStay => ({
  ...newPastStay(today),
  phone: '98431 55555',
  name: ' Kamala Devi ',
  checkIn: '2025-06-01',
  checkOut: '2025-06-04',
  total: 15000,
  paid: 15000,
  paidOn: '2025-06-04',
  ...over,
});

describe('newPastStay', () => {
  it('starts as two nights ending yesterday, paid on check-out', () => {
    const p = newPastStay(today);
    expect([p.checkIn, p.checkOut, p.paidOn]).toEqual(['2026-11-18', '2026-11-20', '2026-11-20']);
    expect(pastNights(p)).toBe(2);
  });
});

describe('pastStayError', () => {
  it('accepts a complete past stay', () => {
    expect(pastStayError(good(), today)).toBeNull();
    expect(pastStayError(good({ checkOut: today }), today)).toBeNull();
    expect(pastStayError(good({ paid: null }), today)).toBeNull();
  });

  it('asks for what is missing, in screen order', () => {
    expect(pastStayError(good({ phone: '123' }), today)).toMatch(/phone/);
    expect(pastStayError(good({ name: ' ' }), today)).toMatch(/name/);
    expect(pastStayError(good({ checkOut: '2025-06-01' }), today)).toMatch(/after check-in/);
    expect(pastStayError(good({ checkIn: '2026-11-20', checkOut: '2026-11-22' }), today)).toMatch(/ended by today/);
    expect(pastStayError(good({ total: null }), today)).toMatch(/total/);
    expect(pastStayError(good({ paidOn: '2026-12-01' }), today)).toMatch(/date they paid/);
    expect(pastStayError(good({ sources: ['Referral'], referrerName: 'Murugan', referrerPhone: '12' }), today)).toMatch(/referrer/);
  });
});

describe('pastStayPayload', () => {
  it('saves a completed, fixed-price stay with one payment of type payment', () => {
    expect(pastStayPayload(good({ sources: ['Referral', 'Phone'], referrerId: 'r1' }), 'Padmanabhan')).toEqual({
      created_by: 'Padmanabhan',
      guest: { phone: '+919843155555', name: 'Kamala Devi', city: null, email: null, language: 'en', nationality: 'Indian' },
      stay: {
        check_in: '2025-06-01',
        check_out: '2025-06-04',
        guests_count: 4,
        status: 'completed',
        pricing_mode: 'fixed',
        nightly_rate: null,
        fixed_amount: 15000,
        occasion: null,
        sources: ['Referral', 'Phone'],
        notes: null,
      },
      referrer: { id: 'r1' },
      charges: [],
      advance: { amount: 15000, mode: 'cash', paid_on: '2025-06-04', reference: null, type: 'payment' },
    });
  });

  it('records no payment when nothing was paid, and no referrer without Referral', () => {
    const p = pastStayPayload(good({ paid: 0, referrerName: 'Ignored' }), 'K');
    expect(p.advance).toBeNull();
    expect(p.referrer).toBeNull();
  });
});
