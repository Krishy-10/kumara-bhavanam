/** Guest search and per-guest summaries. Money sums go through money.ts. */
import type { GuestRow, StayRow } from '@/data/types';
import { totalSpent } from './money';

export interface GuestSummary {
  stays: StayRow[];
  /** Stays that weren't cancelled. */
  visits: number;
  last: StayRow | undefined;
  spent: number;
}

/** A guest's stays, newest first, and what they add up to (via money.ts). */
export function summarise(guestId: string, all: StayRow[]): GuestSummary {
  const stays = all.filter((s) => s.guest_id === guestId).sort((a, b) => (a.check_in < b.check_in ? 1 : -1));
  const kept = stays.filter((s) => s.status !== 'cancelled');
  return { stays, visits: kept.length, last: kept[0], spent: totalSpent(stays) };
}

export function matches(g: GuestRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    g.name.toLowerCase().includes(q) ||
    (g.city ?? '').toLowerCase().includes(q) ||
    (digits.length >= 3 && g.phone.replace(/\D/g, '').includes(digits))
  );
}
