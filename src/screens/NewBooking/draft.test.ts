import { describe, expect, it } from 'vitest';
import { isISODate } from '@/lib/dates';
import { newDraft, pickStayDay, restoreDraft, stayStepError, toggleSource, toPayload } from './draft';

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

describe('sources and referrer', () => {
  const base = { ...newDraft(today), phone: '98431 12345', name: 'Priya', nightlyRate: 5000 };

  it('turns a single source from an older saved draft into a list', () => {
    expect(restoreDraft({ ...base, sources: undefined, source: 'WhatsApp' }, today).sources).toEqual(['WhatsApp']);
    expect(restoreDraft({ ...base, sources: ['Online', 'Bogus', 'Phone'] }, today).sources).toEqual(['Phone', 'Online']);
  });

  it('toggles sources and keeps the screen order', () => {
    expect(toggleSource(['Online'], 'Phone')).toEqual(['Phone', 'Online']);
    expect(toggleSource(['Phone', 'Online'], 'Phone')).toEqual(['Online']);
  });

  it('checks the referrer only for a Referral booking', () => {
    expect(stayStepError({ ...base, sources: ['Phone'], referrerPhone: 'abc' })).toBeNull();
    expect(stayStepError({ ...base, sources: ['Referral'], referrerName: 'Murugan', referrerPhone: '123' })).toMatch(/phone/);
    expect(stayStepError({ ...base, sources: ['Referral'], referrerPhone: '98431 00301' })).toMatch(/name/);
    expect(stayStepError({ ...base, sources: ['Referral'], referrerName: 'Murugan' })).toBeNull();
  });

  it('sends the referrer only with Referral: a picked one by id, a new one by name', () => {
    expect(toPayload({ ...base, sources: ['Phone'], referrerName: 'X' }, 'K').referrer).toBeNull();
    expect(toPayload({ ...base, sources: ['Referral'], referrerId: 'r1', referrerName: 'Murugan' }, 'K').referrer).toEqual({ id: 'r1' });
    expect(toPayload({ ...base, sources: ['Referral', 'WhatsApp'], referrerName: ' Murugan ', referrerPhone: '98431 00301' }, 'K')).toMatchObject({
      stay: { sources: ['Referral', 'WhatsApp'] },
      referrer: { name: 'Murugan', phone: '+919843100301' },
    });
    expect(toPayload({ ...base, sources: ['Referral'] }, 'K').referrer).toBeNull();
  });
});

describe('pickStayDay', () => {
  it('first tap picks check-in, the second a later day picks check-out', () => {
    const shown = { checkIn: '2027-05-10', checkOut: '2027-05-12' };
    const a = pickStayDay(shown, '2027-05-20');
    expect(a).toEqual({ checkIn: '2027-05-20', checkOut: null });
    expect(pickStayDay(a, '2027-05-23')).toEqual({ checkIn: '2027-05-20', checkOut: '2027-05-23' });
  });

  it('a tap on or before the check-in starts again; very long stays stop at 60 nights', () => {
    const a = { checkIn: '2027-05-20', checkOut: null };
    expect(pickStayDay(a, '2027-05-20')).toEqual({ checkIn: '2027-05-20', checkOut: null });
    expect(pickStayDay(a, '2027-05-02')).toEqual({ checkIn: '2027-05-02', checkOut: null });
    expect(pickStayDay(a, '2027-09-01')).toEqual({ checkIn: '2027-05-20', checkOut: '2027-07-19' });
  });
});
