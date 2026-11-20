import { describe, expect, it } from 'vitest';
import { isISODate } from '@/lib/dates';
import { newDraft, restoreDraft } from './draft';

const today = '2026-11-20';

describe('isISODate', () => {
  it('accepts real dates only', () => {
    expect(isISODate('2026-12-15')).toBe(true);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
    expect(isISODate('15/12/2026')).toBe(false);
  });
});

describe('restoreDraft', () => {
  it('starts fresh when nothing (or junk) was saved', () => {
    expect(restoreDraft(null, today)).toEqual(newDraft(today));
    expect(restoreDraft('oops', today)).toEqual(newDraft(today));
  });

  it('keeps a good saved draft as it was', () => {
    const saved = {
      ...newDraft(today),
      phone: '98431 12345',
      name: 'Priya',
      checkIn: '2027-05-10',
      nights: 3,
      status: 'enquiry' as const,
      nightlyRate: 4500,
      lines: [{ id: 'a', kind: 'discount' as const, label: 'Referral', amount: 500 }],
      advance: 2000,
      advanceMode: 'cash' as const,
    };
    expect(restoreDraft(JSON.parse(JSON.stringify(saved)), today)).toEqual(saved);
  });

  it('fills in missing fields and drops bad values instead of crashing', () => {
    const d = restoreDraft(
      {
        name: 'Ravi',
        checkIn: '',
        nights: 0,
        guestsCount: 2.5,
        status: 'checked_in',
        nightlyRate: 4999.5,
        lines: [{ id: 'x', kind: 'charge', label: 'Bedding', amount: -1 }, null],
        advanceOn: undefined,
      },
      today,
    );
    expect(d.name).toBe('Ravi');
    expect(d.checkIn).toBe(today);
    expect(d.advanceOn).toBe(today);
    expect(d.nights).toBe(1);
    expect(d.guestsCount).toBe(2);
    expect(d.status).toBe('confirmed');
    expect(d.nightlyRate).toBeNull();
    expect(d.lines).toEqual([]);
    expect(d.phone).toBe('');
  });
});
