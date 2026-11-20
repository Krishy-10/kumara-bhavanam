/**
 * Tasks, reminders and checklists: pure helpers, no data fetching.
 *
 * Reminders are never stored. They are worked out here from stays (the
 * stay_totals rows, so a balance is the view's figure, never re-added) and
 * checklist ticks. Nothing is sent anywhere; the app only shows them.
 * "Today" is always the IST date passed in (src/lib/dates.ts todayIST).
 */
import type { ChecklistItemRow, ChecklistStage, ChecklistTickRow, StayRow, TaskRow } from '@/data/types';
import { addDays, formatDayMonth, formatShortDay, type ISODate } from './dates';
import { DUE_NOW_STATUSES, type StayStatus } from './money';

export const CHECKLIST_STAGES: readonly ChecklistStage[] = ['before_check_in', 'at_check_out'];

export const STAGE_LABEL: Record<ChecklistStage, string> = {
  before_check_in: 'Before check-in',
  at_check_out: 'At check-out',
};

/** Done tasks stay in the list this many days, then drop off the screen (not deleted). */
export const DONE_KEEP_DAYS = 30;

/** The active items of one stage, in list order. */
export function stageItems(items: readonly ChecklistItemRow[], stage: ChecklistStage): ChecklistItemRow[] {
  return items
    .filter((i) => i.stage === stage && i.archived_at === null)
    .sort((a, b) => a.sort_order - b.sort_order || (a.created_at < b.created_at ? -1 : 1));
}

export interface ChecklistProgress {
  total: number;
  done: number;
  left: number;
  /** item id → its tick, for the items in this stage that are ticked. */
  ticks: Map<string, ChecklistTickRow>;
}

/** How far one stay is through one stage's list. Ticks on removed items don't count. */
export function checklistProgress(
  items: readonly ChecklistItemRow[],
  ticks: readonly ChecklistTickRow[],
  stayId: string,
  stage: ChecklistStage,
): ChecklistProgress {
  const list = stageItems(items, stage);
  const ids = new Set(list.map((i) => i.id));
  const map = new Map<string, ChecklistTickRow>();
  for (const t of ticks) if (t.stay_id === stayId && ids.has(t.item_id)) map.set(t.item_id, t);
  return { total: list.length, done: map.size, left: list.length - map.size, ticks: map };
}

/** Which checklist a stay shows: getting ready before arrival, or leaving. */
export function stageFor(status: StayStatus): ChecklistStage | null {
  switch (status) {
    case 'tentative':
    case 'confirmed':
      return 'before_check_in';
    case 'checked_in':
    case 'completed':
      return 'at_check_out';
    default:
      return null;
  }
}

/** Confirmed stays arriving today or tomorrow: the ones whose before-check-in ticks matter on Home. */
export function arrivingSoon(stays: readonly StayRow[], today: ISODate): StayRow[] {
  const tomorrow = addDays(today, 1);
  return stays.filter((s) => s.status === 'confirmed' && (s.check_in === today || s.check_in === tomorrow));
}

export type Reminder =
  | { kind: 'prep'; key: string; stay: StayRow; when: 'today' | 'tomorrow'; left: number; total: number }
  | { kind: 'collect'; key: string; stay: StayRow; amount: number };

/**
 * The two automatic reminders the owners chose:
 *   prep    a confirmed guest arrives today or tomorrow and the before-check-in list isn't finished
 *   collect a checked-in or checked-out stay still has a balance (the view's figure)
 * Arrivals first (today before tomorrow), then money by check-out date.
 */
export function reminders(
  stays: readonly StayRow[],
  items: readonly ChecklistItemRow[],
  ticks: readonly ChecklistTickRow[],
  today: ISODate,
): Reminder[] {
  const prep: Reminder[] = arrivingSoon(stays, today)
    .map((stay) => ({ stay, p: checklistProgress(items, ticks, stay.stay_id, 'before_check_in') }))
    .filter(({ p }) => p.left > 0)
    .sort((a, b) => (a.stay.check_in < b.stay.check_in ? -1 : 1))
    .map(({ stay, p }) => ({
      kind: 'prep' as const,
      key: `prep-${stay.stay_id}`,
      stay,
      when: stay.check_in === today ? ('today' as const) : ('tomorrow' as const),
      left: p.left,
      total: p.total,
    }));
  const collect: Reminder[] = stays
    .filter((s) => DUE_NOW_STATUSES.includes(s.status) && s.balance > 0)
    .sort((a, b) => (a.check_out < b.check_out ? -1 : a.check_out > b.check_out ? 1 : 0))
    .map((stay) => ({ kind: 'collect' as const, key: `collect-${stay.stay_id}`, stay, amount: stay.balance }));
  return [...prep, ...collect];
}

// ---- Tasks ------------------------------------------------------------------

export type TaskFilter = 'all' | 'mine';

/** A task with no one named is for both of them. */
export const isForMe = (t: Pick<TaskRow, 'for_person'>, user: string) => t.for_person === null || t.for_person === user;

export interface TaskGroups {
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
  /** Most recently done first. */
  done: TaskRow[];
}

export function groupTasks(tasks: readonly TaskRow[], today: ISODate): TaskGroups {
  const byDue = (a: TaskRow, b: TaskRow) => (a.due_on !== b.due_on ? (a.due_on < b.due_on ? -1 : 1) : a.created_at < b.created_at ? -1 : 1);
  const open = tasks.filter((t) => t.done_at === null).sort(byDue);
  return {
    overdue: open.filter((t) => t.due_on < today),
    today: open.filter((t) => t.due_on === today),
    upcoming: open.filter((t) => t.due_on > today),
    done: tasks.filter((t) => t.done_at !== null).sort((a, b) => (a.done_at! < b.done_at! ? 1 : -1)),
  };
}

/** "Today", "Tomorrow", "Late · 18 Nov", "Mon, 24 Nov". Late is said in words, not only colour. */
export function dueLabel(due: ISODate, today: ISODate): string {
  if (due === today) return 'Today';
  if (due === addDays(today, 1)) return 'Tomorrow';
  if (due < today) return due === addDays(today, -1) ? 'Late · yesterday' : `Late · ${formatDayMonth(due)}`;
  return due <= addDays(today, 6) ? formatShortDay(due) : formatDayMonth(due);
}

/** The first thing to fix in the task form, or null. */
export function taskError(title: string, due: string): string | null {
  if (!title.trim()) return 'Say what needs doing.';
  if (title.trim().length > 200) return 'Keep it under 200 letters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 'Pick a date.';
  return null;
}
