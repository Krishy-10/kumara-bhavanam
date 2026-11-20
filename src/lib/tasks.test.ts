import { describe, expect, it } from 'vitest';
import type { ChecklistItemRow, ChecklistTickRow, StayRow, TaskRow } from '@/data/types';
import { arrivingSoon, checklistProgress, dueLabel, groupTasks, isForMe, reminders, stageFor, stageItems, taskError } from './tasks';

const today = '2026-11-21';

const stay = (over: Partial<StayRow>): StayRow => ({
  stay_id: 's1',
  guest_id: 'g1',
  guest_name: 'Guest',
  guest_phone: '+910000000101',
  bill_no: 'KB-2026-0001',
  check_in: '2026-11-22',
  check_out: '2026-11-24',
  guests_count: 4,
  status: 'confirmed',
  pricing_mode: 'per_night',
  nightly_rate: 5000,
  fixed_amount: null,
  occasion: null,
  sources: [],
  referrer_id: null,
  referrer_name: null,
  notes: null,
  created_at: '2026-11-01T10:00:00Z',
  created_by: 'Krishna Kumar',
  nights: 2,
  base: 10000,
  charges: 0,
  discounts: 0,
  final: 10000,
  paid: 0,
  refunded: 0,
  net_paid: 0,
  balance: 10000,
  commission_id: null,
  commission: 0,
  commission_paid: 0,
  commission_owed: 0,
  ...over,
});

const item = (id: string, stage: ChecklistItemRow['stage'], sort_order: number, archived = false): ChecklistItemRow => ({
  id,
  stage,
  label: id,
  sort_order,
  archived_at: archived ? '2026-11-01T00:00:00Z' : null,
  created_at: '2026-11-01T00:00:00Z',
  created_by: 'App setup',
});

const ITEMS = [item('mop', 'before_check_in', 10), item('water', 'before_check_in', 20), item('old', 'before_check_in', 5, true), item('keys', 'at_check_out', 10)];

const tick = (stay_id: string, item_id: string): ChecklistTickRow => ({ id: `${stay_id}-${item_id}`, stay_id, item_id, created_at: '2026-11-20T10:00:00Z', created_by: 'Padmanabhan' });

describe('checklists', () => {
  it('lists a stage in order, without removed items', () => {
    expect(stageItems(ITEMS, 'before_check_in').map((i) => i.id)).toEqual(['mop', 'water']);
    expect(stageItems(ITEMS, 'at_check_out').map((i) => i.id)).toEqual(['keys']);
  });

  it('counts only this stay’s ticks on items still on the list', () => {
    const p = checklistProgress(ITEMS, [tick('s1', 'mop'), tick('s1', 'old'), tick('s2', 'water'), tick('s1', 'keys')], 's1', 'before_check_in');
    expect([p.total, p.done, p.left]).toEqual([2, 1, 1]);
    expect(p.ticks.get('mop')?.created_by).toBe('Padmanabhan');
  });

  it('shows the getting-ready list before arrival and the leaving list after', () => {
    expect(stageFor('enquiry')).toBeNull();
    expect(stageFor('tentative')).toBe('before_check_in');
    expect(stageFor('confirmed')).toBe('before_check_in');
    expect(stageFor('checked_in')).toBe('at_check_out');
    expect(stageFor('completed')).toBe('at_check_out');
    expect(stageFor('cancelled')).toBeNull();
  });
});

describe('reminders', () => {
  const stays = [
    stay({ stay_id: 'tom', guest_name: 'Priya', check_in: '2026-11-22' }),
    stay({ stay_id: 'tod', guest_name: 'Ravi', check_in: today }),
    stay({ stay_id: 'later', check_in: '2026-11-23' }),
    stay({ stay_id: 'tent', status: 'tentative', check_in: today }),
    stay({ stay_id: 'ready', check_in: '2026-11-22', check_out: '2026-11-23' }),
    stay({ stay_id: 'in', status: 'checked_in', check_in: '2026-11-14', check_out: '2026-11-22', balance: 5000 }),
    stay({ stay_id: 'out', status: 'completed', check_in: '2026-11-01', check_out: '2026-11-03', balance: 1500 }),
    stay({ stay_id: 'settled', status: 'completed', check_in: '2026-10-01', check_out: '2026-10-03', balance: 0 }),
    stay({ stay_id: 'over', status: 'completed', check_in: '2026-10-05', check_out: '2026-10-06', balance: -500 }),
    stay({ stay_id: 'gone', status: 'cancelled', check_in: today, balance: 0 }),
  ];
  const ticks = [tick('tom', 'mop'), tick('ready', 'mop'), tick('ready', 'water')];

  it('finds confirmed stays arriving today or tomorrow', () => {
    expect(arrivingSoon(stays, today).map((s) => s.stay_id).sort()).toEqual(['ready', 'tod', 'tom']);
  });

  it('reminds to get ready (today first), then to collect, oldest check-out first', () => {
    const r = reminders(stays, ITEMS, ticks, today);
    expect(r.map((x) => x.key)).toEqual(['prep-tod', 'prep-tom', 'collect-out', 'collect-in']);
    expect(r[0]).toMatchObject({ kind: 'prep', when: 'today', left: 2, total: 2 });
    expect(r[1]).toMatchObject({ kind: 'prep', when: 'tomorrow', left: 1 });
    expect(r[3]).toMatchObject({ kind: 'collect', amount: 5000 });
  });

  it('has nothing to prepare when the list is empty', () => {
    expect(reminders(stays, [], [], today).filter((x) => x.kind === 'prep')).toEqual([]);
  });
});

const task = (over: Partial<TaskRow>): TaskRow => ({
  id: 't',
  title: 'Task',
  due_on: today,
  for_person: null,
  stay_id: null,
  done_at: null,
  done_by: null,
  created_at: '2026-11-18T10:00:00Z',
  created_by: 'Krishna Kumar',
  ...over,
});

describe('tasks', () => {
  it('groups open tasks by due date and lists done ones newest first', () => {
    const g = groupTasks(
      [
        task({ id: 'up2', due_on: '2026-11-30' }),
        task({ id: 'late', due_on: '2026-11-19' }),
        task({ id: 'now-b', created_at: '2026-11-19T10:00:00Z' }),
        task({ id: 'now-a' }),
        task({ id: 'up1', due_on: '2026-11-22' }),
        task({ id: 'd1', done_at: '2026-11-20T08:00:00Z', done_by: 'K' }),
        task({ id: 'd2', due_on: '2026-11-25', done_at: '2026-11-21T08:00:00Z', done_by: 'K' }),
      ],
      today,
    );
    expect(g.overdue.map((t) => t.id)).toEqual(['late']);
    expect(g.today.map((t) => t.id)).toEqual(['now-a', 'now-b']);
    expect(g.upcoming.map((t) => t.id)).toEqual(['up1', 'up2']);
    expect(g.done.map((t) => t.id)).toEqual(['d2', 'd1']);
  });

  it('treats a task for no one in particular as everyone’s', () => {
    expect(isForMe(task({ for_person: null }), 'Padmanabhan')).toBe(true);
    expect(isForMe(task({ for_person: 'Padmanabhan' }), 'Padmanabhan')).toBe(true);
    expect(isForMe(task({ for_person: 'Krishna Kumar' }), 'Padmanabhan')).toBe(false);
  });

  it('says when a task is due in words', () => {
    expect(dueLabel(today, today)).toBe('Today');
    expect(dueLabel('2026-11-22', today)).toBe('Tomorrow');
    expect(dueLabel('2026-11-20', today)).toBe('Late · yesterday');
    expect(dueLabel('2026-11-18', today)).toBe('Late · 18 Nov');
    expect(dueLabel('2026-11-24', today)).toBe('Tue, 24 Nov');
    expect(dueLabel('2026-12-05', today)).toBe('5 Dec');
  });

  it('checks the form', () => {
    expect(taskError('  ', today)).toMatch(/what needs doing/);
    expect(taskError('x'.repeat(201), today)).toMatch(/200/);
    expect(taskError('Buy gas', '')).toMatch(/date/);
    expect(taskError('Buy gas', today)).toBeNull();
  });
});
