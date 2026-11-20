/**
 * Pipeline: bookings that still need a nudge, from first enquiry to
 * confirmed. Pure date logic; money figures come from stay_totals as they are
 * (sums go through money.ts).
 */
import { istDate, nightsBetween, type ISODate } from './dates';
import type { StayStatus } from './money';
import { findConflicts, type StayDates } from './occupancy';

export const PIPELINE_STAGES = ['enquiry', 'tentative', 'confirmed'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_TITLE: Record<PipelineStage, string> = {
  enquiry: 'Enquiries',
  tentative: 'Tentative',
  confirmed: 'Confirmed, not arrived',
};

/** An enquiry with no change for this many days gets a "follow up?" note. */
export const FOLLOW_UP_AFTER_DAYS = 3;
/** Not confirmed and arriving within this many days: flagged. */
export const SOON_DAYS = 7;

export interface PipelineStay extends StayDates {
  guest_name: string;
  created_at: string;
  final: number;
  net_paid: number;
}

export type NoteKind = 'passed' | 'taken' | 'soon' | 'follow_up' | 'no_advance' | 'arrival_passed';

export interface PipelineNote {
  kind: NoteKind;
  text: string;
  /** Needs doing now (shown first, in terracotta with an alert icon). */
  urgent: boolean;
}

function inDays(n: number): string {
  return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

/** What to look at on one pipeline stay, most urgent first. */
export function pipelineNotes<T extends PipelineStay>(stay: T, all: T[], today: ISODate): PipelineNote[] {
  const notes: PipelineNote[] = [];
  const untilArrival = nightsBetween(today, stay.check_in);

  if (stay.status === 'enquiry' || stay.status === 'tentative') {
    if (untilArrival < 0) {
      notes.push({ kind: 'passed', text: 'The dates have passed. Cancel it if they’re not coming.', urgent: true });
      return notes;
    }
    const taken = findConflicts(all, [], stay.check_in, stay.check_out, stay.stay_id).hard[0];
    if (taken) notes.push({ kind: 'taken', text: `Dates already booked by ${taken.guest_name}. Can’t confirm these dates.`, urgent: true });
    if (untilArrival <= SOON_DAYS) notes.push({ kind: 'soon', text: `Arrives ${inDays(untilArrival)}, not confirmed yet.`, urgent: true });
    const waited = nightsBetween(istDate(stay.created_at), today);
    if (stay.status === 'enquiry' && waited >= FOLLOW_UP_AFTER_DAYS) {
      notes.push({ kind: 'follow_up', text: `Asked ${waited} days ago. Follow up?`, urgent: false });
    }
  }

  if (stay.status === 'confirmed') {
    if (untilArrival < 0) notes.push({ kind: 'arrival_passed', text: 'Arrival day has passed. Check them in, or cancel.', urgent: true });
    if (stay.net_paid <= 0 && stay.final > 0) notes.push({ kind: 'no_advance', text: 'No advance received yet.', urgent: untilArrival >= 0 && untilArrival <= SOON_DAYS });
  }

  return notes.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/** Open bookings by stage, soonest arrival first. */
export function pipelineStages<T extends PipelineStay>(stays: T[]): Record<PipelineStage, T[]> {
  const byIn = (a: T, b: T) => (a.check_in < b.check_in ? -1 : a.check_in > b.check_in ? 1 : 0);
  const of = (s: StayStatus) => stays.filter((x) => x.status === s).sort(byIn);
  return { enquiry: of('enquiry'), tentative: of('tentative'), confirmed: of('confirmed') };
}

/** Days since the booking was first entered (IST). */
export function daysSinceEntered(createdAt: string, today: ISODate): number {
  return nightsBetween(istDate(createdAt), today);
}
