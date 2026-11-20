import { describe, expect, it } from 'vitest';
import type { StayStatus } from './money';
import { pipelineNotes, pipelineStages, type PipelineStay } from './pipeline';

const today = '2026-11-20';

const stay = (id: string, status: StayStatus, check_in: string, check_out: string, extra: Partial<PipelineStay> = {}): PipelineStay => ({
  stay_id: id,
  status,
  check_in,
  check_out,
  guest_name: id,
  created_at: '2026-11-19T10:00:00Z',
  final: 10000,
  net_paid: 0,
  ...extra,
});

const kinds = (s: PipelineStay, all: PipelineStay[]) => pipelineNotes(s, all, today).map((n) => n.kind);

describe('pipelineStages', () => {
  it('groups open bookings by stage, soonest first, and leaves the rest out', () => {
    const all = [
      stay('b', 'enquiry', '2027-01-10', '2027-01-12'),
      stay('a', 'enquiry', '2026-12-01', '2026-12-03'),
      stay('t', 'tentative', '2026-12-20', '2026-12-22'),
      stay('c', 'confirmed', '2026-12-05', '2026-12-06'),
      stay('in', 'checked_in', '2026-11-18', '2026-11-22'),
      stay('x', 'cancelled', '2026-12-01', '2026-12-02'),
    ];
    const g = pipelineStages(all);
    expect(g.enquiry.map((s) => s.stay_id)).toEqual(['a', 'b']);
    expect(g.tentative.map((s) => s.stay_id)).toEqual(['t']);
    expect(g.confirmed.map((s) => s.stay_id)).toEqual(['c']);
  });
});

describe('pipelineNotes', () => {
  it('flags an enquiry whose dates have passed, and nothing else', () => {
    const s = stay('e', 'enquiry', '2026-11-18', '2026-11-19', { created_at: '2026-10-01T10:00:00Z' });
    expect(kinds(s, [s])).toEqual(['passed']);
  });

  it('says when the dates are already booked by a confirmed stay', () => {
    const c = stay('Meena', 'confirmed', '2026-12-10', '2026-12-12', { net_paid: 2000 });
    const e = stay('e', 'tentative', '2026-12-11', '2026-12-13');
    const notes = pipelineNotes(e, [c, e], today);
    expect(notes[0]).toMatchObject({ kind: 'taken', urgent: true });
    expect(notes[0]!.text).toContain('Meena');
  });

  it('a check-out day is free: back-to-back is not a clash', () => {
    const c = stay('c', 'confirmed', '2026-12-10', '2026-12-12', { net_paid: 2000 });
    const e = stay('e', 'enquiry', '2026-12-12', '2026-12-14');
    expect(kinds(e, [c, e])).toEqual([]);
  });

  it('flags arrivals within a week that are still not confirmed', () => {
    expect(kinds(stay('e', 'tentative', '2026-11-27', '2026-11-28'), [])).toEqual(['soon']);
    expect(pipelineNotes(stay('e', 'enquiry', '2026-11-21', '2026-11-22'), [], today)[0]!.text).toContain('tomorrow');
    expect(kinds(stay('e', 'tentative', '2026-11-28', '2026-11-29'), [])).toEqual([]);
  });

  it('suggests a follow-up on an enquiry entered 3 or more days ago (IST)', () => {
    // 16 Nov 20:00 UTC is 17 Nov in IST: 3 days before the 20th.
    expect(kinds(stay('e', 'enquiry', '2027-01-10', '2027-01-12', { created_at: '2026-11-16T20:00:00Z' }), [])).toEqual(['follow_up']);
    expect(kinds(stay('e', 'enquiry', '2027-01-10', '2027-01-12', { created_at: '2026-11-17T20:00:00Z' }), [])).toEqual([]);
    expect(kinds(stay('t', 'tentative', '2027-01-10', '2027-01-12', { created_at: '2026-10-01T10:00:00Z' }), [])).toEqual([]);
  });

  it('confirmed: no advance yet (urgent only when arriving within a week), and a missed arrival', () => {
    expect(pipelineNotes(stay('c', 'confirmed', '2027-01-10', '2027-01-12'), [], today)).toEqual([
      { kind: 'no_advance', text: 'No advance received yet.', urgent: false },
    ]);
    expect(pipelineNotes(stay('c', 'confirmed', '2026-11-23', '2026-11-25'), [], today)[0]!.urgent).toBe(true);
    expect(kinds(stay('c', 'confirmed', '2026-11-19', '2026-11-21', { net_paid: 5000 }), [])).toEqual(['arrival_passed']);
    expect(kinds(stay('c', 'confirmed', '2027-01-10', '2027-01-12', { net_paid: 5000 }), [])).toEqual([]);
  });
});
