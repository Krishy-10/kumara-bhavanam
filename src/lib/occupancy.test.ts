import { describe, expect, it } from 'vitest';
import { currentStay, findConflicts, nextArrival, nextFreeWindow, nightProgress, occupiedRanges, type StayDates } from './occupancy';
import { formatPhone, normalizePhone, waNumber } from './phone';

// The four seed stays and the blocked dates (today = 19 Nov 2026).
const stays: StayDates[] = [
  { stay_id: 'lakshmi', check_in: '2026-11-14', check_out: '2026-11-22', status: 'checked_in' },
  { stay_id: 'priya', check_in: '2026-11-24', check_out: '2026-11-26', status: 'confirmed' },
  { stay_id: 'ravi', check_in: '2026-12-04', check_out: '2026-12-06', status: 'tentative' },
  { stay_id: 'meena', check_in: '2026-10-30', check_out: '2026-11-02', status: 'completed' },
];
const blocked = [{ start_date: '2026-11-28', end_date: '2026-11-29', reason: 'Family function' }];
const today = '2026-11-19';

describe('Home figures from the seed', () => {
  it('Lakshmi is on the floor, night 6 of 8', () => {
    const now = currentStay(stays, today);
    expect(now?.stay_id).toBe('lakshmi');
    expect(nightProgress(now!.check_in, now!.check_out, today)).toEqual({ total: 8, tonight: 6 });
  });

  it('next arrival is Priya on 24 Nov', () => {
    expect(nextArrival(stays, today, currentStay(stays, today))?.stay_id).toBe('priya');
  });

  it('floor is free 22 to 24 Nov', () => {
    expect(nextFreeWindow(occupiedRanges(stays, blocked), today)).toEqual({ from: '2026-11-22', until: '2026-11-24' });
  });

  it('after Priya, blocked dates end the next free window', () => {
    expect(nextFreeWindow(occupiedRanges(stays, blocked), '2026-11-25')).toEqual({ from: '2026-11-26', until: '2026-11-28' });
    // Tentative Ravi does not take the floor.
    expect(nextFreeWindow(occupiedRanges(stays, blocked), '2026-11-29')).toEqual({ from: '2026-11-30', until: null });
  });
});

describe('overlap check for New booking', () => {
  it('blocks on confirmed / checked-in, warns on tentative and blocked dates', () => {
    const c = findConflicts(stays, blocked, '2026-11-21', '2026-11-29');
    expect(c.hard.map((s) => s.stay_id)).toEqual(['lakshmi', 'priya']);
    expect(c.blocked).toHaveLength(1);
    expect(findConflicts(stays, blocked, '2026-12-05', '2026-12-07').tentative.map((s) => s.stay_id)).toEqual(['ravi']);
  });

  it('check-out day is free; completed stays never conflict', () => {
    const c = findConflicts(stays, blocked, '2026-11-22', '2026-11-24');
    expect(c).toEqual({ hard: [], tentative: [], blocked: [] });
    expect(findConflicts(stays, blocked, '2026-10-31', '2026-11-01').hard).toEqual([]);
  });

  it('blocked 28–29 Nov includes the 29th night', () => {
    expect(findConflicts(stays, blocked, '2026-11-29', '2026-11-30').blocked).toHaveLength(1);
    expect(findConflicts(stays, blocked, '2026-11-30', '2026-12-01').blocked).toHaveLength(0);
  });
});

describe('phone numbers', () => {
  it('normalises Indian and international input', () => {
    expect(normalizePhone('98431 12345')).toBe('+919843112345');
    expect(normalizePhone('098431-12345')).toBe('+919843112345');
    expect(normalizePhone('919843112345')).toBe('+919843112345');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('formats for display and WhatsApp', () => {
    expect(formatPhone('+919843112345')).toBe('+91 98431 12345');
    expect(waNumber('+919843112345')).toBe('919843112345');
  });
});
