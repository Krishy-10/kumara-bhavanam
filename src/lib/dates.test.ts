import { describe, expect, it } from 'vitest';
import { addDays, addMonths, formatRange, monthRange, nightsBetween, monthsBetween, nightsOf, rangesOverlap, todayIST, weekdayMon0 } from './dates';

describe('dates', () => {
  it('today is Asia/Kolkata: 19:00 UTC on 18 Nov is already 19 Nov in IST', () => {
    expect(todayIST(new Date('2026-11-18T19:00:00Z'))).toBe('2026-11-19');
    expect(todayIST(new Date('2026-11-18T18:00:00Z'))).toBe('2026-11-18');
  });

  it('half-open nights', () => {
    expect(nightsBetween('2026-11-14', '2026-11-22')).toBe(8);
    expect(nightsOf('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('check-out day is free for the next check-in', () => {
    expect(rangesOverlap('2026-11-14', '2026-11-22', '2026-11-22', '2026-11-24')).toBe(false);
    expect(rangesOverlap('2026-11-14', '2026-11-22', '2026-11-21', '2026-11-24')).toBe(true);
  });

  it('month ranges and calendar helpers', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(weekdayMon0('2026-11-16')).toBe(0); // Monday
    expect(formatRange('2026-11-14', '2026-11-22')).toBe('14 to 22 Nov');
    expect(formatRange('2026-10-30', '2026-11-02')).toBe('30 Oct to 2 Nov');
  });
});

describe('months', () => {
  it('adds months across year ends', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
