import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { monthRange } from '@/lib/dates';
import * as api from './api';
import type { BookingPayload } from './types';

export const keys = {
  stays: ['stays'] as const,
  payments: (month: string) => ['payments', 'month', month] as const,
  allPayments: ['payments', 'all'] as const,
  stayPayments: (id: string) => ['payments', 'stay', id] as const,
  stayCharges: (id: string) => ['charges', id] as const,
  idCheck: (id: string) => ['idcheck', id] as const,
  blocked: ['blocked'] as const,
  guests: ['guests'] as const,
  referrers: ['referrers'] as const,
  stayCommissions: (id: string) => ['commissions', id] as const,
  payouts: ['commissions', 'payouts'] as const,
  guestByPhone: (phone: string) => ['guest', 'phone', phone] as const,
  templates: ['templates'] as const,
  settings: ['settings'] as const,
};

// ---- Reads ------------------------------------------------------------------

export function useStays() {
  return useQuery({ queryKey: keys.stays, queryFn: api.fetchStays });
}

/** Payments dated in one calendar month ('YYYY-MM'). */
export function useMonthPayments(month: string) {
  const { start, end } = monthRange(month);
  return useQuery({ queryKey: keys.payments(month), queryFn: () => api.fetchPaymentsBetween(start, end) });
}

export function useAllPayments() {
  return useQuery({ queryKey: keys.allPayments, queryFn: api.fetchAllPayments });
}

export function useStayPayments(stayId: string) {
  return useQuery({ queryKey: keys.stayPayments(stayId), queryFn: () => api.fetchStayPayments(stayId) });
}

export function useStayCharges(stayId: string) {
  return useQuery({ queryKey: keys.stayCharges(stayId), queryFn: () => api.fetchStayCharges(stayId) });
}

export function useIdCheck(stayId: string) {
  return useQuery({ queryKey: keys.idCheck(stayId), queryFn: () => api.fetchIdCheck(stayId) });
}

export function useBlockedDates() {
  return useQuery({ queryKey: keys.blocked, queryFn: api.fetchBlockedDates });
}

export function useGuests() {
  return useQuery({ queryKey: keys.guests, queryFn: api.fetchGuests });
}

export function useStayCommissions(stayId: string) {
  return useQuery({ queryKey: keys.stayCommissions(stayId), queryFn: () => api.fetchStayCommissions(stayId) });
}

export function useCommissionPayouts() {
  return useQuery({ queryKey: keys.payouts, queryFn: api.fetchCommissionPayouts });
}

export function useReferrers() {
  return useQuery({ queryKey: keys.referrers, queryFn: api.fetchReferrers });
}

/** Looks a guest up once a full phone number has been typed. */
export function useGuestByPhone(phone: string | null) {
  return useQuery({
    queryKey: keys.guestByPhone(phone ?? ''),
    queryFn: () => api.fetchGuestByPhone(phone!),
    enabled: phone !== null,
    staleTime: 10_000,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: keys.templates, queryFn: api.fetchTemplates });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.fetchSettings, staleTime: 5 * 60_000 });
}

// ---- Writes -----------------------------------------------------------------

/** A mutation that refreshes the given queries when it succeeds. */
function useWrite<A, R>(fn: (a: A) => Promise<R>, refresh: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(refresh.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

// Anything that changes money refreshes stays (stay_totals) and payments.
const MONEY: QueryKey[] = [keys.stays, ['payments'], ['charges']];
const GUESTS: QueryKey[] = [keys.guests, ['guest'], keys.stays];

export function useCreateBooking() {
  return useWrite((p: BookingPayload) => api.createBooking(p), [...MONEY, ...GUESTS, keys.referrers]);
}

export function useSetStatus() {
  return useWrite((a: { stayId: string; status: Parameters<typeof api.setStayStatus>[1] }) => api.setStayStatus(a.stayId, a.status), [keys.stays]);
}

export function useAddPayment() {
  return useWrite(api.addPayment, MONEY);
}

export function useVoidPayment() {
  return useWrite((a: { id: string; reason: string; by: string }) => api.voidPayment(a.id, a.reason, a.by), MONEY);
}

// Commission changes stay_totals (commission columns) and the commission lists.
const COMMISSION: QueryKey[] = [keys.stays, ['commissions']];

export function useAddCommission() {
  return useWrite(api.addCommission, COMMISSION);
}

export function useVoidCommission() {
  return useWrite((a: { id: string; reason: string; by: string }) => api.voidCommission(a.id, a.reason, a.by), COMMISSION);
}

export function useAddCommissionPayouts() {
  return useWrite(api.addCommissionPayouts, COMMISSION);
}

export function useVoidCommissionPayout() {
  return useWrite((a: { id: string; reason: string; by: string }) => api.voidCommissionPayout(a.id, a.reason, a.by), COMMISSION);
}

export function useAddCharge() {
  return useWrite(api.addCharge, MONEY);
}

export function useVoidCharge() {
  return useWrite((a: { id: string; reason: string; by: string }) => api.voidCharge(a.id, a.reason, a.by), MONEY);
}

export function useSaveIdCheck(stayId: string) {
  return useWrite(
    (a: { docType: Parameters<typeof api.saveIdCheck>[1]; last4: string | null; by: string }) => api.saveIdCheck(stayId, a.docType, a.last4, a.by),
    [keys.idCheck(stayId)],
  );
}

export function useRemoveIdCheck(stayId: string) {
  return useWrite(() => api.removeIdCheck(stayId), [keys.idCheck(stayId)]);
}

export function useAddBlocked() {
  return useWrite(api.addBlocked, [keys.blocked]);
}

export function useRemoveBlocked() {
  return useWrite(api.removeBlocked, [keys.blocked]);
}

export function useUpdateGuest() {
  return useWrite((a: { id: string; edit: Parameters<typeof api.updateGuest>[1] }) => api.updateGuest(a.id, a.edit), GUESTS);
}

export function useSetGuestLanguage() {
  return useWrite((a: { id: string; language: Parameters<typeof api.setGuestLanguage>[1] }) => api.setGuestLanguage(a.id, a.language), GUESTS);
}

export function useSetGuestArchived() {
  return useWrite((a: { id: string; archived: boolean }) => api.setGuestArchived(a.id, a.archived), GUESTS);
}

export function useAddTemplate() {
  return useWrite(api.addTemplate, [keys.templates]);
}

export function useArchiveTemplate() {
  return useWrite(api.archiveTemplate, [keys.templates]);
}

export function useSetReviewLink() {
  return useWrite(api.setReviewLink, [keys.settings]);
}
