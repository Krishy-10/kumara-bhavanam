/**
 * The only module that talks to Supabase. Screens use the hooks in
 * ./hooks.ts, never this file directly. No money maths here: totals come
 * from the stay_totals view.
 */
import { getSupabase } from '@/lib/supabase';
import type { ISODate } from '@/lib/dates';
import type { StayStatus } from '@/lib/money';
import { toAppError } from './errors';
import type {
  BlockedRow,
  BookingPayload,
  BookingResult,
  ChargeRow,
  CommissionPayoutRow,
  CommissionRow,
  DocType,
  GuestEdit,
  GuestRow,
  ReferrerRow,
  IdCheckRow,
  Language,
  NewBlocked,
  NewCharge,
  NewCommission,
  NewCommissionPayout,
  NewPayment,
  NewTemplate,
  PaymentRow,
  SettingsRow,
  StayRow,
  TemplateRow,
} from './types';

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  let res: { data: T | null; error: unknown };
  try {
    res = await p;
  } catch (e) {
    throw toAppError(e);
  }
  if (res.error) throw toAppError(res.error);
  return res.data as T;
}

/** For writes: fails loudly, returns nothing. */
async function run(p: PromiseLike<{ error: unknown }>): Promise<void> {
  let res: { error: unknown };
  try {
    res = await p;
  } catch (e) {
    throw toAppError(e);
  }
  if (res.error) throw toAppError(res.error);
}

const db = () => getSupabase();

// ---- Reads ------------------------------------------------------------------

/** Every stay with its guest and money, newest check-in first. */
export function fetchStays(): Promise<StayRow[]> {
  return unwrap(db().from('stay_totals').select('*').order('check_in', { ascending: false }));
}

/** Payments (any stay) dated within [start, end). */
export function fetchPaymentsBetween(start: ISODate, end: ISODate): Promise<PaymentRow[]> {
  return unwrap(db().from('payments').select('*').gte('paid_on', start).lt('paid_on', end));
}

/** Every payment row, for Insights (a few hundred rows at most for one floor). */
export function fetchAllPayments(): Promise<PaymentRow[]> {
  return unwrap(db().from('payments').select('*').order('paid_on'));
}

/** A stay's commission rows (voided ones too, shown struck through). */
export function fetchStayCommissions(stayId: string): Promise<CommissionRow[]> {
  return unwrap(db().from('commissions').select('*').eq('stay_id', stayId).order('created_at'));
}

/** Every commission payout (a handful per month at most). */
export function fetchCommissionPayouts(): Promise<CommissionPayoutRow[]> {
  return unwrap(db().from('commission_payouts').select('*').order('paid_on'));
}

export function fetchStayPayments(stayId: string): Promise<PaymentRow[]> {
  return unwrap(db().from('payments').select('*').eq('stay_id', stayId).order('paid_on').order('created_at'));
}

export function fetchStayCharges(stayId: string): Promise<ChargeRow[]> {
  return unwrap(db().from('charges').select('*').eq('stay_id', stayId).order('created_at'));
}

export async function fetchIdCheck(stayId: string): Promise<IdCheckRow | null> {
  const rows = await unwrap<IdCheckRow[]>(db().from('id_checks').select('*').eq('stay_id', stayId).limit(1));
  return rows[0] ?? null;
}

export function fetchBlockedDates(): Promise<BlockedRow[]> {
  return unwrap(db().from('blocked_dates').select('*').order('start_date'));
}

export function fetchGuests(): Promise<GuestRow[]> {
  return unwrap(db().from('guests').select('*').order('name'));
}

export function fetchReferrers(): Promise<ReferrerRow[]> {
  return unwrap(db().from('referrers').select('*').is('archived_at', null).order('name'));
}

export async function fetchGuestByPhone(phone: string): Promise<GuestRow | null> {
  const rows = await unwrap<GuestRow[]>(db().from('guests').select('*').eq('phone', phone).limit(1));
  return rows[0] ?? null;
}

export function fetchTemplates(): Promise<TemplateRow[]> {
  return unwrap(db().from('message_templates').select('*').is('archived_at', null).order('sort_order').order('created_at'));
}

export async function fetchSettings(): Promise<SettingsRow> {
  const rows = await unwrap<SettingsRow[]>(
    db().from('app_settings').select('property_name, contact_phone, address, google_review_link').limit(1),
  );
  return rows[0] ?? { property_name: 'Kumara Bhavanam', contact_phone: null, address: null, google_review_link: null };
}

// ---- Writes -----------------------------------------------------------------

/** Saves guest, stay, extras and advance in one all-or-nothing database call. */
export function createBooking(payload: BookingPayload): Promise<BookingResult> {
  return unwrap(db().rpc('create_booking', { p: payload }));
}

export function setStayStatus(stayId: string, status: StayStatus): Promise<void> {
  return run(db().from('stays').update({ status }).eq('id', stayId));
}

export function addPayment(p: NewPayment): Promise<void> {
  return run(db().from('payments').insert(p));
}

/** The one change a payment may ever get. */
export function voidPayment(id: string, reason: string, by: string): Promise<void> {
  return run(db().from('payments').update({ voided: true, void_reason: reason, voided_by: by }).eq('id', id));
}

export function addCommission(c: NewCommission): Promise<void> {
  return run(db().from('commissions').insert(c));
}

/** The one change a commission may ever get. */
export function voidCommission(id: string, reason: string, by: string): Promise<void> {
  return run(db().from('commissions').update({ voided: true, void_reason: reason, voided_by: by }).eq('id', id));
}

/** Marks commissions paid: one payout row each, for the full amount owed. */
export function addCommissionPayouts(rows: NewCommissionPayout[]): Promise<void> {
  return run(db().from('commission_payouts').insert(rows));
}

export function voidCommissionPayout(id: string, reason: string, by: string): Promise<void> {
  return run(db().from('commission_payouts').update({ voided: true, void_reason: reason, voided_by: by }).eq('id', id));
}

export function addCharge(c: NewCharge): Promise<void> {
  return run(db().from('charges').insert(c));
}

export function voidCharge(id: string, reason: string, by: string): Promise<void> {
  return run(db().from('charges').update({ voided: true, void_reason: reason, voided_by: by }).eq('id', id));
}

/** Records that an ID was seen (one per stay). checked_at is set by the database. */
export function saveIdCheck(stayId: string, docType: DocType, last4: string | null, by: string): Promise<void> {
  return run(db().from('id_checks').insert({ stay_id: stayId, doc_type: docType, last4, checked_by: by, created_by: by }));
}

export function removeIdCheck(stayId: string): Promise<void> {
  return run(db().from('id_checks').delete().eq('stay_id', stayId));
}

export function addBlocked(b: NewBlocked): Promise<void> {
  return run(db().from('blocked_dates').insert(b));
}

export function removeBlocked(id: string): Promise<void> {
  return run(db().from('blocked_dates').delete().eq('id', id));
}

export function updateGuest(id: string, g: GuestEdit): Promise<void> {
  return run(db().from('guests').update(g).eq('id', id));
}

export function setGuestLanguage(id: string, language: Language): Promise<void> {
  return run(db().from('guests').update({ language }).eq('id', id));
}

export function setGuestArchived(id: string, archived: boolean): Promise<void> {
  return run(db().from('guests').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id));
}

export function addTemplate(t: NewTemplate): Promise<void> {
  return run(db().from('message_templates').insert({ ...t, is_preset: false }));
}

export function archiveTemplate(id: string): Promise<void> {
  return run(db().from('message_templates').update({ archived_at: new Date().toISOString() }).eq('id', id));
}

export function setReviewLink(link: string | null): Promise<void> {
  return run(db().from('app_settings').update({ google_review_link: link }).eq('id', true));
}
