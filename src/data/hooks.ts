import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { addDays, monthRange, todayIST } from '@/lib/dates';
import { DONE_KEEP_DAYS } from '@/lib/tasks';
import * as api from './api';
import type { BookingPayload, ChecklistTickRow, TaskRow } from './types';

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
  checklistItems: ['checklist', 'items'] as const,
  ticks: (stayIds: readonly string[]) => ['checklist', 'ticks', [...stayIds].sort().join(',')] as const,
  tasks: ['tasks'] as const,
  expenses: ['expenses'] as const,
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

// ---- Checklists and tasks ---------------------------------------------------

export function useChecklistItems() {
  return useQuery({ queryKey: keys.checklistItems, queryFn: api.fetchChecklistItems, staleTime: 5 * 60_000 });
}

/** Ticks for these stays (one stay page, or the stays arriving soon). */
export function useTicks(stayIds: readonly string[]) {
  return useQuery({ queryKey: keys.ticks(stayIds), queryFn: () => api.fetchTicks(stayIds) });
}

/**
 * Ticks or unticks one item for one stay. The tick shows at once (every ticks
 * list that holds the stay is updated in place) and is put back if saving fails.
 */
export function useToggleTick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { stayId: string; itemId: string; by: string; ticked: boolean }) =>
      a.ticked ? api.addTick(a.stayId, a.itemId, a.by) : api.removeTick(a.stayId, a.itemId),
    onMutate: (a) => showTicks(qc, a.stayId, [a.itemId], a.by, a.ticked),
    onError: (_e, _a, ctx) => ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: TICKS }),
  });
}

/** "Tick all" (every unticked item of a list for one stay, in one save), or its undo. */
export function useTickAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { stayId: string; itemIds: string[]; by: string; ticked: boolean }) =>
      a.ticked ? api.addTicks(a.stayId, a.itemIds, a.by) : api.removeTicks(a.stayId, a.itemIds),
    onMutate: (a) => showTicks(qc, a.stayId, a.itemIds, a.by, a.ticked),
    onError: (_e, _a, ctx) => ctx?.before.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: TICKS }),
  });
}

const TICKS = ['checklist', 'ticks'];

/** Shows ticks added or removed at once, in every ticks list; returns what to put back on failure. */
async function showTicks(qc: ReturnType<typeof useQueryClient>, stayId: string, itemIds: string[], by: string, ticked: boolean) {
  await qc.cancelQueries({ queryKey: TICKS });
  const before = qc.getQueriesData<ChecklistTickRow[]>({ queryKey: TICKS });
  const now = new Date().toISOString();
  qc.setQueriesData<ChecklistTickRow[]>({ queryKey: TICKS }, (rows) => {
    if (!rows) return rows;
    const rest = rows.filter((t) => !(t.stay_id === stayId && itemIds.includes(t.item_id)));
    return ticked ? [...rest, ...itemIds.map((item_id) => ({ id: `pending-${item_id}`, stay_id: stayId, item_id, created_at: now, created_by: by }))] : rest;
  });
  return { before };
}

const CHECKLIST: QueryKey[] = [keys.checklistItems];

export function useAddChecklistItem() {
  return useWrite(api.addChecklistItem, CHECKLIST);
}

export function useRenameChecklistItem() {
  return useWrite((a: { id: string; label: string }) => api.renameChecklistItem(a.id, a.label), CHECKLIST);
}

export function useArchiveChecklistItem() {
  return useWrite(api.archiveChecklistItem, CHECKLIST);
}

export function useSetChecklistOrder() {
  return useWrite(api.setChecklistOrder, CHECKLIST);
}

/** Open tasks, plus those done in the last DONE_KEEP_DAYS days. */
export function useTasks() {
  return useQuery({ queryKey: keys.tasks, queryFn: () => api.fetchTasks(addDays(todayIST(), -DONE_KEEP_DAYS)) });
}

export function useAddTask() {
  return useWrite(api.addTask, [keys.tasks]);
}

export function useUpdateTask() {
  return useWrite((a: { id: string; edit: Parameters<typeof api.updateTask>[1] }) => api.updateTask(a.id, a.edit), [keys.tasks]);
}

export function useDeleteTask() {
  return useWrite(api.deleteTask, [keys.tasks]);
}

/** Ticks a task done (or not), showing it at once and undoing that if saving fails. */
export function useSetTaskDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { id: string; by: string | null }) => api.setTaskDone(a.id, a.by),
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const before = qc.getQueryData<TaskRow[]>(keys.tasks);
      qc.setQueryData<TaskRow[]>(keys.tasks, (rows) =>
        rows?.map((t) => (t.id === a.id ? { ...t, done_at: a.by ? new Date().toISOString() : null, done_by: a.by } : t)),
      );
      return { before };
    },
    onError: (_e, _a, ctx) => qc.setQueryData(keys.tasks, ctx?.before),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

// ---- Expenses ------------------------------------------------------------------

export function useExpenses() {
  return useQuery({ queryKey: keys.expenses, queryFn: api.fetchExpenses });
}

export function useAddExpense() {
  return useWrite(api.addExpense, [keys.expenses]);
}

export function useVoidExpense() {
  return useWrite((a: { id: string; reason: string; by: string }) => api.voidExpense(a.id, a.reason, a.by), [keys.expenses]);
}
