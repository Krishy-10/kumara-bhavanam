import { describe, expect, it } from 'vitest';
import { arrivalsBy, occupancy, periodMonths, spanOf } from './analytics';
import type { StayDates } from './occupancy';

const today = '2026-11-19';

describe('periods', () => {
  it('counts back from this month', () => {
    expect(periodMonths('3m', today)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(periodMonths('12m', today)).toHaveLength(12);
    expect(periodMonths('next3', today)).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('uses the April–March financial year', () => {
    expect(periodMonths('fy', today)[0]).toBe('2026-04');
    expect(periodMonths('fy', today).at(-1)).toBe('2027-03');
    expect(periodMonths('fy', '2027-02-10')[0]).toBe('2026-04');
  });

  it('spans whole months, end excluded', () => {
    expect(spanOf(['2026-09', '2026-10', '2026-11'])).toEqual({ start: '2026-09-01', end: '2026-12-01' });
  });
});

const stays: (StayDates & { sources: string[] })[] = [
  { stay_id: 'a', check_in: '2026-11-14', check_out: '2026-11-22', status: 'checked_in', sources: ['Phone', 'Referral'] },
  { stay_id: 'b', check_in: '2026-11-24', check_out: '2026-11-26', status: 'confirmed', sources: ['WhatsApp'] },
  { stay_id: 'c', check_in: '2026-11-27', check_out: '2026-11-28', status: 'cancelled', sources: ['Phone'] },
  { stay_id: 'd', check_in: '2026-11-28', check_out: '2026-11-29', status: 'tentative', sources: ['Phone', 'Phone'] },
];

describe('occupancy and counts', () => {
  it('counts booked nights only (not tentative or cancelled)', () => {
    expect(occupancy(stays, '2026-11-01', '2026-12-01')).toEqual({ booked: 10, nights: 30, pct: 33 });
  });

  it('counts arrivals by source, once under each source, skipping cancelled', () => {
    const m = arrivalsBy(stays, (s) => s.sources, '2026-11-01', '2026-12-01');
    expect(m.get('Phone')).toBe(2);
    expect(m.get('Referral')).toBe(1);
    expect(m.get('WhatsApp')).toBe(1);
  });
});
